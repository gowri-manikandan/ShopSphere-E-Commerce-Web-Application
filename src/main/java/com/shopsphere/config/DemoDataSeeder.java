package com.shopsphere.config;

import com.shopsphere.entity.*;
import com.shopsphere.repository.OrderRepository;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/**
 * Optional demo-data seeder (§ dashboard testing). Off by default — enable with
 * {@code SEED_DEMO_ORDERS=true} (or {@code app.seed.demo-orders=true}) to populate ~48 orders
 * spread across the last 12 months so every dashboard chart/report has realistic data.
 *
 * <p>Idempotent: skips if the demo customer already exists. Orders are inserted directly (no
 * stock deduction), then their {@code order_date} is back-dated via native SQL because the
 * entity stamps it with {@code @PrePersist} and marks it non-updatable. Runs after
 * {@link DataInitializer} (so products exist).
 */
@Component
@org.springframework.core.annotation.Order(2)
public class DemoDataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);
    private static final String DEMO_EMAIL = "demo@shopsphere.com";

    private final UserRepository userRepository;
    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbcTemplate;
    private final boolean enabled;

    public DemoDataSeeder(UserRepository userRepository,
                          ProductRepository productRepository,
                          OrderRepository orderRepository,
                          PasswordEncoder passwordEncoder,
                          JdbcTemplate jdbcTemplate,
                          @Value("${app.seed.demo-orders:false}") boolean enabled) {
        this.userRepository = userRepository;
        this.productRepository = productRepository;
        this.orderRepository = orderRepository;
        this.passwordEncoder = passwordEncoder;
        this.jdbcTemplate = jdbcTemplate;
        this.enabled = enabled;
    }

    @Override
    public void run(String... args) {
        if (!enabled) {
            return;
        }
        if (userRepository.existsByEmail(DEMO_EMAIL)) {
            log.info("Demo orders already seeded (customer {}) — skipping.", DEMO_EMAIL);
            return;
        }
        List<Product> products = productRepository.findAll();
        if (products.isEmpty()) {
            log.warn("No products present — cannot seed demo orders.");
            return;
        }

        User customer = userRepository.save(User.builder()
                .name("Demo Customer").email(DEMO_EMAIL)
                .password(passwordEncoder.encode("demo123"))
                .role(Role.CUSTOMER).emailVerified(true).build());

        int seeded = 0;
        YearMonth thisMonth = YearMonth.now();
        for (int monthsAgo = 11; monthsAgo >= 0; monthsAgo--) {
            YearMonth ym = thisMonth.minusMonths(monthsAgo);
            int ordersThisMonth = 3 + (monthsAgo % 3); // 3–5 per month
            for (int k = 0; k < ordersThisMonth; k++) {
                int seq = monthsAgo * 10 + k;

                Order order = Order.builder()
                        .user(customer)
                        .status(pickStatus(seq, monthsAgo))
                        .totalAmount(BigDecimal.ZERO)
                        .items(new ArrayList<>())
                        .build();

                BigDecimal total = BigDecimal.ZERO;
                Product p1 = products.get(seq % products.size());
                int qty1 = 1 + (seq % 3);
                order.addItem(item(p1, qty1));
                total = total.add(p1.getPrice().multiply(BigDecimal.valueOf(qty1)));

                if (seq % 2 == 0 && products.size() > 1) { // some orders have a 2nd line
                    Product p2 = products.get((seq + 1) % products.size());
                    int qty2 = 1 + (seq % 2);
                    order.addItem(item(p2, qty2));
                    total = total.add(p2.getPrice().multiply(BigDecimal.valueOf(qty2)));
                }
                order.setTotalAmount(total);

                order.setPayment(Payment.builder()
                        .order(order).amount(total).method(PaymentMethod.CARD)
                        .status(PaymentStatus.SUCCESS).paidAt(LocalDateTime.now())
                        .transactionRef("DEMO-" + seq).build());

                Order saved = orderRepository.save(order); // cascades items + payment

                // Back-date order_date into the target month (bypasses @PrePersist/updatable=false).
                int day = Math.min(2 + k * 6, ym.lengthOfMonth());
                LocalDateTime placedAt = ym.atDay(day).atTime(10 + (k % 8), 15);
                jdbcTemplate.update("UPDATE orders SET order_date = ? WHERE id = ?",
                        Timestamp.valueOf(placedAt), saved.getId());
                seeded++;
            }
        }
        log.info("Seeded {} demo orders across 12 months (customer {} / demo123).", seeded, DEMO_EMAIL);
    }

    private OrderStatus pickStatus(int seq, int monthsAgo) {
        if (seq % 9 == 0) {
            return OrderStatus.CANCELLED;               // a few cancellations (excluded from revenue)
        }
        if (monthsAgo == 0 && seq % 2 == 0) {
            return OrderStatus.PLACED;                  // some current-month orders still in flight
        }
        OrderStatus[] cycle = {OrderStatus.DELIVERED, OrderStatus.DELIVERED,
                OrderStatus.CONFIRMED, OrderStatus.SHIPPED};
        return cycle[seq % cycle.length];
    }

    private OrderItem item(Product product, int quantity) {
        return OrderItem.builder().product(product).quantity(quantity).price(product.getPrice()).build();
    }
}
