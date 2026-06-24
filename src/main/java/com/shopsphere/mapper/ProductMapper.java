package com.shopsphere.mapper;

import com.shopsphere.dto.ProductResponse;
import com.shopsphere.entity.Product;

public class ProductMapper {

    public static ProductResponse toResponse(Product p, Double averageRating) {
        return ProductResponse.builder()
                .id(p.getId())
                .name(p.getName())
                .description(p.getDescription())
                .price(p.getPrice())
                .stockQuantity(p.getStockQuantity())
                .imageUrl(p.getImageUrl())
                .categoryId(p.getCategory() != null ? p.getCategory().getId() : null)
                .categoryName(p.getCategory() != null ? p.getCategory().getName() : null)
                .averageRating(averageRating)
                .build();
    }
}
