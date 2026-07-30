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
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long categoryId) {
        return ResponseEntity.ok(analyticsService.getOverview(from, to, categoryId));
    }

    @GetMapping("/sales-report")
    public ResponseEntity<SalesReportResponse> salesReport(
            @RequestParam(required = false) String month,
            @RequestParam(required = false) Long categoryId) {
        return ResponseEntity.ok(analyticsService.getSalesReport(month, categoryId));
    }

    @GetMapping("/top-products")
    public ResponseEntity<List<TopProductResponse>> topProducts(
            @RequestParam(required = false) String month,
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(defaultValue = "units") String sortBy,
            @RequestParam(required = false) Long categoryId) {
        return ResponseEntity.ok(analyticsService.getTopProducts(month, limit, sortBy, categoryId));
    }

    @GetMapping("/product-trend")
    public ResponseEntity<ProductTrendResponse> productTrend(
            @RequestParam Long productId,
            @RequestParam(defaultValue = "12") int months,
            @RequestParam(required = false) Long categoryId) {
        return ResponseEntity.ok(analyticsService.getProductTrend(productId, months, categoryId));
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
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long categoryId) {
        return ResponseEntity.ok(analyticsService.getRecentOrders(page, size, status, categoryId));
    }

    @GetMapping(value = "/sales-report/export", produces = "text/csv")
    public ResponseEntity<String> exportSalesReport(
            @RequestParam(required = false) String month,
            @RequestParam(required = false) Long categoryId) {
        SalesReportResponse report = analyticsService.getSalesReport(month, categoryId);
        String csv = analyticsService.toSalesReportCsv(report);
        String filename = "sales-report-" + report.getMonth() + (categoryId != null ? "-cat-" + categoryId : "") + ".csv";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(csv);
    }

    @GetMapping(value = "/sales-report/export-pdf", produces = "application/pdf")
    public ResponseEntity<byte[]> exportSalesReportPdf(
            @RequestParam(required = false) String month,
            @RequestParam(required = false) Long categoryId) {
        byte[] pdf = analyticsService.generateAnalyticsPdf(month, categoryId);
        String filename = "sales-report-" + (month != null ? month.trim() : "current") + (categoryId != null ? "-cat-" + categoryId : "") + ".pdf";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }
}
