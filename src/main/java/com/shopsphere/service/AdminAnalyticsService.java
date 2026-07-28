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
    private final int defaultLowStockThreshold;

    public AdminAnalyticsService(OrderRepository orderRepository,
                                 OrderItemRepository orderItemRepository,
                                 ProductRepository productRepository,
                                 UserRepository userRepository,
                                 @Value("${app.stock.low-threshold:5}") int defaultLowStockThreshold) {
        this.orderRepository = orderRepository;
        this.orderItemRepository = orderItemRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
        this.defaultLowStockThreshold = defaultLowStockThreshold;
    }

    // ----- Overview cards -----

    @Transactional(readOnly = true)
    public OverviewResponse getOverview(LocalDate from, LocalDate to) {
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

        BigDecimal periodRevenue = nz(orderRepository.revenueBetween(start, end));
        long periodOrders = orderRepository.countByStatusNotAndOrderDateBetween(
                OrderStatus.CANCELLED, start, end);
        BigDecimal avg = periodOrders > 0
                ? periodRevenue.divide(BigDecimal.valueOf(periodOrders), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        return OverviewResponse.builder()
                .allTimeRevenue(nz(orderRepository.calculateTotalRevenue()))
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
        YearMonth ym = parseMonth(month);
        LocalDateTime start = ym.atDay(1).atStartOfDay();
        LocalDateTime end = ym.atEndOfMonth().atTime(LocalTime.MAX);

        // Daily rows keyed by date.
        Map<LocalDate, long[]> orderCounts = new HashMap<>();
        Map<LocalDate, BigDecimal> revenues = new HashMap<>();
        for (Object[] row : orderRepository.dailySalesBetween(start, end)) {
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

        BigDecimal total = nz(orderRepository.revenueBetween(start, end));
        long orderCount = orderRepository.countByStatusNotAndOrderDateBetween(
                OrderStatus.CANCELLED, start, end);

        YearMonth prev = ym.minusMonths(1);
        BigDecimal prevRevenue = nz(orderRepository.revenueBetween(
                prev.atDay(1).atStartOfDay(), prev.atEndOfMonth().atTime(LocalTime.MAX)));
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
        YearMonth ym = parseMonth(month);
        LocalDateTime start = ym.atDay(1).atStartOfDay();
        LocalDateTime end = ym.atEndOfMonth().atTime(LocalTime.MAX);
        Pageable page = PageRequest.of(0, Math.max(1, Math.min(limit, 100)));

        List<Object[]> rows = "revenue".equalsIgnoreCase(sortBy)
                ? orderItemRepository.topProductsByRevenue(start, end, page)
                : orderItemRepository.topProductsByUnits(start, end, page);

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
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + productId));
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
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 100)),
                Sort.by("orderDate").descending());
        Page<Order> orders = (status == null || status.isBlank())
                ? orderRepository.findAll(pageable)
                : orderRepository.findByStatus(parseStatus(status), pageable);
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
}
