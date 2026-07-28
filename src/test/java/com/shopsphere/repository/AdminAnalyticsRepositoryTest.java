package com.shopsphere.repository;

import com.shopsphere.entity.*;
import com.shopsphere.support.MySqlAvailableCondition;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Exercises the analytics aggregation JPQL against a real MySQL (skipped if unreachable — see
 * {@link MySqlAvailableCondition}), including the MySQL {@code FUNCTION('DATE'/'DATE_FORMAT', …)}
 * grouping that a mocked test can't validate. Uses the isolated {@code shopsphere_test} schema.
 */
@SpringBootTest
@ActiveProfiles("test")
@ExtendWith(MySqlAvailableCondition.class)
class AdminAnalyticsRepositoryTest {

    @Autowired OrderRepository orderRepository;
    @Autowired OrderItemRepository orderItemRepository;
    @Autowired ProductRepository productRepository;
    @Autowired CategoryRepository categoryRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    private Long productAId;
    private Long productBId;

    @BeforeEach
    void seed() {
        cleanUp();
        Category cat = categoryRepository.save(
                Category.builder().name("AnalyticsCat").description("fixture").build());
        Product a = productRepository.save(Product.builder().name("Alpha")
                .price(new BigDecimal("100.00")).stockQuantity(100).category(cat).build());
        Product b = productRepository.save(Product.builder().name("Beta")
                .price(new BigDecimal("50.00")).stockQuantity(100).category(cat).build());
        productAId = a.getId();
        productBId = b.getId();
        User user = userRepository.save(User.builder().name("Ana").email("ana@analytics-test.com")
                .password("x").role(Role.CUSTOMER).emailVerified(true).build());

        // Two orders this month: A×3 + B×1 (=350) and A×2 (=200). Total A units = 5, B = 1.
        Order o1 = Order.builder().user(user).status(OrderStatus.PLACED)
                .totalAmount(new BigDecimal("350.00")).items(new ArrayList<>()).build();
        o1.addItem(OrderItem.builder().product(a).quantity(3).price(a.getPrice()).build());
        o1.addItem(OrderItem.builder().product(b).quantity(1).price(b.getPrice()).build());
        orderRepository.save(o1);

        Order o2 = Order.builder().user(user).status(OrderStatus.PLACED)
                .totalAmount(new BigDecimal("200.00")).items(new ArrayList<>()).build();
        o2.addItem(OrderItem.builder().product(a).quantity(2).price(a.getPrice()).build());
        orderRepository.save(o2);
    }

    @AfterEach
    void tearDown() {
        cleanUp();
    }

    @Test
    void topProducts_dailySales_and_trend_forCurrentMonth() {
        YearMonth ym = YearMonth.now();
        LocalDateTime start = ym.atDay(1).atStartOfDay();
        LocalDateTime end = ym.atEndOfMonth().atTime(LocalTime.MAX);

        List<Object[]> top = orderItemRepository.topProductsByUnits(start, end, PageRequest.of(0, 10));
        assertThat(top).hasSize(2);
        assertThat(top.get(0)[0]).isEqualTo(productAId);                  // Alpha ranked first
        assertThat(((Number) top.get(0)[2]).longValue()).isEqualTo(5);   // 3 + 2 units
        assertThat(top.get(1)[0]).isEqualTo(productBId);
        assertThat(((Number) top.get(1)[2]).longValue()).isEqualTo(1);

        assertThat(orderRepository.revenueBetween(start, end)).isEqualByComparingTo("550.00");

        List<Object[]> daily = orderRepository.dailySalesBetween(start, end);
        assertThat(daily).hasSize(1); // both orders placed today
        assertThat((BigDecimal) daily.get(0)[1]).isEqualByComparingTo("550.00");
        assertThat(((Number) daily.get(0)[2]).longValue()).isEqualTo(2);

        List<Object[]> trend = orderItemRepository.productMonthlyTrend(productAId, start, end);
        assertThat(trend).hasSize(1);
        assertThat(trend.get(0)[0]).isEqualTo(ym.format(DateTimeFormatter.ofPattern("yyyy-MM")));
        assertThat(((Number) trend.get(0)[1]).longValue()).isEqualTo(5);
    }

    @Test
    void dateWindow_excludesOrdersOutsideTheRange() {
        // Push both orders ~2 months back (native UPDATE bypasses @PrePersist / updatable=false).
        jdbcTemplate.update("UPDATE orders SET order_date = ?",
                Timestamp.valueOf(LocalDateTime.now().minusMonths(2)));

        YearMonth ym = YearMonth.now();
        LocalDateTime start = ym.atDay(1).atStartOfDay();
        LocalDateTime end = ym.atEndOfMonth().atTime(LocalTime.MAX);

        assertThat(orderRepository.revenueBetween(start, end)).isEqualByComparingTo("0");
        assertThat(orderItemRepository.topProductsByUnits(start, end, PageRequest.of(0, 10))).isEmpty();
        assertThat(orderRepository.dailySalesBetween(start, end)).isEmpty();
    }

    private void cleanUp() {
        orderRepository.deleteAll();   // cascades order_items
        productRepository.deleteAll();
        userRepository.deleteAll();
        categoryRepository.deleteAll();
    }
}
