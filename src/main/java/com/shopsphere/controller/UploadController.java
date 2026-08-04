package com.shopsphere.controller;

import com.shopsphere.exception.BadRequestException;
import com.shopsphere.security.SecurityUtils;
import com.shopsphere.service.ImageStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/**
 * Avatar image upload (§15). Authenticated: {@link SecurityUtils#getCurrentUser()} resolves
 * (and requires) the logged-in user, whose id keys the stored image. Delegates the actual
 * storage to {@link ImageStorageService} (Cloudinary CDN, or local disk when not configured).
 */
@RestController
@RequestMapping("/api/upload")
@RequiredArgsConstructor
public class UploadController {

    private static final long MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    private static final long MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

    private final ImageStorageService imageStorageService;

    @PostMapping
    public ResponseEntity<Map<String, String>> uploadFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder", required = false) String folder,
            @RequestParam(value = "publicId", required = false) String publicId) {
        if (file.isEmpty()) {
            throw new BadRequestException("Please select a file to upload");
        }

        String contentType = file.getContentType();
        boolean isVideo = contentType != null && contentType.startsWith("video/");

        if (isVideo) {
            if (file.getSize() > MAX_VIDEO_SIZE) {
                throw new BadRequestException("Video size exceeds limit of 50MB");
            }
            if (!(contentType.equals("video/mp4") || contentType.equals("video/webm")
                    || contentType.equals("video/ogg") || contentType.equals("video/quicktime"))) {
                throw new BadRequestException("Only MP4, WebM, OGG, and MOV video types are allowed");
            }
        } else {
            if (file.getSize() > MAX_IMAGE_SIZE) {
                throw new BadRequestException("Image size exceeds limit of 10MB");
            }
            if (contentType == null || !(contentType.equals("image/jpeg") || contentType.equals("image/png")
                    || contentType.equals("image/gif") || contentType.equals("image/jpg"))) {
                throw new BadRequestException("Only JPEG, PNG, and GIF image types are allowed");
            }
        }

        String url = imageStorageService.store(file, folder, publicId);
        return ResponseEntity.ok(Map.of("url", url));
    }
}
