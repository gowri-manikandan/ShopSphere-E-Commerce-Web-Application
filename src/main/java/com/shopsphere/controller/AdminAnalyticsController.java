package com.shopsphere.controller;

import com.shopsphere.dto.*;
import com.shopsphere.service.AdminAnalyticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * Admin analytics API (§ dashboard). All endpoints ADMIN-only (also enforced by SecurityConfig's
 * {@code /api/admin/**} rule). Aggregation happens in SQL via {@link AdminAnalyticsService}.
 */
@RestController
@RequestMapping("/api/admin/analytics")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminAnalyticsController {

    private final AdminAnalyticsService analyticsService;

    @GetMapping("/overview")
    public ResponseEntity<OverviewResponse> overview(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(analyticsService.getOverview(from, to));
    }

    @GetMapping("/sales-report")
    public ResponseEntity<SalesReportResponse> salesReport(
            @RequestParam(required = false) String month) {
        return ResponseEntity.ok(analyticsService.getSalesReport(month));
    }

    @GetMapping("/top-products")
    public ResponseEntity<List<TopProductResponse>> topProducts(
            @RequestParam(required = false) String month,
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(defaultValue = "units") String sortBy) {
        return ResponseEntity.ok(analyticsService.getTopProducts(month, limit, sortBy));
    }

    @GetMapping("/product-trend")
    public ResponseEntity<ProductTrendResponse> productTrend(
            @RequestParam Long productId,
            @RequestParam(defaultValue = "12") int months) {
        return ResponseEntity.ok(analyticsService.getProductTrend(productId, months));
    }

    @GetMapping("/low-stock")
    public ResponseEntity<List<LowStockResponse>> lowStock(
            @RequestParam(required = false) Integer threshold) {
        return ResponseEntity.ok(analyticsService.getLowStock(threshold));
    }

    @GetMapping("/recent-orders")
    public ResponseEntity<PagedResponse<OrderResponse>> recentOrders(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(analyticsService.getRecentOrders(page, size, status));
    }

    @GetMapping(value = "/sales-report/export", produces = "text/csv")
    public ResponseEntity<String> exportSalesReport(@RequestParam(required = false) String month) {
        SalesReportResponse report = analyticsService.getSalesReport(month);
        String csv = analyticsService.toSalesReportCsv(report);
        String filename = "sales-report-" + report.getMonth() + ".csv";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(csv);
    }
}
