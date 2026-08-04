package com.shopsphere.service;

import com.shopsphere.dto.*;
import com.shopsphere.entity.Order;
import com.shopsphere.entity.OrderStatus;
import com.shopsphere.entity.Product;
import com.shopsphere.entity.Role;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.mapper.OrderMapper;
import com.shopsphere.repository.OrderItemRepository;
import com.shopsphere.repository.OrderRepository;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.repository.UserRepository;
import com.shopsphere.repository.CategoryRepository;
import com.shopsphere.utils.SimplePdfWriter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Query-backed analytics for the admin dashboard (§ dashboard). All aggregation is done in SQL
 * (see the repository @Query methods); this service only assembles responses — date windows,
 * zero-filling gaps, prev-period comparison, CSV formatting. Revenue everywhere excludes
 * CANCELLED orders.
 */
@Service
public class AdminAnalyticsService {

    private static final DateTimeFormatter MONTH_FMT = DateTimeFormatter.ofPattern("yyyy-MM");

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final CategoryRepository categoryRepository;
    private final int defaultLowStockThreshold;

    public AdminAnalyticsService(OrderRepository orderRepository,
                                 OrderItemRepository orderItemRepository,
                                 ProductRepository productRepository,
                                 UserRepository userRepository,
                                 CategoryRepository categoryRepository,
                                 @Value("${app.stock.low-threshold:5}") int defaultLowStockThreshold) {
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
        this.categoryRepository = categoryRepository;
        this.defaultLowStockThreshold = defaultLowStockThreshold;
    }

    // ----- Overview cards -----

    @Transactional(readOnly = true)
    public OverviewResponse getOverview(LocalDate from, LocalDate to) {
        return getOverview(from, to, null);
    }

    @Transactional(readOnly = true)
    public OverviewResponse getOverview(LocalDate from, LocalDate to, Long categoryId) {
        if (from == null || to == null) {
            YearMonth now = YearMonth.now();
            from = now.atDay(1);
            to = now.atEndOfMonth();
        }
        if (to.isBefore(from)) {
            throw new BadRequestException("'to' date must not be before 'from' date");
        }
        LocalDateTime start = from.atStartOfDay();
        LocalDateTime end = to.atTime(LocalTime.MAX);

        BigDecimal periodRevenue = categoryId == null
                ? nz(orderRepository.revenueBetween(start, end))
                : nz(orderItemRepository.revenueBetweenByCategoryId(start, end, categoryId));
        
        long periodOrders = categoryId == null
                ? orderRepository.countByStatusNotAndOrderDateBetween(OrderStatus.CANCELLED, start, end)
                : orderItemRepository.countOrdersBetweenByCategoryId(start, end, categoryId);

        BigDecimal avg = periodOrders > 0
                ? periodRevenue.divide(BigDecimal.valueOf(periodOrders), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        BigDecimal allTimeRevenue = categoryId == null
                ? nz(orderRepository.calculateTotalRevenue())
                : nz(orderItemRepository.calculateTotalRevenueByCategoryId(categoryId));

        return OverviewResponse.builder()
                .allTimeRevenue(allTimeRevenue)
                .periodRevenue(periodRevenue)
                .periodOrders(periodOrders)
                .totalCustomers(userRepository.countByRole(Role.CUSTOMER))
                .averageOrderValue(avg)
                .from(from)
                .to(to)
                .build();
    }

    // ----- Sales report (month) -----

    @Transactional(readOnly = true)
    public SalesReportResponse getSalesReport(String month) {
        return getSalesReport(month, null);
    }

    @Transactional(readOnly = true)
    public SalesReportResponse getSalesReport(String month, Long categoryId) {
        YearMonth ym = parseMonth(month);
        LocalDateTime start = ym.atDay(1).atStartOfDay();
        LocalDateTime end = ym.atEndOfMonth().atTime(LocalTime.MAX);

        // Daily rows keyed by date.
        Map<LocalDate, long[]> orderCounts = new HashMap<>();
        Map<LocalDate, BigDecimal> revenues = new HashMap<>();
        List<Object[]> rows = categoryId == null
                ? orderRepository.dailySalesBetween(start, end)
                : orderItemRepository.dailySalesBetweenByCategoryId(start, end, categoryId);

        for (Object[] row : rows) {
            LocalDate day = ((Date) row[0]).toLocalDate();
            revenues.put(day, nz((BigDecimal) row[1]));
            orderCounts.put(day, new long[]{((Number) row[2]).longValue()});
        }

        List<SalesReportResponse.DailySales> daily = new ArrayList<>();
        for (int d = 1; d <= ym.lengthOfMonth(); d++) {
            LocalDate day = ym.atDay(d);
            daily.add(SalesReportResponse.DailySales.builder()
                    .date(day)
                    .revenue(revenues.getOrDefault(day, BigDecimal.ZERO))
                    .orders(orderCounts.containsKey(day) ? orderCounts.get(day)[0] : 0L)
                    .build());
        }

        BigDecimal total = categoryId == null
                ? nz(orderRepository.revenueBetween(start, end))
                : nz(orderItemRepository.revenueBetweenByCategoryId(start, end, categoryId));

        long orderCount = categoryId == null
                ? orderRepository.countByStatusNotAndOrderDateBetween(OrderStatus.CANCELLED, start, end)
                : orderItemRepository.countOrdersBetweenByCategoryId(start, end, categoryId);

        YearMonth prev = ym.minusMonths(1);
        BigDecimal prevRevenue = categoryId == null
                ? nz(orderRepository.revenueBetween(prev.atDay(1).atStartOfDay(), prev.atEndOfMonth().atTime(LocalTime.MAX)))
                : nz(orderItemRepository.revenueBetweenByCategoryId(prev.atDay(1).atStartOfDay(), prev.atEndOfMonth().atTime(LocalTime.MAX), categoryId));

        Double changePct = prevRevenue.signum() == 0
                ? null // no baseline to compare against
                : total.subtract(prevRevenue)
                        .divide(prevRevenue, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                        .doubleValue();

        return SalesReportResponse.builder()
                .month(ym.format(MONTH_FMT))
                .totalRevenue(total)
                .orderCount(orderCount)
                .prevMonthRevenue(prevRevenue)
                .revenueChangePct(changePct)
                .daily(daily)
                .build();
    }

    // ----- Top products (month) -----

    @Transactional(readOnly = true)
    public List<TopProductResponse> getTopProducts(String month, int limit, String sortBy) {
        return getTopProducts(month, limit, sortBy, null);
    }

    @Transactional(readOnly = true)
    public List<TopProductResponse> getTopProducts(String month, int limit, String sortBy, Long categoryId) {
        YearMonth ym = parseMonth(month);
        LocalDateTime start = ym.atDay(1).atStartOfDay();
        LocalDateTime end = ym.atEndOfMonth().atTime(LocalTime.MAX);
        Pageable page = PageRequest.of(0, Math.max(1, Math.min(limit, 100)));

        List<Object[]> rows;
        if (categoryId == null) {
            rows = "revenue".equalsIgnoreCase(sortBy)
                    ? orderItemRepository.topProductsByRevenue(start, end, page)
                    : orderItemRepository.topProductsByUnits(start, end, page);
        } else {
            rows = "revenue".equalsIgnoreCase(sortBy)
                    ? orderItemRepository.topProductsByRevenueAndCategoryId(start, end, categoryId, page)
                    : orderItemRepository.topProductsByUnitsAndCategoryId(start, end, categoryId, page);
        }

        List<TopProductResponse> result = new ArrayList<>();
        for (Object[] r : rows) {
            result.add(TopProductResponse.builder()
                    .productId((Long) r[0])
                    .productName((String) r[1])
                    .unitsSold(((Number) r[2]).longValue())
                    .revenue(nz((BigDecimal) r[3]))
                    .build());
        }
        return result;
    }

    // ----- Product sales trend (trailing months) -----

    @Transactional(readOnly = true)
    public ProductTrendResponse getProductTrend(Long productId, int months) {
        return getProductTrend(productId, months, null);
    }

    @Transactional(readOnly = true)
    public ProductTrendResponse getProductTrend(Long productId, int months, Long categoryId) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + productId));
        if (categoryId != null && !product.getCategory().getId().equals(categoryId)) {
            throw new BadRequestException("Product does not belong to the selected category");
        }
        int window = Math.max(1, Math.min(months, 36));

        YearMonth current = YearMonth.now();
        YearMonth first = current.minusMonths(window - 1L);
        LocalDateTime start = first.atDay(1).atStartOfDay();
        LocalDateTime end = current.atEndOfMonth().atTime(LocalTime.MAX);

        Map<String, long[]> units = new HashMap<>();
        Map<String, BigDecimal> revenue = new HashMap<>();
        for (Object[] row : orderItemRepository.productMonthlyTrend(productId, start, end)) {
            String key = (String) row[0]; // "yyyy-MM"
            units.put(key, new long[]{((Number) row[1]).longValue()});
            revenue.put(key, nz((BigDecimal) row[2]));
        }

        List<ProductTrendResponse.MonthlyPoint> points = new ArrayList<>();
        long totalUnits = 0;
        BigDecimal totalRevenue = BigDecimal.ZERO;
        for (int i = 0; i < window; i++) {
            String key = first.plusMonths(i).format(MONTH_FMT);
            long u = units.containsKey(key) ? units.get(key)[0] : 0L;
            BigDecimal rev = revenue.getOrDefault(key, BigDecimal.ZERO);
            totalUnits += u;
            totalRevenue = totalRevenue.add(rev);
            points.add(ProductTrendResponse.MonthlyPoint.builder()
                    .month(key).units(u).revenue(rev).build());
        }

        return ProductTrendResponse.builder()
                .productId(product.getId())
                .productName(product.getName())
                .totalUnits(totalUnits)
                .totalRevenue(totalRevenue)
                .points(points)
                .build();
    }

    // ----- Low stock -----

    @Transactional(readOnly = true)
    public List<LowStockResponse> getLowStock(Integer threshold) {
        int t = threshold != null ? threshold : defaultLowStockThreshold;
        List<LowStockResponse> result = new ArrayList<>();
        for (Product p : productRepository.findByStockQuantityLessThanEqualOrderByStockQuantityAsc(t)) {
            result.add(LowStockResponse.builder()
                    .productId(p.getId())
                    .name(p.getName())
                    .stockQuantity(p.getStockQuantity())
                    .price(p.getPrice())
                    .status(p.getStockQuantity() <= 0 ? "OUT_OF_STOCK" : "LOW_STOCK")
                    .build());
        }
        return result;
    }

    // ----- Recent orders (paginated) -----

    @Transactional(readOnly = true)
    public PagedResponse<OrderResponse> getRecentOrders(int page, int size, String status) {
        return getRecentOrders(page, size, status, null);
    }

    @Transactional(readOnly = true)
    public PagedResponse<OrderResponse> getRecentOrders(int page, int size, String status, Long categoryId) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 100)),
                Sort.by("orderDate").descending());
        
        Page<Order> orders;
        if (status == null || status.isBlank()) {
            orders = categoryId == null
                    ? orderRepository.findAll(pageable)
                    : orderRepository.findDistinctByItemsProductCategoryId(categoryId, pageable);
        } else {
            OrderStatus orderStatus = parseStatus(status);
            orders = categoryId == null
                    ? orderRepository.findByStatus(orderStatus, pageable)
                    : orderRepository.findDistinctByStatusAndItemsProductCategoryId(orderStatus, categoryId, pageable);
        }
        return PagedResponse.from(orders, orders.getContent().stream()
                .map(OrderMapper::toResponse).toList());
    }

    // ----- CSV export -----

    public String toSalesReportCsv(SalesReportResponse report) {
        StringBuilder sb = new StringBuilder("date,revenue,orders\n");
        for (SalesReportResponse.DailySales d : report.getDaily()) {
            sb.append(d.getDate()).append(',')
                    .append(d.getRevenue().toPlainString()).append(',')
                    .append(d.getOrders()).append('\n');
        }
        sb.append("TOTAL,").append(report.getTotalRevenue().toPlainString())
                .append(',').append(report.getOrderCount()).append('\n');
        return sb.toString();
    }

    // ----- helpers -----

    private YearMonth parseMonth(String month) {
        if (month == null || month.isBlank()) {
            return YearMonth.now();
        }
        try {
            return YearMonth.parse(month.trim(), MONTH_FMT);
        } catch (Exception e) {
            throw new BadRequestException("Invalid month '" + month + "'. Expected format YYYY-MM.");
        }
    }

    private OrderStatus parseStatus(String status) {
        try {
            return OrderStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid order status: " + status);
        }
    }

    private BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    @Transactional(readOnly = true)
    public byte[] generateAnalyticsPdf(String month, Long categoryId) {
        YearMonth ym = parseMonth(month);
        LocalDateTime start = ym.atDay(1).atStartOfDay();
        LocalDateTime end = ym.atEndOfMonth().atTime(LocalTime.MAX);

        // 1. Fetch metadata
        String monthStr = ym.format(MONTH_FMT);
        String categoryName = "All Categories";
        if (categoryId != null) {
            categoryName = categoryRepository.findById(categoryId)
                    .map(com.shopsphere.entity.Category::getName)
                    .orElse("Unknown Category");
        }

        // 2. Fetch data
        BigDecimal periodRevenue = categoryId == null
                ? nz(orderRepository.revenueBetween(start, end))
                : nz(orderItemRepository.revenueBetweenByCategoryId(start, end, categoryId));

        long periodOrders = categoryId == null
                ? orderRepository.countByStatusNotAndOrderDateBetween(OrderStatus.CANCELLED, start, end)
                : orderItemRepository.countOrdersBetweenByCategoryId(start, end, categoryId);

        BigDecimal avg = periodOrders > 0
                ? periodRevenue.divide(BigDecimal.valueOf(periodOrders), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        Pageable topPage = PageRequest.of(0, 10);
        List<Object[]> topRows = categoryId == null
                ? orderItemRepository.topProductsByUnits(start, end, topPage)
                : orderItemRepository.topProductsByUnitsAndCategoryId(start, end, categoryId, topPage);

        List<Object[]> trendRows = categoryId == null
                ? orderRepository.dailySalesBetween(start, end)
                : orderItemRepository.dailySalesBetweenByCategoryId(start, end, categoryId);

        // 3. Assemble PDF content stream
        StringBuilder sb = new StringBuilder();
        float y = 800;

        // Draw border
        sb.append("0.5 w\n");
        sb.append("50 820 m 545 820 l S\n");
        sb.append("50 50 m 545 50 l S\n");

        // Header
        y -= 25;
        drawText(sb, "Sri Maruthi textiles Super Admin Report", 50, y, 20);
        y -= 20;
        drawText(sb, "Analytics Report for Period: " + monthStr, 50, y, 12);
        y -= 15;
        drawText(sb, "Filtered by Category: " + categoryName, 50, y, 12);

        // Horizontal line under header
        y -= 10;
        sb.append("50 ").append(y).append(" m 545 ").append(y).append(" l S\n");

        // Overview Section
        y -= 30;
        drawText(sb, "OVERVIEW METRICS", 50, y, 14);
        y -= 20;
        drawText(sb, "Revenue: Rs. " + periodRevenue.setScale(2, RoundingMode.HALF_UP).toPlainString(), 55, y, 11);
        y -= 15;
        drawText(sb, "Total Orders: " + periodOrders, 55, y, 11);
        y -= 15;
        drawText(sb, "Average Order Value: Rs. " + avg.setScale(2, RoundingMode.HALF_UP).toPlainString(), 55, y, 11);

        // Horizontal line under overview
        y -= 20;
        sb.append("50 ").append(y).append(" m 545 ").append(y).append(" l S\n");

        // Top Selling Products Section
        y -= 25;
        drawText(sb, "TOP SELLING PRODUCTS (MAX 10)", 50, y, 14);
        y -= 20;

        // Table Header
        sb.append("50 ").append(y).append(" m 545 ").append(y).append(" l S\n");
        y -= 15;
        drawText(sb, "Product ID", 60, y, 10);
        drawText(sb, "Product Name", 150, y, 10);
        drawText(sb, "Units Sold", 400, y, 10);
        drawText(sb, "Revenue", 470, y, 10);
        y -= 5;
        sb.append("50 ").append(y).append(" m 545 ").append(y).append(" l S\n");

        // Table Rows
        for (Object[] r : topRows) {
            y -= 15;
            drawText(sb, String.valueOf(r[0]), 60, y, 9);
            String name = (String) r[1];
            if (name.length() > 35) name = name.substring(0, 32) + "...";
            drawText(sb, name, 150, y, 9);
            drawText(sb, String.valueOf(r[2]), 400, y, 9);
            drawText(sb, "Rs. " + nz((BigDecimal) r[3]).setScale(2, RoundingMode.HALF_UP).toPlainString(), 470, y, 9);
        }
        y -= 5;
        sb.append("50 ").append(y).append(" m 545 ").append(y).append(" l S\n");

        // Sales Trend Section
        y -= 25;
        drawText(sb, "DAILY SALES TREND", 50, y, 14);
        y -= 20;

        // Table Header
        sb.append("50 ").append(y).append(" m 545 ").append(y).append(" l S\n");
        y -= 15;
        drawText(sb, "Date", 60, y, 10);
        drawText(sb, "Orders Count", 200, y, 10);
        drawText(sb, "Daily Revenue", 400, y, 10);
        y -= 5;
        sb.append("50 ").append(y).append(" m 545 ").append(y).append(" l S\n");

        // Table Rows
        int trendCount = 0;
        for (Object[] r : trendRows) {
            if (trendCount >= 15) {
                y -= 15;
                drawText(sb, "... and " + (trendRows.size() - 15) + " more daily rows", 60, y, 9);
                break;
            }
            y -= 15;
            drawText(sb, String.valueOf(r[0]), 60, y, 9);
            drawText(sb, String.valueOf(r[2]), 200, y, 9);
            drawText(sb, "Rs. " + nz((BigDecimal) r[1]).setScale(2, RoundingMode.HALF_UP).toPlainString(), 400, y, 9);
            trendCount++;
        }
        y -= 5;
        sb.append("50 ").append(y).append(" m 545 ").append(y).append(" l S\n");

        // Footer note
        drawText(sb, "Report generated automatically by Sri Maruthi textiles Super Admin on " + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")), 50, 60, 8);

        SimplePdfWriter writer = new SimplePdfWriter();
        return writer.build(sb.toString());
    }

    private void drawText(StringBuilder sb, String text, float x, float y, int fontSize) {
        String escaped = SimplePdfWriter.escapePdfText(text);
        sb.append("BT /F1 ").append(fontSize).append(" Tf ").append(x).append(" ").append(y).append(" Td (").append(escaped).append(") Tj ET\n");
    }
}
