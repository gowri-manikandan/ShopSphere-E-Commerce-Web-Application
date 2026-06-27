package com.shopsphere.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminDashboardStats {
    private long totalUsers;
    private long totalProducts;
    private long totalOrders;
    private BigDecimal totalRevenue;
    private long pendingOrders;
    private long cancelledOrders;
    private long deliveredOrders;

    private List<MonthlySalesData> monthlySales;
    private List<ProductSalesData> topSellingProducts;
    private List<CategoryProductCount> categoryProductCounts;
    private List<OrderStatusCount> orderStatusCounts;
    private List<UserRegistrationTrend> userRegistrationTrends;

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class MonthlySalesData {
        private String month;
        private BigDecimal sales;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class ProductSalesData {
        private String productName;
        private long quantity;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class CategoryProductCount {
        private String categoryName;
        private long count;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class OrderStatusCount {
        private String status;
        private long count;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class UserRegistrationTrend {
        private String date;
        private long count;
    }
}
