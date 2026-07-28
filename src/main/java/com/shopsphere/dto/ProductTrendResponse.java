package com.shopsphere.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/** A single product's units-sold / revenue per month over a trailing window (zero-filled). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProductTrendResponse {
    private Long productId;
    private String productName;
    private long totalUnits;
    private BigDecimal totalRevenue;
    private List<MonthlyPoint> points;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MonthlyPoint {
        private String month; // "YYYY-MM"
        private long units;
        private BigDecimal revenue;
    }
}
