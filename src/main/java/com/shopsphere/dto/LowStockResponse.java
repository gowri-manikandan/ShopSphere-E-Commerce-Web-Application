package com.shopsphere.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/** A product at or below the low-stock threshold, for the dashboard alerts widget. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LowStockResponse {
    private Long productId;
    private String name;
    private int stockQuantity;
    private BigDecimal price;
    private String status; // OUT_OF_STOCK | LOW_STOCK
}
