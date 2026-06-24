package com.shopsphere.mapper;

import com.shopsphere.dto.CategoryResponse;
import com.shopsphere.entity.Category;

public class CategoryMapper {

    public static CategoryResponse toResponse(Category c) {
        return CategoryResponse.builder()
                .id(c.getId())
                .name(c.getName())
                .description(c.getDescription())
                .build();
    }
}
