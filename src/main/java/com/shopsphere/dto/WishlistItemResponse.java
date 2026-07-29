package com.shopsphere.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** A wishlist entry with an embedded product summary (§13). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WishlistItemResponse {
    private Long productId;
    private String name;
    private BigDecimal price;
    private String imageUrl;
    private Integer stockQuantity;
    private LocalDateTime addedAt;
}
