package com.shopsphere.controller;

import com.shopsphere.dto.ReviewRequest;
import com.shopsphere.dto.ReviewResponse;
import com.shopsphere.service.ReviewService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/reviews")
@RequiredArgsConstructor
public class ReviewController {

    private final ReviewService reviewService;

    // Public: view reviews for a product
    @GetMapping("/product/{productId}")
    public ResponseEntity<List<ReviewResponse>> getByProduct(@PathVariable Long productId) {
        return ResponseEntity.ok(reviewService.getByProduct(productId));
    }

    // Authenticated: add or update your review
    @PostMapping
    public ResponseEntity<ReviewResponse> addOrUpdate(@Valid @RequestBody ReviewRequest request) {
        return ResponseEntity.ok(reviewService.addOrUpdate(request));
    }
}
