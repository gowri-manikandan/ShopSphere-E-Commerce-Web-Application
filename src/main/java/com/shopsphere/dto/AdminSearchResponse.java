package com.shopsphere.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** Grouped results for the admin global search bar (products / orders / customers). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminSearchResponse {
    private List<ProductHit> products;
    private List<OrderHit> orders;
    private List<CustomerHit> customers;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProductHit {
        private Long id;
        private String name;
        private BigDecimal price;
        private int stockQuantity;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OrderHit {
        private Long orderId;
        private String customerName;
        private String status;
        private BigDecimal totalAmount;
        private LocalDateTime orderDate;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CustomerHit {
        private Long id;
        private String name;
        private String email;
    }
}
