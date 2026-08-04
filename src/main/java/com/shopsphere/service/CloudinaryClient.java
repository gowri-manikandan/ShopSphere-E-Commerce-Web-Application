package com.shopsphere.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shopsphere.config.CloudinaryConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/**
 * Thin Cloudinary REST client (§15) — the ONLY class that calls Cloudinary, so tests mock it.
 * Uses Java's built-in {@link HttpClient} + a hand-built multipart body + a SHA-1 signature
 * (no Cloudinary SDK), keeping the offline Maven build dependency-free.
 *
 * <p>Signed upload: params (excluding the file, api_key, cloud_name and signature) are sorted,
 * joined as {@code k=v&k=v}, the api secret appended, and SHA-1'd — exactly Cloudinary's
 * documented scheme.
 */
@Component
public class CloudinaryClient {

    private static final Logger log = LoggerFactory.getLogger(CloudinaryClient.class);

    private final CloudinaryConfig config;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public CloudinaryClient(CloudinaryConfig config, ObjectMapper objectMapper) {
        this.config = config;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public String upload(byte[] bytes, String filename, String contentType, String publicId) {
        return upload(bytes, filename, contentType, null, publicId);
    }

    /**
     * Upload a file (image, video, or other asset) to Cloudinary.
     * Uses custom folder if provided, and chooses the correct Cloudinary API endpoint based on content type.
     */
    public String upload(byte[] bytes, String filename, String contentType, String folder, String publicId) {
        long timestamp = System.currentTimeMillis() / 1000L;

        // Params that participate in the signature (sorted).
        TreeMap<String, String> signed = new TreeMap<>();
        
        String targetFolder = (folder != null && !folder.isBlank()) ? folder : config.getFolder();
        if (targetFolder != null && !targetFolder.isBlank()) {
            signed.put("folder", targetFolder);
        }
        if (publicId != null && !publicId.isBlank()) {
            signed.put("public_id", publicId);
        }
        signed.put("timestamp", String.valueOf(timestamp));
        String signature = sign(signed, config.getApiSecret());

        String boundary = "----ShopSphereBoundary" + UUID.randomUUID().toString().replace("-", "");
        byte[] body = buildMultipartBody(boundary, signed, signature, bytes, filename, contentType);

        // Dynamically choose API resource type endpoint based on content type
        String resourceType = "image";
        if (contentType != null && contentType.startsWith("video/")) {
            resourceType = "video";
        } else if (contentType != null && !contentType.startsWith("image/")) {
            resourceType = "auto";
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.cloudinary.com/v1_1/" + config.getCloudName() + "/" + resourceType + "/upload"))
                .timeout(Duration.ofSeconds(45)) // slightly longer timeout for videos
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new CloudinaryUploadException("Cloudinary upload failed ("
                        + response.statusCode() + "): " + extractError(response.body()));
            }
            String secureUrl = objectMapper.readTree(response.body()).path("secure_url").asText(null);
            if (secureUrl == null || secureUrl.isBlank()) {
                throw new CloudinaryUploadException("Cloudinary response had no secure_url");
            }
            return secureUrl;
        } catch (CloudinaryUploadException e) {
            throw e;
        } catch (Exception e) {
            log.error("Cloudinary upload failed", e);
            throw new CloudinaryUploadException("Could not reach Cloudinary: " + e.getMessage(), e);
        }
    }

    /** SHA-1 signature of the sorted params joined as {@code k=v&k=v} with the secret appended. */
    static String sign(Map<String, String> params, String apiSecret) {
        // Sort internally so the signature is correct regardless of the caller's map ordering
        // (Cloudinary requires the parameters signed in alphabetical order).
        String toSign = new TreeMap<>(params).entrySet().stream()
                .map(e -> e.getKey() + "=" + e.getValue())
                .reduce((a, b) -> a + "&" + b)
                .orElse("");
        try {
            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            byte[] digest = sha1.digest((toSign + apiSecret).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Unable to compute SHA-1 signature", e);
        }
    }

    private byte[] buildMultipartBody(String boundary, Map<String, String> signedParams,
                                      String signature, byte[] fileBytes, String filename,
                                      String contentType) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            for (Map.Entry<String, String> e : signedParams.entrySet()) {
                writeTextPart(out, boundary, e.getKey(), e.getValue());
            }
            writeTextPart(out, boundary, "api_key", config.getApiKey());
            writeTextPart(out, boundary, "signature", signature);

            // File part
            out.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
            out.write(("Content-Disposition: form-data; name=\"file\"; filename=\""
                    + (filename == null ? "upload" : filename) + "\"\r\n").getBytes(StandardCharsets.UTF_8));
            out.write(("Content-Type: " + (contentType == null ? "application/octet-stream" : contentType)
                    + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            out.write(fileBytes);
            out.write("\r\n".getBytes(StandardCharsets.UTF_8));

            out.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            return out.toByteArray();
        } catch (IOException e) {
            throw new CloudinaryUploadException("Failed to build upload request", e);
        }
    }

    private void writeTextPart(ByteArrayOutputStream out, String boundary, String name, String value)
            throws IOException {
        out.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n")
                .getBytes(StandardCharsets.UTF_8));
        out.write(value.getBytes(StandardCharsets.UTF_8));
        out.write("\r\n".getBytes(StandardCharsets.UTF_8));
    }

    private String extractError(String responseBody) {
        try {
            JsonNode desc = objectMapper.readTree(responseBody).path("error").path("message");
            return desc.isMissingNode() ? responseBody : desc.asText();
        } catch (Exception ignored) {
            return responseBody;
        }
    }

    /** Thrown when a Cloudinary upload fails; surfaced as a 500 via the global handler. */
    public static class CloudinaryUploadException extends RuntimeException {
        public CloudinaryUploadException(String message) {
            super(message);
        }

        public CloudinaryUploadException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
