package com.shopsphere.controller;

import com.shopsphere.dto.ApiMessage;
import com.shopsphere.dto.WishlistItemResponse;
import com.shopsphere.service.WishlistService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Wishlist endpoints (§13). Authenticated (falls under {@code anyRequest().authenticated()}) and
 * scoped to the current user via the service. Responses are wrapped by ApiResponseWrapper (§8).
 */
@RestController
@RequestMapping("/api/wishlist")
@RequiredArgsConstructor
public class WishlistController {

    private final WishlistService wishlistService;

    @GetMapping
    public ResponseEntity<List<WishlistItemResponse>> getMyWishlist() {
        return ResponseEntity.ok(wishlistService.getMyWishlist());
    }

    // Lightweight endpoint for the catalog to know which products are wishlisted.
    @GetMapping("/ids")
    public ResponseEntity<List<Long>> getMyProductIds() {
        return ResponseEntity.ok(wishlistService.getMyProductIds());
    }

    @PostMapping("/{productId}")
    public ResponseEntity<ApiMessage> add(@PathVariable Long productId) {
        wishlistService.add(productId);
        return ResponseEntity.ok(new ApiMessage("Added to wishlist"));
    }

    @DeleteMapping("/{productId}")
    public ResponseEntity<ApiMessage> remove(@PathVariable Long productId) {
        wishlistService.remove(productId);
        return ResponseEntity.ok(new ApiMessage("Removed from wishlist"));
    }
}
