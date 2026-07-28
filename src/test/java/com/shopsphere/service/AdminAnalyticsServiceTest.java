package com.shopsphere.service;

import com.shopsphere.dto.*;
import com.shopsphere.entity.*;
import com.shopsphere.repository.OrderItemRepository;
import com.shopsphere.repository.OrderRepository;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the analytics assembly logic (zero-fill, prev-month %, mapping, CSV) with
 * mocked repositories — no DB. The SQL itself is exercised in AdminAnalyticsRepositoryTest.
 */
@ExtendWith(MockitoExtension.class)
class AdminAnalyticsServiceTest {

    @Mock OrderRepository orderRepository;
    @Mock OrderItemRepository orderItemRepository;
    @Mock ProductRepository productRepository;
    @Mock UserRepository userRepository;

    AdminAnalyticsService service;

    @BeforeEach
    void setUp() {
        service = new AdminAnalyticsService(orderRepository, orderItemRepository,
                productRepository, userRepository, 5);
    }

    // ----- overview -----

    @Test
    void overview_computesAverageOrderValue() {
        when(orderRepository.calculateTotalRevenue()).thenReturn(new BigDecimal("1000.00"));
        when(orderRepository.revenueBetween(any(), any())).thenReturn(new BigDecimal("300.00"));
        when(orderRepository.countByStatusNotAndOrderDateBetween(any(), any(), any())).thenReturn(3L);
        when(userRepository.countByRole(Role.CUSTOMER)).thenReturn(42L);

        OverviewResponse r = service.getOverview(LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 31));

        assertThat(r.getAllTimeRevenue()).isEqualByComparingTo("1000.00");
        assertThat(r.getPeriodRevenue()).isEqualByComparingTo("300.00");
        assertThat(r.getPeriodOrders()).isEqualTo(3);
        assertThat(r.getTotalCustomers()).isEqualTo(42);
        assertThat(r.getAverageOrderValue()).isEqualByComparingTo("100.00"); // 300 / 3
    }

    @Test
    void overview_zeroOrders_avgIsZero_noDivideByZero() {
        when(orderRepository.calculateTotalRevenue()).thenReturn(BigDecimal.ZERO);
        when(orderRepository.revenueBetween(any(), any())).thenReturn(BigDecimal.ZERO);
        when(orderRepository.countByStatusNotAndOrderDateBetween(any(), any(), any())).thenReturn(0L);
        when(userRepository.countByRole(any())).thenReturn(0L);

        OverviewResponse r = service.getOverview(null, null); // defaults to current month

        assertThat(r.getAverageOrderValue()).isEqualByComparingTo("0");
        assertThat(r.getPeriodOrders()).isZero();
        assertThat(r.getFrom()).isEqualTo(YearMonth.now().atDay(1));
    }

    // ----- sales report -----

    @Test
    void salesReport_zeroFillsDays_andComputesPrevMonthChange() {
        List<Object[]> rows = List.of(
                new Object[]{Date.valueOf(LocalDate.of(2026, 3, 5)), new BigDecimal("200.00"), 2L},
                new Object[]{Date.valueOf(LocalDate.of(2026, 3, 10)), new BigDecimal("100.00"), 1L});
        when(orderRepository.dailySalesBetween(any(), any())).thenReturn(rows);
        when(orderRepository.revenueBetween(any(), any()))
                .thenReturn(new BigDecimal("300.00"))  // current month total
                .thenReturn(new BigDecimal("150.00")); // previous month
        when(orderRepository.countByStatusNotAndOrderDateBetween(any(), any(), any())).thenReturn(3L);

        SalesReportResponse r = service.getSalesReport("2026-03");

        assertThat(r.getMonth()).isEqualTo("2026-03");
        assertThat(r.getDaily()).hasSize(31); // March, zero-filled
        assertThat(r.getDaily().get(4).getRevenue()).isEqualByComparingTo("200.00"); // day 5
        assertThat(r.getDaily().get(4).getOrders()).isEqualTo(2);
        assertThat(r.getDaily().get(0).getRevenue()).isEqualByComparingTo("0"); // day 1 zero-filled
        assertThat(r.getTotalRevenue()).isEqualByComparingTo("300.00");
        assertThat(r.getRevenueChangePct()).isEqualTo(100.0); // (300-150)/150*100
    }

    @Test
    void salesReport_prevMonthZeroRevenue_changePctIsNull() {
        when(orderRepository.dailySalesBetween(any(), any())).thenReturn(List.of());
        when(orderRepository.revenueBetween(any(), any()))
                .thenReturn(new BigDecimal("300.00"))
                .thenReturn(BigDecimal.ZERO);
        when(orderRepository.countByStatusNotAndOrderDateBetween(any(), any(), any())).thenReturn(3L);

        SalesReportResponse r = service.getSalesReport("2026-03");

        assertThat(r.getRevenueChangePct()).isNull();
        assertThat(r.getDaily()).allSatisfy(d -> assertThat(d.getOrders()).isZero());
    }

    // ----- top products -----

    @Test
    void topProducts_mapsRows_andSortByRevenueUsesRevenueQuery() {
        List<Object[]> rows = List.of(
                new Object[]{10L, "Widget", 5L, new BigDecimal("500.00")},
                new Object[]{11L, "Gadget", 3L, new BigDecimal("900.00")});
        when(orderItemRepository.topProductsByRevenue(any(), any(), any())).thenReturn(rows);

        List<TopProductResponse> r = service.getTopProducts("2026-03", 10, "revenue");

        assertThat(r).hasSize(2);
        assertThat(r.get(0).getProductId()).isEqualTo(10L);
        assertThat(r.get(0).getUnitsSold()).isEqualTo(5);
        assertThat(r.get(1).getRevenue()).isEqualByComparingTo("900.00");
        verify(orderItemRepository).topProductsByRevenue(any(), any(), any());
        verify(orderItemRepository, never()).topProductsByUnits(any(), any(), any());
    }

    // ----- product trend -----

    @Test
    void productTrend_zeroFillsMonths_andSumsTotals() {
        Product p = Product.builder().id(7L).name("Widget").build();
        when(productRepository.findById(7L)).thenReturn(Optional.of(p));
        String thisMonth = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        when(orderItemRepository.productMonthlyTrend(eq(7L), any(), any()))
                .thenReturn(List.<Object[]>of(new Object[]{thisMonth, 8L, new BigDecimal("800.00")}));

        ProductTrendResponse r = service.getProductTrend(7L, 12);

        assertThat(r.getProductName()).isEqualTo("Widget");
        assertThat(r.getPoints()).hasSize(12);
        assertThat(r.getPoints().get(11).getMonth()).isEqualTo(thisMonth); // last = current month
        assertThat(r.getPoints().get(11).getUnits()).isEqualTo(8);
        assertThat(r.getPoints().get(0).getUnits()).isZero(); // earliest month zero-filled
        assertThat(r.getTotalUnits()).isEqualTo(8);
        assertThat(r.getTotalRevenue()).isEqualByComparingTo("800.00");
    }

    // ----- low stock -----

    @Test
    void lowStock_setsStatusFromStock() {
        Product out = Product.builder().id(1L).name("Out").price(new BigDecimal("10.00")).stockQuantity(0).build();
        Product low = Product.builder().id(2L).name("Low").price(new BigDecimal("20.00")).stockQuantity(3).build();
        when(productRepository.findByStockQuantityLessThanEqualOrderByStockQuantityAsc(5))
                .thenReturn(List.of(out, low));

        List<LowStockResponse> r = service.getLowStock(null); // default threshold 5

        assertThat(r).hasSize(2);
        assertThat(r.get(0).getStatus()).isEqualTo("OUT_OF_STOCK");
        assertThat(r.get(1).getStatus()).isEqualTo("LOW_STOCK");
    }

    // ----- recent orders -----

    @Test
    void recentOrders_wrapsPageAndMapsOrders() {
        User u = User.builder().id(1L).name("A").email("a@x.com").build();
        Order o = Order.builder().id(100L).user(u).status(OrderStatus.PLACED)
                .totalAmount(new BigDecimal("50.00")).items(new ArrayList<>())
                .orderDate(LocalDateTime.now()).build();
        Page<Order> pg = new PageImpl<>(List.of(o), PageRequest.of(0, 10), 1);
        when(orderRepository.findAll(any(Pageable.class))).thenReturn(pg);

        PagedResponse<OrderResponse> r = service.getRecentOrders(0, 10, null);

        assertThat(r.getTotalElements()).isEqualTo(1);
        assertThat(r.getContent()).hasSize(1);
        assertThat(r.getContent().get(0).getOrderId()).isEqualTo(100L);
    }

    // ----- CSV -----

    @Test
    void csv_hasHeaderRowsAndTotal() {
        SalesReportResponse report = SalesReportResponse.builder()
                .month("2026-03").totalRevenue(new BigDecimal("300.00")).orderCount(3)
                .daily(List.of(
                        SalesReportResponse.DailySales.builder()
                                .date(LocalDate.of(2026, 3, 1)).revenue(new BigDecimal("200.00")).orders(2).build(),
                        SalesReportResponse.DailySales.builder()
                                .date(LocalDate.of(2026, 3, 2)).revenue(BigDecimal.ZERO).orders(0).build()))
                .build();

        String csv = service.toSalesReportCsv(report);

        assertThat(csv).startsWith("date,revenue,orders\n");
        assertThat(csv).contains("2026-03-01,200.00,2\n");
        assertThat(csv).contains("TOTAL,300.00,3\n");
    }
}
