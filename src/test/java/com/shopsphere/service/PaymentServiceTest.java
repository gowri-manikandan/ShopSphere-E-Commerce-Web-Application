package com.shopsphere.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shopsphere.config.RazorpayConfig;
import com.shopsphere.dto.OrderResponse;
import com.shopsphere.dto.PaymentVerificationRequest;
import com.shopsphere.entity.*;
import com.shopsphere.exception.PaymentException;
import com.shopsphere.realtime.OrderStatusChangedEvent;
import com.shopsphere.realtime.StockChangedEvent;
import com.shopsphere.repository.OrderRepository;
import com.shopsphere.repository.PaymentRepository;
import com.shopsphere.repository.ProcessedGatewayEventRepository;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.security.RazorpaySignature;
import com.shopsphere.security.SecurityUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for Razorpay payment handling (§9). No network: {@link RazorpayClient} is mocked
 * and signatures are computed with the real {@link RazorpaySignature} HMAC against a test key.
 */
@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    private static final String KEY_SECRET = "test_key_secret";
    private static final String WEBHOOK_SECRET = "test_webhook_secret";

    @Mock RazorpayConfig razorpayConfig;
    @Mock RazorpayClient razorpayClient;
    @Mock PaymentRepository paymentRepository;
    @Mock OrderRepository orderRepository;
    @Mock ProductRepository productRepository;
    @Mock ProcessedGatewayEventRepository processedEventRepository;
    @Mock ApplicationEventPublisher eventPublisher;
    @Mock SecurityUtils securityUtils;

    PaymentService paymentService;

    private User user;

    @BeforeEach
    void setUp() {
        paymentService = new PaymentService(razorpayConfig, razorpayClient, paymentRepository,
                orderRepository, productRepository, processedEventRepository, eventPublisher,
                securityUtils, new ObjectMapper());
        user = User.builder().id(7L).email("buyer@shopsphere.com").name("Buyer").build();
    }

    private Order orderWith(Payment payment, OrderStatus status) {
        Order order = Order.builder().id(50L).user(user).status(status)
                .totalAmount(new BigDecimal("200.00")).items(new ArrayList<>()).payment(payment).build();
        payment.setOrder(order);
        return order;
    }

    // ----- verify (checkout callback) -----

    @Test
    void verifyAndConfirm_validSignature_confirmsOrder_publishesEvent() {
        String razorpayOrderId = "order_1";
        String razorpayPaymentId = "pay_1";
        String signature = RazorpaySignature.hmacSha256Hex(
                razorpayOrderId + "|" + razorpayPaymentId, KEY_SECRET);

        Payment payment = Payment.builder().status(PaymentStatus.PENDING)
                .method(PaymentMethod.CARD).razorpayOrderId(razorpayOrderId).build();
        Order order = orderWith(payment, OrderStatus.PLACED);

        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(orderRepository.findById(50L)).thenReturn(Optional.of(order));
        when(razorpayConfig.getKeySecret()).thenReturn(KEY_SECRET);
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        OrderResponse response = paymentService.verifyAndConfirm(
                req(50L, razorpayOrderId, razorpayPaymentId, signature));

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(payment.getRazorpayPaymentId()).isEqualTo("pay_1");
        assertThat(payment.getPaidAt()).isNotNull();
        assertThat(order.getStatus()).isEqualTo(OrderStatus.CONFIRMED);
        assertThat(response.getStatus()).isEqualTo("CONFIRMED");

        ArgumentCaptor<Object> events = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(events.capture());
        assertThat(events.getValue()).isInstanceOfSatisfying(OrderStatusChangedEvent.class, e -> {
            assertThat(e.orderId()).isEqualTo(50L);
            assertThat(e.userId()).isEqualTo(7L);
            assertThat(e.status()).isEqualTo("CONFIRMED");
        });
    }

    @Test
    void verifyAndConfirm_invalidSignature_throws_orderUnchanged() {
        Payment payment = Payment.builder().status(PaymentStatus.PENDING)
                .method(PaymentMethod.CARD).razorpayOrderId("order_1").build();
        Order order = orderWith(payment, OrderStatus.PLACED);

        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(orderRepository.findById(50L)).thenReturn(Optional.of(order));
        when(razorpayConfig.getKeySecret()).thenReturn(KEY_SECRET);

        assertThatThrownBy(() -> paymentService.verifyAndConfirm(
                req(50L, "order_1", "pay_1", "deadbeefsignature")))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("signature");

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.PENDING);
        assertThat(order.getStatus()).isEqualTo(OrderStatus.PLACED);
        verify(orderRepository, never()).save(any());
        verify(eventPublisher, never()).publishEvent(any());
    }

    @Test
    void verifyAndConfirm_orderNotOwnedByUser_throws() {
        Payment payment = Payment.builder().status(PaymentStatus.PENDING)
                .method(PaymentMethod.CARD).razorpayOrderId("order_1").build();
        Order order = orderWith(payment, OrderStatus.PLACED);
        order.setUser(User.builder().id(999L).email("other@x.com").build());

        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(orderRepository.findById(50L)).thenReturn(Optional.of(order));

        assertThatThrownBy(() -> paymentService.verifyAndConfirm(
                req(50L, "order_1", "pay_1", "sig")))
                .isInstanceOf(com.shopsphere.exception.BadRequestException.class)
                .hasMessageContaining("your own orders");
    }

    // ----- webhook -----

    @Test
    void webhook_paymentCaptured_confirmsOrder_recordsEvent() {
        String body = "{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":"
                + "{\"id\":\"pay_1\",\"order_id\":\"order_1\"}}}}";
        String signature = RazorpaySignature.hmacSha256Hex(body, WEBHOOK_SECRET);

        when(razorpayConfig.isWebhookConfigured()).thenReturn(true);
        when(razorpayConfig.getWebhookSecret()).thenReturn(WEBHOOK_SECRET);
        when(processedEventRepository.existsById("evt_1")).thenReturn(false);

        Payment payment = Payment.builder().status(PaymentStatus.PENDING)
                .method(PaymentMethod.CARD).razorpayOrderId("order_1").build();
        Order order = orderWith(payment, OrderStatus.PLACED);
        when(paymentRepository.findByRazorpayOrderId("order_1")).thenReturn(Optional.of(payment));
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        paymentService.handleWebhook(body, signature, "evt_1");

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(payment.getRazorpayPaymentId()).isEqualTo("pay_1");
        assertThat(order.getStatus()).isEqualTo(OrderStatus.CONFIRMED);
        verify(eventPublisher).publishEvent(any(OrderStatusChangedEvent.class));
        verify(processedEventRepository).save(any(ProcessedGatewayEvent.class));
    }

    @Test
    void webhook_duplicateEvent_isIgnored() {
        String body = "{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":"
                + "{\"id\":\"pay_1\",\"order_id\":\"order_1\"}}}}";
        String signature = RazorpaySignature.hmacSha256Hex(body, WEBHOOK_SECRET);

        when(razorpayConfig.isWebhookConfigured()).thenReturn(true);
        when(razorpayConfig.getWebhookSecret()).thenReturn(WEBHOOK_SECRET);
        when(processedEventRepository.existsById("evt_dup")).thenReturn(true);

        paymentService.handleWebhook(body, signature, "evt_dup");

        verify(paymentRepository, never()).findByRazorpayOrderId(any());
        verify(orderRepository, never()).save(any());
        verify(eventPublisher, never()).publishEvent(any());
        verify(processedEventRepository, never()).save(any());
    }

    @Test
    void webhook_invalidSignature_throws_nothingProcessed() {
        String body = "{\"event\":\"payment.captured\"}";

        when(razorpayConfig.isWebhookConfigured()).thenReturn(true);
        when(razorpayConfig.getWebhookSecret()).thenReturn(WEBHOOK_SECRET);

        assertThatThrownBy(() -> paymentService.handleWebhook(body, "wrongsignature", "evt_x"))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("signature");

        verify(processedEventRepository, never()).save(any());
        verify(orderRepository, never()).save(any());
    }

    @Test
    void webhook_paymentFailed_marksPaymentFailed_leavesOrderPlaced() {
        String body = "{\"event\":\"payment.failed\",\"payload\":{\"payment\":{\"entity\":"
                + "{\"id\":\"pay_2\",\"order_id\":\"order_1\"}}}}";
        String signature = RazorpaySignature.hmacSha256Hex(body, WEBHOOK_SECRET);

        when(razorpayConfig.isWebhookConfigured()).thenReturn(true);
        when(razorpayConfig.getWebhookSecret()).thenReturn(WEBHOOK_SECRET);
        when(processedEventRepository.existsById("evt_f")).thenReturn(false);

        Payment payment = Payment.builder().status(PaymentStatus.PENDING)
                .method(PaymentMethod.CARD).razorpayOrderId("order_1").build();
        Order order = orderWith(payment, OrderStatus.PLACED);
        when(paymentRepository.findByRazorpayOrderId("order_1")).thenReturn(Optional.of(payment));

        paymentService.handleWebhook(body, signature, "evt_f");

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.FAILED);
        assertThat(order.getStatus()).isEqualTo(OrderStatus.PLACED);
        verify(paymentRepository).save(payment);
        verify(eventPublisher, never()).publishEvent(any());
        verify(processedEventRepository).save(any(ProcessedGatewayEvent.class));
    }

    // ----- refund -----

    @Test
    void refund_issuesRazorpayRefund_marksRefunded_cancelsOrder_restoresStock() {
        Product product = Product.builder().id(10L).name("Widget")
                .price(new BigDecimal("100.00")).stockQuantity(3).build();
        Payment payment = Payment.builder().status(PaymentStatus.SUCCESS)
                .method(PaymentMethod.CARD).razorpayOrderId("order_1").razorpayPaymentId("pay_1").build();
        Order order = orderWith(payment, OrderStatus.CONFIRMED);
        order.addItem(OrderItem.builder().product(product).quantity(2).price(product.getPrice()).build());

        when(orderRepository.findById(50L)).thenReturn(Optional.of(order));
        when(productRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        paymentService.refund(50L);

        verify(razorpayClient).refund("pay_1");
        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.REFUNDED);
        assertThat(order.getStatus()).isEqualTo(OrderStatus.CANCELLED);
        assertThat(product.getStockQuantity()).isEqualTo(5); // 3 + 2 restored

        ArgumentCaptor<Object> events = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher, org.mockito.Mockito.atLeastOnce()).publishEvent(events.capture());
        assertThat(events.getAllValues()).anySatisfy(e ->
                assertThat(e).isEqualTo(new StockChangedEvent(10L)));
        assertThat(events.getAllValues()).anySatisfy(e -> {
            assertThat(e).isInstanceOf(OrderStatusChangedEvent.class);
            assertThat(((OrderStatusChangedEvent) e).status()).isEqualTo("CANCELLED");
        });
    }

    @Test
    void refund_nonSuccessfulPayment_throws_noGatewayCall() {
        Payment payment = Payment.builder().status(PaymentStatus.PENDING)
                .method(PaymentMethod.CARD).razorpayOrderId("order_1").razorpayPaymentId("pay_1").build();
        Order order = orderWith(payment, OrderStatus.PLACED);
        when(orderRepository.findById(50L)).thenReturn(Optional.of(order));

        assertThatThrownBy(() -> paymentService.refund(50L))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("successfully paid");

        verify(razorpayClient, never()).refund(any());
        verify(orderRepository, never()).save(any());
    }

    @Test
    void refund_alreadyRefunded_throws() {
        Payment payment = Payment.builder().status(PaymentStatus.REFUNDED)
                .method(PaymentMethod.CARD).razorpayOrderId("order_1").razorpayPaymentId("pay_1").build();
        Order order = orderWith(payment, OrderStatus.CANCELLED);
        when(orderRepository.findById(50L)).thenReturn(Optional.of(order));

        assertThatThrownBy(() -> paymentService.refund(50L))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("already been refunded");

        verify(razorpayClient, never()).refund(any());
    }

    @Test
    void createOrder_notConfigured_throwsPaymentException() {
        when(razorpayConfig.isConfigured()).thenReturn(false);
        Order order = Order.builder().id(50L).totalAmount(new BigDecimal("200.00")).build();

        assertThatThrownBy(() -> paymentService.createOrder(order))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("not available");
    }

    @Test
    void createOrder_configured_callsClientWithMinorUnits() {
        when(razorpayConfig.isConfigured()).thenReturn(true);
        when(razorpayConfig.getCurrency()).thenReturn("INR");
        when(razorpayClient.createOrder(eq(20000L), eq("INR"), any(), any())).thenReturn("order_new");
        Order order = Order.builder().id(50L).totalAmount(new BigDecimal("200.00")).build();

        String id = paymentService.createOrder(order);

        assertThat(id).isEqualTo("order_new");
        verify(razorpayClient).createOrder(eq(20000L), eq("INR"), eq("rcpt_50"), any());
    }

    private PaymentVerificationRequest req(Long orderId, String rzpOrderId, String rzpPaymentId, String sig) {
        PaymentVerificationRequest r = new PaymentVerificationRequest();
        r.setOrderId(orderId);
        r.setRazorpayOrderId(rzpOrderId);
        r.setRazorpayPaymentId(rzpPaymentId);
        r.setRazorpaySignature(sig);
        return r;
    }
}
