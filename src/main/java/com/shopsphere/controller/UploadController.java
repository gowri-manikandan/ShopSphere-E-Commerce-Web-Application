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

    private static final long MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

    private final ImageStorageService imageStorageService;
    private final SecurityUtils securityUtils;

    @PostMapping
    public ResponseEntity<Map<String, String>> uploadFile(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new BadRequestException("Please select a file to upload");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new BadRequestException("File size exceeds limit of 2MB");
        }
        String contentType = file.getContentType();
        if (contentType == null || !(contentType.equals("image/jpeg") || contentType.equals("image/png")
                || contentType.equals("image/gif") || contentType.equals("image/jpg"))) {
            throw new BadRequestException("Only JPEG, PNG, and GIF image types are allowed");
        }

        String url = imageStorageService.store(file, securityUtils.getCurrentUser());
        return ResponseEntity.ok(Map.of("url", url));
    }
}
