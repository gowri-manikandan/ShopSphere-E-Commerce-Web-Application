package com.shopsphere.service;

import com.shopsphere.dto.CheckoutResponse;
import com.shopsphere.dto.OrderRequest;
import com.shopsphere.dto.OrderResponse;
import com.shopsphere.entity.*;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.realtime.OrderStatusChangedEvent;
import com.shopsphere.realtime.StockChangedEvent;
import com.shopsphere.repository.*;
import com.shopsphere.security.SecurityUtils;
import com.stripe.model.PaymentIntent;
import org.springframework.context.ApplicationEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the transactional bodies (doCheckout / doCancelOrder) with mocked
 * collaborators. The retry wrapper is exercised separately in {@link OrderServiceRetryTest};
 * here `self` is unused so it is passed as null.
 */
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock OrderRepository orderRepository;
    @Mock CartItemRepository cartItemRepository;
    @Mock ProductRepository productRepository;
    @Mock AddressRepository addressRepository;
    @Mock SecurityUtils securityUtils;
    @Mock ApplicationEventPublisher eventPublisher;
    @Mock PaymentService paymentService;

    OrderService orderService;

    private User user;
    private Address address;

    @BeforeEach
    void setUp() {
        orderService = new OrderService(orderRepository, cartItemRepository,
                productRepository, addressRepository, securityUtils, eventPublisher, paymentService, null);
        user = User.builder().id(1L).email("buyer@shopsphere.com").name("Buyer").build();
        address = Address.builder().id(5L).user(user).line1("1 Main St").city("Metropolis")
                .pincode("600001").build();
    }

    private Product product(long id, String price, int stock) {
        return Product.builder().id(id).name("P" + id).price(new BigDecimal(price))
                .stockQuantity(stock).build();
    }

    private CartItem cartItem(Product p, int qty) {
        return CartItem.builder().id(p.getId()).user(user).product(p).quantity(qty).build();
    }

    private OrderRequest request(String paymentMethod) {
        OrderRequest r = new OrderRequest();
        r.setAddressId(5L);
        r.setPaymentMethod(paymentMethod);
        return r;
    }

    // Stub the Stripe PaymentIntent that PaymentService returns for a card checkout
    // (with Stripe configured, i.e. the real-payment path).
    private PaymentIntent stubStripeIntent(String id, String clientSecret) {
        when(paymentService.isStripeEnabled()).thenReturn(true);
        PaymentIntent intent = mock(PaymentIntent.class);
        when(intent.getId()).thenReturn(id);
        when(intent.getClientSecret()).thenReturn(clientSecret);
        when(paymentService.createIntent(any())).thenReturn(intent);
        return intent;
    }

    @Test
    void doCheckout_card_deductsStock_createsPaymentIntent_pending_clearsCart() {
        Product p = product(10L, "100.00", 50);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of(cartItem(p, 2)));
        when(addressRepository.findById(5L)).thenReturn(Optional.of(address));
        when(productRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        stubStripeIntent("pi_test_123", "pi_test_123_secret_abc");

        CheckoutResponse response = orderService.doCheckout(request("CARD"));

        assertThat(p.getStockQuantity()).isEqualTo(48); // 50 - 2

        ArgumentCaptor<Order> orderCaptor = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).save(orderCaptor.capture());
        Order saved = orderCaptor.getValue();
        assertThat(saved.getTotalAmount()).isEqualByComparingTo("200.00"); // 100 * 2
        assertThat(saved.getStatus()).isEqualTo(OrderStatus.PLACED);
        assertThat(saved.getItems()).hasSize(1);
        // Card payment stays PENDING until the Stripe webhook confirms it (§9).
        assertThat(saved.getPayment().getStatus()).isEqualTo(PaymentStatus.PENDING);
        assertThat(saved.getPayment().getPaidAt()).isNull();
        assertThat(saved.getPayment().getPaymentIntentId()).isEqualTo("pi_test_123");
        assertThat(saved.getPayment().getTransactionRef()).isEqualTo("pi_test_123");

        verify(paymentService).createIntent(any());
        verify(cartItemRepository).deleteByUserId(1L);
        assertThat(response.getOrder().getStatus()).isEqualTo("PLACED");
        assertThat(response.getOrder().getPaymentStatus()).isEqualTo("PENDING");
        assertThat(response.getClientSecret()).isEqualTo("pi_test_123_secret_abc");
    }

    @Test
    void doCheckout_card_stripeNotConfigured_fallsBackToMockSuccess() {
        Product p = product(10L, "100.00", 50);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of(cartItem(p, 1)));
        when(addressRepository.findById(5L)).thenReturn(Optional.of(address));
        when(productRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(paymentService.isStripeEnabled()).thenReturn(false);

        CheckoutResponse response = orderService.doCheckout(request("CARD"));

        ArgumentCaptor<Order> orderCaptor = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).save(orderCaptor.capture());
        Payment payment = orderCaptor.getValue().getPayment();
        // No Stripe -> mock immediate success so local checkout still works.
        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(payment.getPaidAt()).isNotNull();
        assertThat(payment.getPaymentIntentId()).isNull();
        assertThat(payment.getTransactionRef()).startsWith("MOCK-");

        verify(paymentService, never()).createIntent(any());
        assertThat(response.getClientSecret()).isNull();
    }

    @Test
    void doCheckout_cod_leavesPaymentPending_noStripeIntent() {
        Product p = product(10L, "100.00", 50);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of(cartItem(p, 1)));
        when(addressRepository.findById(5L)).thenReturn(Optional.of(address));
        when(productRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        CheckoutResponse response = orderService.doCheckout(request("COD"));

        ArgumentCaptor<Order> orderCaptor = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).save(orderCaptor.capture());
        Payment payment = orderCaptor.getValue().getPayment();
        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.PENDING);
        assertThat(payment.getPaidAt()).isNull();
        assertThat(payment.getPaymentIntentId()).isNull();
        assertThat(payment.getTransactionRef()).startsWith("COD-");

        // COD never touches Stripe, and no client secret is returned.
        verify(paymentService, never()).createIntent(any());
        assertThat(response.getClientSecret()).isNull();
    }

    @Test
    void doCheckout_emptyCart_throws_noOrderSaved() {
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of());

        assertThatThrownBy(() -> orderService.doCheckout(request("CARD")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("empty");

        verify(orderRepository, never()).save(any());
    }

    @Test
    void doCheckout_insufficientStock_throws_noOrderSaved() {
        Product p = product(10L, "100.00", 1);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of(cartItem(p, 5)));
        when(addressRepository.findById(5L)).thenReturn(Optional.of(address));

        assertThatThrownBy(() -> orderService.doCheckout(request("CARD")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Not enough stock");

        verify(orderRepository, never()).save(any());
        verify(productRepository, never()).save(any());
        assertThat(p.getStockQuantity()).isEqualTo(1); // unchanged
    }

    @Test
    void doCheckout_addressNotFound_throwsResourceNotFound() {
        Product p = product(10L, "100.00", 50);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of(cartItem(p, 1)));
        when(addressRepository.findById(5L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> orderService.doCheckout(request("CARD")))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void doCheckout_addressNotOwnedByUser_throwsBadRequest() {
        Product p = product(10L, "100.00", 50);
        User other = User.builder().id(2L).email("someone@else.com").name("Other").build();
        Address foreign = Address.builder().id(5L).user(other).line1("x").city("y").pincode("z").build();
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of(cartItem(p, 1)));
        when(addressRepository.findById(5L)).thenReturn(Optional.of(foreign));

        assertThatThrownBy(() -> orderService.doCheckout(request("CARD")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("shipping address");
    }

    @Test
    void doCheckout_invalidPaymentMethod_throwsBadRequest() {
        Product p = product(10L, "100.00", 50);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of(cartItem(p, 1)));
        when(addressRepository.findById(5L)).thenReturn(Optional.of(address));

        assertThatThrownBy(() -> orderService.doCheckout(request("BITCOIN")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("payment method");

        verify(orderRepository, never()).save(any());
    }

    // ----- cancel -----

    private Order placedOrder(LocalDateTime orderDate, Product p, int qty) {
        Payment payment = Payment.builder().amount(new BigDecimal("100.00"))
                .method(PaymentMethod.CARD).status(PaymentStatus.SUCCESS).build();
        Order order = Order.builder().id(100L).user(user).status(OrderStatus.PLACED)
                .totalAmount(new BigDecimal("100.00")).orderDate(orderDate)
                .items(new java.util.ArrayList<>()).payment(payment).build();
        order.addItem(OrderItem.builder().product(p).quantity(qty).price(p.getPrice()).build());
        return order;
    }

    @Test
    void doCancelOrder_success_restoresStock_setsCancelled_failsPayment() {
        Product p = product(10L, "100.00", 5);
        Order order = placedOrder(LocalDateTime.now().minusHours(1), p, 2);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(orderRepository.findById(100L)).thenReturn(Optional.of(order));
        when(productRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        orderService.doCancelOrder(100L);

        assertThat(p.getStockQuantity()).isEqualTo(7); // 5 + 2 restored
        assertThat(order.getStatus()).isEqualTo(OrderStatus.CANCELLED);
        assertThat(order.getPayment().getStatus()).isEqualTo(PaymentStatus.FAILED);
        verify(productRepository, times(1)).save(any());
    }

    @Test
    void doCancelOrder_notOwnedByUser_throwsBadRequest() {
        Product p = product(10L, "100.00", 5);
        Order order = placedOrder(LocalDateTime.now().minusHours(1), p, 2);
        order.setUser(User.builder().id(2L).email("other@x.com").name("Other").build());
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(orderRepository.findById(100L)).thenReturn(Optional.of(order));

        assertThatThrownBy(() -> orderService.doCancelOrder(100L))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("your own orders");
    }

    @Test
    void doCancelOrder_notPlacedStatus_throwsBadRequest() {
        Product p = product(10L, "100.00", 5);
        Order order = placedOrder(LocalDateTime.now().minusHours(1), p, 2);
        order.setStatus(OrderStatus.SHIPPED);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(orderRepository.findById(100L)).thenReturn(Optional.of(order));

        assertThatThrownBy(() -> orderService.doCancelOrder(100L))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("current state");
    }

    @Test
    void doCancelOrder_past24Hours_throwsBadRequest() {
        Product p = product(10L, "100.00", 5);
        Order order = placedOrder(LocalDateTime.now().minusHours(25), p, 2);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(orderRepository.findById(100L)).thenReturn(Optional.of(order));

        assertThatThrownBy(() -> orderService.doCancelOrder(100L))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("24 hours");
    }

    // ----- real-time event publishing (§5) -----

    @Test
    void doCheckout_publishesStockChangedEventPerItem() {
        Product a = product(10L, "100.00", 50);
        Product b = product(11L, "200.00", 20);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of(cartItem(a, 2), cartItem(b, 1)));
        when(addressRepository.findById(5L)).thenReturn(Optional.of(address));
        when(productRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        stubStripeIntent("pi_test_evt", "pi_test_evt_secret");

        orderService.doCheckout(request("CARD"));

        ArgumentCaptor<Object> events = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher, times(2)).publishEvent(events.capture());
        assertThat(events.getAllValues())
                .containsExactlyInAnyOrder(new StockChangedEvent(10L), new StockChangedEvent(11L));
    }

    @Test
    void doCancelOrder_publishesStockRestoreAndCancelledStatusEvents() {
        Product p = product(10L, "100.00", 5);
        Order order = placedOrder(LocalDateTime.now().minusHours(1), p, 2);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(orderRepository.findById(100L)).thenReturn(Optional.of(order));
        when(productRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        orderService.doCancelOrder(100L);

        ArgumentCaptor<Object> events = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher, times(2)).publishEvent(events.capture());
        assertThat(events.getAllValues().get(0)).isEqualTo(new StockChangedEvent(10L));
        assertThat(events.getAllValues().get(1)).isInstanceOfSatisfying(OrderStatusChangedEvent.class, e -> {
            assertThat(e.orderId()).isEqualTo(100L);
            assertThat(e.userId()).isEqualTo(1L);
            assertThat(e.status()).isEqualTo("CANCELLED");
        });
    }

    @Test
    void updateStatus_publishesOrderStatusChangedEvent() {
        Product p = product(10L, "100.00", 5);
        Order order = placedOrder(LocalDateTime.now().minusHours(1), p, 1);
        when(orderRepository.findById(100L)).thenReturn(Optional.of(order));
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        orderService.updateStatus(100L, "shipped");

        ArgumentCaptor<Object> events = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(events.capture());
        assertThat(events.getValue()).isInstanceOfSatisfying(OrderStatusChangedEvent.class, e -> {
            assertThat(e.orderId()).isEqualTo(100L);
            assertThat(e.userId()).isEqualTo(1L);
            assertThat(e.status()).isEqualTo("SHIPPED");
            assertThat(e.updatedAt()).isNotNull();
        });
    }
}
