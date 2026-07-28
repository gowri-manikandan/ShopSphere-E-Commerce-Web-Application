package com.shopsphere.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Overview cards for the admin dashboard (§ dashboard). Revenue excludes CANCELLED orders. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OverviewResponse {
    private BigDecimal allTimeRevenue;
    private BigDecimal periodRevenue;
    private long periodOrders;
    private long totalCustomers;
    private BigDecimal averageOrderValue; // period revenue / period orders
    private LocalDate from;
    private LocalDate to;
}
