package com.shopsphere.service;

import com.shopsphere.config.StripeConfig;
import com.shopsphere.entity.*;
import com.shopsphere.exception.PaymentException;
import com.shopsphere.realtime.OrderStatusChangedEvent;
import com.shopsphere.realtime.StockChangedEvent;
import com.shopsphere.repository.OrderRepository;
import com.shopsphere.repository.PaymentRepository;
import com.shopsphere.repository.ProcessedStripeEventRepository;
import com.shopsphere.repository.ProductRepository;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.PaymentIntent;
import com.stripe.model.Refund;
import com.stripe.net.RequestOptions;
import com.stripe.net.Webhook;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.param.RefundCreateParams;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for Stripe payment handling (§9). Stripe's static SDK entry points
 * ({@code Webhook.constructEvent}, {@code PaymentIntent.create}, {@code Refund.create}) are
 * replaced with Mockito static mocks, so no network call is made.
 */
@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock StripeConfig stripeConfig;
    @Mock PaymentRepository paymentRepository;
    @Mock OrderRepository orderRepository;
    @Mock ProductRepository productRepository;
    @Mock ProcessedStripeEventRepository processedEventRepository;
    @Mock ApplicationEventPublisher eventPublisher;

    PaymentService paymentService;

    @BeforeEach
    void setUp() {
        paymentService = new PaymentService(stripeConfig, paymentRepository, orderRepository,
                productRepository, processedEventRepository, eventPublisher);
    }

    private User user() {
        return User.builder().id(7L).email("buyer@shopsphere.com").name("Buyer").build();
    }

    private Order orderWith(Payment payment, OrderStatus status) {
        Order order = Order.builder().id(50L).user(user()).status(status)
                .totalAmount(new BigDecimal("200.00")).items(new ArrayList<>()).payment(payment).build();
        payment.setOrder(order);
        return order;
    }

    private Event stubEvent(String eventId, String type, String paymentIntentId) {
        Event event = mock(Event.class);
        when(event.getId()).thenReturn(eventId);
        when(event.getType()).thenReturn(type);
        EventDataObjectDeserializer deserializer = mock(EventDataObjectDeserializer.class);
        PaymentIntent intent = mock(PaymentIntent.class);
        when(intent.getId()).thenReturn(paymentIntentId);
        when(deserializer.getObject()).thenReturn(Optional.of(intent));
        when(event.getDataObjectDeserializer()).thenReturn(deserializer);
        return event;
    }

    // ----- webhook: success -----

    @Test
    void webhook_paymentSucceeded_confirmsOrder_marksPaid_publishesEvent_recordsEvent()
            throws SignatureVerificationException {
        when(stripeConfig.isWebhookConfigured()).thenReturn(true);
        when(stripeConfig.getWebhookSecret()).thenReturn("whsec_x");
        when(processedEventRepository.existsById("evt_1")).thenReturn(false);

        Payment payment = Payment.builder().status(PaymentStatus.PENDING)
                .method(PaymentMethod.CARD).paymentIntentId("pi_1").build();
        Order order = orderWith(payment, OrderStatus.PLACED);
        when(paymentRepository.findByPaymentIntentId("pi_1")).thenReturn(Optional.of(payment));
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        Event event = stubEvent("evt_1", "payment_intent.succeeded", "pi_1");
        try (MockedStatic<Webhook> ws = mockStatic(Webhook.class)) {
            ws.when(() -> Webhook.constructEvent("payload", "sig", "whsec_x")).thenReturn(event);
            paymentService.handleWebhook("payload", "sig");
        }

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(payment.getPaidAt()).isNotNull();
        assertThat(order.getStatus()).isEqualTo(OrderStatus.CONFIRMED);

        ArgumentCaptor<Object> events = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(events.capture());
        assertThat(events.getValue()).isInstanceOfSatisfying(OrderStatusChangedEvent.class, e -> {
            assertThat(e.orderId()).isEqualTo(50L);
            assertThat(e.userId()).isEqualTo(7L);
            assertThat(e.status()).isEqualTo("CONFIRMED");
        });
        verify(processedEventRepository).save(any(ProcessedStripeEvent.class));
    }

    // ----- webhook: idempotency -----

    @Test
    void webhook_duplicateEvent_isIgnored() throws SignatureVerificationException {
        when(stripeConfig.isWebhookConfigured()).thenReturn(true);
        when(stripeConfig.getWebhookSecret()).thenReturn("whsec_x");
        when(processedEventRepository.existsById("evt_dup")).thenReturn(true);

        Event event = mock(Event.class);
        when(event.getId()).thenReturn("evt_dup");
        try (MockedStatic<Webhook> ws = mockStatic(Webhook.class)) {
            ws.when(() -> Webhook.constructEvent(any(), any(), any())).thenReturn(event);
            paymentService.handleWebhook("payload", "sig");
        }

        // No state change, no re-processing, no second event record.
        verify(paymentRepository, never()).findByPaymentIntentId(any());
        verify(orderRepository, never()).save(any());
        verify(eventPublisher, never()).publishEvent(any());
        verify(processedEventRepository, never()).save(any());
    }

    // ----- webhook: bad signature -----

    @Test
    void webhook_invalidSignature_throws_nothingProcessed() {
        when(stripeConfig.isWebhookConfigured()).thenReturn(true);
        when(stripeConfig.getWebhookSecret()).thenReturn("whsec_x");

        try (MockedStatic<Webhook> ws = mockStatic(Webhook.class)) {
            ws.when(() -> Webhook.constructEvent(any(), any(), any()))
                    .thenThrow(new SignatureVerificationException("bad signature", "sig"));

            assertThatThrownBy(() -> paymentService.handleWebhook("payload", "sig"))
                    .isInstanceOf(SignatureVerificationException.class);
        }

        verify(processedEventRepository, never()).save(any());
        verify(orderRepository, never()).save(any());
    }

    // ----- webhook: failure -----

    @Test
    void webhook_paymentFailed_marksPaymentFailed_leavesOrderPlaced_noBroadcast()
            throws SignatureVerificationException {
        when(stripeConfig.isWebhookConfigured()).thenReturn(true);
        when(stripeConfig.getWebhookSecret()).thenReturn("whsec_x");
        when(processedEventRepository.existsById("evt_f")).thenReturn(false);

        Payment payment = Payment.builder().status(PaymentStatus.PENDING)
                .method(PaymentMethod.CARD).paymentIntentId("pi_2").build();
        Order order = orderWith(payment, OrderStatus.PLACED);
        when(paymentRepository.findByPaymentIntentId("pi_2")).thenReturn(Optional.of(payment));

        Event event = stubEvent("evt_f", "payment_intent.payment_failed", "pi_2");
        try (MockedStatic<Webhook> ws = mockStatic(Webhook.class)) {
            ws.when(() -> Webhook.constructEvent(any(), any(), any())).thenReturn(event);
            paymentService.handleWebhook("payload", "sig");
        }

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.FAILED);
        assertThat(order.getStatus()).isEqualTo(OrderStatus.PLACED); // customer can retry / cancel
        verify(paymentRepository).save(payment);
        verify(eventPublisher, never()).publishEvent(any());
        verify(processedEventRepository).save(any(ProcessedStripeEvent.class));
    }

    // ----- refund -----

    @Test
    void refund_issuesStripeRefund_marksRefunded_cancelsOrder_restoresStock() {
        Product product = Product.builder().id(10L).name("Widget")
                .price(new BigDecimal("100.00")).stockQuantity(3).build();
        Payment payment = Payment.builder().status(PaymentStatus.SUCCESS)
                .method(PaymentMethod.CARD).paymentIntentId("pi_1").build();
        Order order = orderWith(payment, OrderStatus.CONFIRMED);
        order.addItem(OrderItem.builder().product(product).quantity(2).price(product.getPrice()).build());

        when(orderRepository.findById(50L)).thenReturn(Optional.of(order));
        when(productRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(orderRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        try (MockedStatic<Refund> rs = mockStatic(Refund.class)) {
            rs.when(() -> Refund.create(any(RefundCreateParams.class), any(RequestOptions.class)))
                    .thenReturn(mock(Refund.class));
            paymentService.refund(50L);
            rs.verify(() -> Refund.create(any(RefundCreateParams.class), any(RequestOptions.class)));
        }

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.REFUNDED);
        assertThat(order.getStatus()).isEqualTo(OrderStatus.CANCELLED);
        assertThat(product.getStockQuantity()).isEqualTo(5); // 3 + 2 restored

        ArgumentCaptor<Object> events = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher, org.mockito.Mockito.atLeastOnce()).publishEvent(events.capture());
        assertThat(events.getAllValues()).anySatisfy(e ->
                assertThat(e).isEqualTo(new StockChangedEvent(10L)));
        assertThat(events.getAllValues()).anySatisfy(e -> {
            assertThat(e).isInstanceOf(OrderStatusChangedEvent.class);
            OrderStatusChangedEvent ose = (OrderStatusChangedEvent) e;
            assertThat(ose.status()).isEqualTo("CANCELLED");
            assertThat(ose.orderId()).isEqualTo(50L);
        });
    }

    @Test
    void refund_nonSuccessfulPayment_throws_noStripeCall() {
        Payment payment = Payment.builder().status(PaymentStatus.PENDING)
                .method(PaymentMethod.CARD).paymentIntentId("pi_1").build();
        Order order = orderWith(payment, OrderStatus.PLACED);
        when(orderRepository.findById(50L)).thenReturn(Optional.of(order));

        assertThatThrownBy(() -> paymentService.refund(50L))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("successfully paid");

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.PENDING);
        verify(orderRepository, never()).save(any());
    }

    @Test
    void refund_alreadyRefunded_throws() {
        Payment payment = Payment.builder().status(PaymentStatus.REFUNDED)
                .method(PaymentMethod.CARD).paymentIntentId("pi_1").build();
        Order order = orderWith(payment, OrderStatus.CANCELLED);
        when(orderRepository.findById(50L)).thenReturn(Optional.of(order));

        assertThatThrownBy(() -> paymentService.refund(50L))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("already been refunded");
    }

    // ----- createIntent -----

    @Test
    void createIntent_notConfigured_throwsPaymentException() {
        when(stripeConfig.isConfigured()).thenReturn(false);
        Order order = Order.builder().id(50L).totalAmount(new BigDecimal("200.00")).build();

        assertThatThrownBy(() -> paymentService.createIntent(order))
                .isInstanceOf(PaymentException.class)
                .hasMessageContaining("not available");
    }

    @Test
    void createIntent_configured_buildsIntentWithMinorUnitsAndCurrency() {
        when(stripeConfig.isConfigured()).thenReturn(true);
        when(stripeConfig.getCurrency()).thenReturn("usd");
        Order order = Order.builder().id(50L).totalAmount(new BigDecimal("200.00")).build();

        PaymentIntent intent = mock(PaymentIntent.class);
        ArgumentCaptor<PaymentIntentCreateParams> params =
                ArgumentCaptor.forClass(PaymentIntentCreateParams.class);
        try (MockedStatic<PaymentIntent> ps = mockStatic(PaymentIntent.class)) {
            ps.when(() -> PaymentIntent.create(any(PaymentIntentCreateParams.class))).thenReturn(intent);

            PaymentIntent result = paymentService.createIntent(order);

            assertThat(result).isSameAs(intent);
            ps.verify(() -> PaymentIntent.create(params.capture()));
        }
        assertThat(params.getValue().getAmount()).isEqualTo(20000L); // 200.00 -> cents
        assertThat(params.getValue().getCurrency()).isEqualTo("usd");
        assertThat(params.getValue().getMetadata()).containsEntry("orderId", "50");
    }
}
