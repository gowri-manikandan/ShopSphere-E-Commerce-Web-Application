package com.shopsphere.service;

import com.shopsphere.config.CloudinaryConfig;
import com.shopsphere.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

/**
 * Stores uploaded avatar images (§15). Env-gated: when Cloudinary is configured the image
 * goes to the CDN and its absolute URL is returned; otherwise it falls back to the local
 * {@code frontend/uploads/} directory (the original behavior) so local dev needs no account.
 */
@Service
public class ImageStorageService {

    private static final Logger log = LoggerFactory.getLogger(ImageStorageService.class);

    private final CloudinaryConfig cloudinaryConfig;
    private final CloudinaryClient cloudinaryClient;
    private final String localDir;

    public ImageStorageService(CloudinaryConfig cloudinaryConfig,
                               CloudinaryClient cloudinaryClient,
                               @Value("${app.storage.local-dir:frontend/uploads/}") String localDir) {
        this.cloudinaryConfig = cloudinaryConfig;
        this.cloudinaryClient = cloudinaryClient;
        this.localDir = localDir.endsWith("/") ? localDir : localDir + "/";
    }

    public String store(MultipartFile file, User user) {
        try {
            if (cloudinaryConfig.isConfigured()) {
                try {
                    return cloudinaryClient.upload(file.getBytes(), file.getOriginalFilename(),
                            file.getContentType(), null);
                } catch (RuntimeException e) {
                    log.warn("Cloudinary upload failed ({}). Falling back to local storage. "
                            + "Check CLOUDINARY_* creds / connectivity if this happens in production.",
                            e.getMessage());
                }
            }
            return storeLocally(file);
        } catch (IOException e) {
            throw new RuntimeException("Failed to store file: " + e.getMessage(), e);
        }
    }

    /**
     * Store the given file with the specified folder and publicId.
     * Cloudinary → absolute URL; local → relative uploads/<uuid>.ext path.
     */
    public String store(MultipartFile file, String folder, String publicId) {
        try {
            if (cloudinaryConfig.isConfigured()) {
                try {
                    return cloudinaryClient.upload(file.getBytes(), file.getOriginalFilename(),
                            file.getContentType(), folder, publicId);
                } catch (RuntimeException e) {
                    log.warn("Cloudinary upload failed ({}). Falling back to local storage. "
                            + "Check CLOUDINARY_* creds / connectivity if this happens in production.",
                            e.getMessage());
                }
            }
            return storeLocally(file);
        } catch (IOException e) {
            throw new RuntimeException("Failed to store file: " + e.getMessage(), e);
        }
    }

    private String storeLocally(MultipartFile file) throws IOException {
        File folder = new File(localDir);
        if (!folder.exists()) {
            folder.mkdirs();
        }
        String original = file.getOriginalFilename();
        String extension = "";
        if (original != null && original.contains(".")) {
            extension = original.substring(original.lastIndexOf("."));
        }
        String newFilename = UUID.randomUUID() + extension;
        Path path = Paths.get(localDir + newFilename);
        Files.write(path, file.getBytes());
        // Relative path served by the static frontend origin (e.g. http://localhost:5500/uploads/..).
        return "uploads/" + newFilename;
    }
}
