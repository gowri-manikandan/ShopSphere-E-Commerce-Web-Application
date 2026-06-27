package com.shopsphere.service;

import com.shopsphere.dto.AdminDashboardStats;
import com.shopsphere.entity.*;
import com.shopsphere.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminDashboardService {

    private final UserRepository userRepository;
    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;

    @Transactional(readOnly = true)
    public AdminDashboardStats getStats() {
        long totalUsers = userRepository.count();
        long totalProducts = productRepository.count();
        long totalOrders = orderRepository.count();
        BigDecimal totalRevenue = orderRepository.calculateTotalRevenue();

        long pendingOrders = orderRepository.countByStatus(OrderStatus.PLACED);
        long cancelledOrders = orderRepository.countByStatus(OrderStatus.CANCELLED);
        long deliveredOrders = orderRepository.countByStatus(OrderStatus.DELIVERED);

        // Fetch all data for aggregations
        List<Order> orders = orderRepository.findAll();
        List<OrderItem> orderItems = orderItemRepository.findAll();
        List<Product> products = productRepository.findAll();
        List<User> users = userRepository.findAll();

        // 1. Monthly Sales Chart
        Map<String, BigDecimal> monthlyMap = new LinkedHashMap<>();
        // Pre-fill last 6 months
        java.time.LocalDate now = java.time.LocalDate.now();
        DateTimeFormatter monthFormatter = DateTimeFormatter.ofPattern("MMM");
        for (int i = 5; i >= 0; i--) {
            monthlyMap.put(now.minusMonths(i).format(monthFormatter), BigDecimal.ZERO);
        }
        for (Order o : orders) {
            if (o.getStatus() != OrderStatus.CANCELLED && o.getOrderDate() != null) {
                String mName = o.getOrderDate().format(monthFormatter);
                if (monthlyMap.containsKey(mName)) {
                    monthlyMap.put(mName, monthlyMap.get(mName).add(o.getTotalAmount()));
                }
            }
        }
        List<AdminDashboardStats.MonthlySalesData> monthlySales = monthlyMap.entrySet().stream()
                .map(e -> new AdminDashboardStats.MonthlySalesData(e.getKey(), e.getValue()))
                .collect(Collectors.toList());

        // 2. Top Selling Products
        Map<String, Long> topProductsMap = new HashMap<>();
        for (OrderItem oi : orderItems) {
            if (oi.getOrder() != null && oi.getOrder().getStatus() != OrderStatus.CANCELLED) {
                String pName = oi.getProduct() != null ? oi.getProduct().getName() : "Deleted Product";
                topProductsMap.put(pName, topProductsMap.getOrDefault(pName, 0L) + oi.getQuantity());
            }
        }
        List<AdminDashboardStats.ProductSalesData> topSellingProducts = topProductsMap.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(5)
                .map(e -> new AdminDashboardStats.ProductSalesData(e.getKey(), e.getValue()))
                .collect(Collectors.toList());

        // 3. Category-wise Products
        Map<String, Long> categoryMap = new HashMap<>();
        for (Product p : products) {
            String cName = p.getCategory() != null ? p.getCategory().getName() : "General";
            categoryMap.put(cName, categoryMap.getOrDefault(cName, 0L) + 1);
        }
        List<AdminDashboardStats.CategoryProductCount> categoryProductCounts = categoryMap.entrySet().stream()
                .map(e -> new AdminDashboardStats.CategoryProductCount(e.getKey(), e.getValue()))
                .collect(Collectors.toList());

        // 4. Order Status Count
        Map<String, Long> statusMap = new HashMap<>();
        for (OrderStatus status : OrderStatus.values()) {
            statusMap.put(status.name(), 0L);
        }
        for (Order o : orders) {
            statusMap.put(o.getStatus().name(), statusMap.getOrDefault(o.getStatus().name(), 0L) + 1);
        }
        List<AdminDashboardStats.OrderStatusCount> orderStatusCounts = statusMap.entrySet().stream()
                .map(e -> new AdminDashboardStats.OrderStatusCount(e.getKey(), e.getValue()))
                .collect(Collectors.toList());

        // 5. User Registration Trend (Last 7 Days)
        Map<String, Long> userTrendMap = new LinkedHashMap<>();
        DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        for (int i = 6; i >= 0; i--) {
            userTrendMap.put(now.minusDays(i).format(dateFormatter), 0L);
        }
        for (User u : users) {
            if (u.getCreatedAt() != null) {
                String dStr = u.getCreatedAt().format(dateFormatter);
                if (userTrendMap.containsKey(dStr)) {
                    userTrendMap.put(dStr, userTrendMap.get(dStr) + 1);
                }
            }
        }
        List<AdminDashboardStats.UserRegistrationTrend> userRegistrationTrends = userTrendMap.entrySet().stream()
                .map(e -> new AdminDashboardStats.UserRegistrationTrend(e.getKey(), e.getValue()))
                .collect(Collectors.toList());

        return AdminDashboardStats.builder()
                .totalUsers(totalUsers)
                .totalProducts(totalProducts)
                .totalOrders(totalOrders)
                .totalRevenue(totalRevenue)
                .pendingOrders(pendingOrders)
                .cancelledOrders(cancelledOrders)
                .deliveredOrders(deliveredOrders)
                .monthlySales(monthlySales)
                .topSellingProducts(topSellingProducts)
                .categoryProductCounts(categoryProductCounts)
                .orderStatusCounts(orderStatusCounts)
                .userRegistrationTrends(userRegistrationTrends)
                .build();
    }
}
