package com.shopsphere.mapper;

import com.shopsphere.dto.WishlistItemResponse;
import com.shopsphere.entity.Product;
import com.shopsphere.entity.WishlistItem;

/** Maps a {@link WishlistItem} (+ its product) to the API response. Static utility, no MapStruct. */
public class WishlistMapper {

    public static WishlistItemResponse toResponse(WishlistItem item) {
        Product p = item.getProduct();
        return WishlistItemResponse.builder()
                .productId(p != null ? p.getId() : null)
                .name(p != null ? p.getName() : "Deleted Product")
                .price(p != null ? p.getPrice() : null)
                .imageUrl(p != null ? p.getImageUrl() : null)
                .stockQuantity(p != null ? p.getStockQuantity() : null)
                .addedAt(item.getAddedAt())
                .build();
    }
}
