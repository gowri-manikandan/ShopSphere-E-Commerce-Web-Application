package com.shopsphere.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shopsphere.config.RazorpayConfig;
import com.shopsphere.exception.PaymentException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;

/**
 * Thin Razorpay REST client (§9) — the ONLY class that makes outbound calls to Razorpay, so
 * tests mock it. Uses Java's built-in {@link HttpClient} + Jackson (no Razorpay SDK), keeping
 * the offline Maven build dependency-free.
 *
 * <p>Note: these calls fail on machines that can't reach Razorpay over HTTPS (the corp-cert
 * PKIX issue) — that's why {@code OrderService} only invokes this when Razorpay is configured
 * and otherwise falls back to a mock success locally.
 */
@Component
public class RazorpayClient {

    private static final Logger log = LoggerFactory.getLogger(RazorpayClient.class);
    private static final String BASE_URL = "https://api.razorpay.com/v1";

    private final RazorpayConfig config;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public RazorpayClient(RazorpayConfig config, ObjectMapper objectMapper) {
        this.config = config;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /** Create a Razorpay order and return its id (order_...). */
    public String createOrder(long amountPaise, String currency, String receipt, Map<String, String> notes) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("amount", amountPaise);
        body.put("currency", currency);
        body.put("receipt", receipt);
        body.put("payment_capture", true); // auto-capture on success
        if (notes != null && !notes.isEmpty()) {
            ObjectNode notesNode = body.putObject("notes");
            notes.forEach(notesNode::put);
        }
        JsonNode response = post("/orders", body.toString());
        return response.path("id").asText();
    }

    /** Issue a full refund for a captured payment. */
    public void refund(String razorpayPaymentId) {
        post("/payments/" + razorpayPaymentId + "/refund", "{}");
    }

    private JsonNode post(String path, String jsonBody) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + path))
                .timeout(Duration.ofSeconds(20))
                .header("Authorization", basicAuth())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                String message = extractError(response.body());
                throw new PaymentException("Razorpay request failed (" + response.statusCode()
                        + "): " + message);
            }
            return objectMapper.readTree(response.body());
        } catch (PaymentException e) {
            throw e;
        } catch (Exception e) {
            log.error("Razorpay call to {} failed", path, e);
            throw new PaymentException("Could not reach the payment gateway: " + e.getMessage(), e);
        }
    }

    private String basicAuth() {
        String creds = config.getKeyId() + ":" + config.getKeySecret();
        return "Basic " + Base64.getEncoder().encodeToString(creds.getBytes(StandardCharsets.UTF_8));
    }

    private String extractError(String responseBody) {
        try {
            JsonNode node = objectMapper.readTree(responseBody);
            JsonNode desc = node.path("error").path("description");
            return desc.isMissingNode() ? responseBody : desc.asText();
        } catch (Exception ignored) {
            return responseBody;
        }
    }
}
