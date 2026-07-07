package com.shopsphere.order;

import com.shopsphere.dto.OrderRequest;
import com.shopsphere.dto.OrderResponse;
import com.shopsphere.entity.*;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.repository.*;
import com.shopsphere.service.OrderService;
import com.shopsphere.support.MySqlAvailableCondition;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The decisive proof of the §5 stock-locking fix: two users race to buy the last unit of a
 * product. With @Version optimistic locking + the retry wrapper, exactly one checkout must
 * win and the other must fail cleanly with "Not enough stock" — never an oversell.
 *
 * Requires a reachable local MySQL (skipped otherwise — see {@link MySqlAvailableCondition}).
 * Runs against the isolated `shopsphere_test` schema defined in application-test.properties.
 */
@SpringBootTest
@ActiveProfiles("test")
@ExtendWith(MySqlAvailableCondition.class)
class CheckoutConcurrencyTest {

    @Autowired OrderService orderService;
    @Autowired ProductRepository productRepository;
    @Autowired CategoryRepository categoryRepository;
    @Autowired UserRepository userRepository;
    @Autowired AddressRepository addressRepository;
    @Autowired CartItemRepository cartItemRepository;
    @Autowired OrderRepository orderRepository;

    private Long productId;
    private Long address1Id;
    private Long address2Id;
    private String email1 = "race1@shopsphere-test.com";
    private String email2 = "race2@shopsphere-test.com";

    @BeforeEach
    void seedRaceFixture() {
        cleanUp(); // start from a known-empty state regardless of prior seed data

        Category category = categoryRepository.save(
                Category.builder().name("RaceTestCat").description("concurrency fixture").build());

        Product product = productRepository.save(Product.builder()
                .name("Last Unit Widget").price(new BigDecimal("100.00"))
                .stockQuantity(1).category(category).build());
        productId = product.getId();

        User user1 = userRepository.save(buildUser(email1, "Racer One"));
        User user2 = userRepository.save(buildUser(email2, "Racer Two"));

        address1Id = addressRepository.save(buildAddress(user1)).getId();
        address2Id = addressRepository.save(buildAddress(user2)).getId();

        cartItemRepository.save(CartItem.builder().user(user1).product(product).quantity(1).build());
        cartItemRepository.save(CartItem.builder().user(user2).product(product).quantity(1).build());
    }

    @AfterEach
    void tearDown() {
        cleanUp();
        SecurityContextHolder.clearContext();
    }

    @Test
    void twoConcurrentCheckouts_onlyOneSucceeds_noOversell() throws Exception {
        CyclicBarrier barrier = new CyclicBarrier(2);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Outcome> f1 = pool.submit(checkoutTask(email1, address1Id, barrier));
            Future<Outcome> f2 = pool.submit(checkoutTask(email2, address2Id, barrier));

            Outcome o1 = f1.get();
            Outcome o2 = f2.get();

            long successes = List.of(o1, o2).stream().filter(o -> o.success).count();
            long stockRejections = List.of(o1, o2).stream()
                    .filter(o -> !o.success && o.rejectedForStock).count();

            assertThat(successes).as("exactly one checkout wins the last unit").isEqualTo(1);
            assertThat(stockRejections).as("the loser is rejected cleanly for stock, not a 500").isEqualTo(1);

            Product reloaded = productRepository.findById(productId).orElseThrow();
            assertThat(reloaded.getStockQuantity()).as("stock never goes negative").isEqualTo(0);
            assertThat(orderRepository.count()).as("only one order was created").isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    private Callable<Outcome> checkoutTask(String email, Long addressId, CyclicBarrier barrier) {
        return () -> {
            // Each thread authenticates as its own user (SecurityContextHolder is thread-local).
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(email, null, List.of()));
            OrderRequest req = new OrderRequest();
            req.setAddressId(addressId);
            req.setPaymentMethod("COD");
            try {
                barrier.await(); // release both threads together to maximise overlap
                OrderResponse response = orderService.checkout(req);
                return Outcome.success(response);
            } catch (BadRequestException e) {
                return Outcome.rejected(e.getMessage().contains("Not enough stock"));
            } finally {
                SecurityContextHolder.clearContext();
            }
        };
    }

    private User buildUser(String email, String name) {
        return User.builder().name(name).email(email).password("irrelevant-hash")
                .role(Role.CUSTOMER).emailVerified(true).build();
    }

    private Address buildAddress(User user) {
        return Address.builder().user(user).line1("1 Race St").city("Testville")
                .pincode("600001").phone("9999999999").build();
    }

    private void cleanUp() {
        orderRepository.deleteAll();   // cascades order items + payment
        cartItemRepository.deleteAll();
        addressRepository.deleteAll();
        productRepository.deleteAll();
        userRepository.deleteAll();
        categoryRepository.deleteAll();
    }

    private static final class Outcome {
        final boolean success;
        final boolean rejectedForStock;

        private Outcome(boolean success, boolean rejectedForStock) {
            this.success = success;
            this.rejectedForStock = rejectedForStock;
        }

        static Outcome success(OrderResponse ignored) {
            return new Outcome(true, false);
        }

        static Outcome rejected(boolean forStock) {
            return new Outcome(false, forStock);
        }
    }
}
