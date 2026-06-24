package com.shopsphere.mapper;

import com.shopsphere.dto.ReviewResponse;
import com.shopsphere.entity.Review;

public class ReviewMapper {

    public static ReviewResponse toResponse(Review r) {
        return ReviewResponse.builder()
                .id(r.getId())
                .productId(r.getProduct().getId())
                .userName(r.getUser().getName())
                .rating(r.getRating())
                .comment(r.getComment())
                .createdAt(r.getCreatedAt())
                .build();
    }
}
