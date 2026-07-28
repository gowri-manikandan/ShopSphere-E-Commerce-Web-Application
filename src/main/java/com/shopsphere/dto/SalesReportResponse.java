package com.shopsphere.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Sales report for a single month: daily breakdown (zero-filled), month totals, and the
 * percentage change in revenue versus the previous month.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SalesReportResponse {
    private String month;              // "YYYY-MM"
    private BigDecimal totalRevenue;
    private long orderCount;
    private BigDecimal prevMonthRevenue;
    private Double revenueChangePct;   // null when previous month had no revenue
    private List<DailySales> daily;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DailySales {
        private LocalDate date;
        private BigDecimal revenue;
        private long orders;
    }
}
