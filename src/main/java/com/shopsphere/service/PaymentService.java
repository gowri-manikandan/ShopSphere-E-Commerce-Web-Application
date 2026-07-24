package com.shopsphere.service;

import com.shopsphere.config.StripeConfig;
import com.shopsphere.entity.*;
import com.shopsphere.exception.PaymentException;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.realtime.OrderStatusChangedEvent;
import com.shopsphere.realtime.StockChangedEvent;
import com.shopsphere.repository.OrderRepository;
import com.shopsphere.repository.PaymentRepository;
import com.shopsphere.repository.ProcessedStripeEventRepository;
import com.shopsphere.repository.ProductRepository;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.Event;
import com.stripe.model.PaymentIntent;
import com.stripe.model.Refund;
import com.stripe.model.StripeObject;
import com.stripe.net.RequestOptions;
import com.stripe.net.Webhook;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.param.RefundCreateParams;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Stripe payment handling (§9): creating PaymentIntents at checkout, processing signed
 * webhooks (idempotently), and issuing refunds.
 *
 * <p>Order/payment state transitions that this service performs publish an
 * {@link OrderStatusChangedEvent}; the existing AFTER_COMMIT broadcaster then pushes the
 * update to {@code /topic/orders/{userId}} — no new realtime code is needed here.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final StripeConfig stripeConfig;
    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final ProcessedStripeEventRepository processedEventRepository;
    private final ApplicationEventPublisher eventPublisher;

    public PaymentService(StripeConfig stripeConfig,
                          PaymentRepository paymentRepository,
                          OrderRepository orderRepository,
                          ProductRepository productRepository,
                          ProcessedStripeEventRepository processedEventRepository,
                          ApplicationEventPublisher eventPublisher) {
        this.stripeConfig = stripeConfig;
        this.paymentRepository = paymentRepository;
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.processedEventRepository = processedEventRepository;
        this.eventPublisher = eventPublisher;
    }

    // ----- Checkout: create a PaymentIntent for a saved (PLACED) order -----

    /**
     * Create a Stripe PaymentIntent for the given (already-persisted) order. Called from
     * within the checkout transaction after the order has an id, so we can tag the intent
     * with {@code metadata.orderId} and correlate the webhook back to it.
     *
     * <p>If the surrounding transaction later rolls back (e.g. a stock conflict on retry),
     * the created intent is simply never confirmed and expires on Stripe's side — an
     * acceptable trade-off at this scale versus creating the intent outside the transaction.
     */
    public PaymentIntent createIntent(Order order) {
        if (!stripeConfig.isConfigured()) {
            throw new PaymentException("Card payments are not available right now. "
                    + "Please choose Cash on Delivery or try again later.");
        }
        long amountMinor = toMinorUnits(order.getTotalAmount());
        PaymentIntentCreateParams params = PaymentIntentCreateParams.builder()
                .setAmount(amountMinor)
                .setCurrency(stripeConfig.getCurrency())
                .putMetadata("orderId", String.valueOf(order.getId()))
                .setAutomaticPaymentMethods(
                        PaymentIntentCreateParams.AutomaticPaymentMethods.builder()
                                .setEnabled(true)
                                .build())
                .build();
        try {
            return PaymentIntent.create(params);
        } catch (StripeException e) {
            throw new PaymentException("Could not initiate payment: " + e.getMessage(), e);
        }
    }

    public String getPublishableKey() {
        return stripeConfig.getPublishableKey();
    }

    /** True when a Stripe secret key is present, i.e. real card payments can be processed. */
    public boolean isStripeEnabled() {
        return stripeConfig.isConfigured();
    }

    // ----- Webhook -----

    /**
     * Verify and process a Stripe webhook (§9). Verifies the signature, ignores events we
     * have already processed (idempotency), applies the state change, then records the event
     * id. Runs in one transaction so the dedup insert + state change commit atomically and
     * the status broadcast fires AFTER_COMMIT.
     */
    @Transactional(rollbackFor = Exception.class)
    public void handleWebhook(String payload, String signatureHeader) throws SignatureVerificationException {
        if (!stripeConfig.isWebhookConfigured()) {
            throw new PaymentException("Stripe webhook secret is not configured.");
        }

        Event event = Webhook.constructEvent(payload, signatureHeader, stripeConfig.getWebhookSecret());

        if (processedEventRepository.existsById(event.getId())) {
            log.info("Stripe event {} already processed — ignoring duplicate.", event.getId());
            return;
        }

        switch (event.getType()) {
            case "payment_intent.succeeded" -> markPaymentSucceeded(extractPaymentIntentId(event));
            case "payment_intent.payment_failed" -> markPaymentFailed(extractPaymentIntentId(event));
            default -> log.info("Ignoring unhandled Stripe event type: {}", event.getType());
        }

        processedEventRepository.save(ProcessedStripeEvent.builder()
                .eventId(event.getId())
                .eventType(event.getType())
                .processedAt(LocalDateTime.now())
                .build());
    }

    private void markPaymentSucceeded(String paymentIntentId) {
        Payment payment = paymentRepository.findByPaymentIntentId(paymentIntentId).orElse(null);
        if (payment == null) {
            // Intent we don't recognise (e.g. created by another system); ack so Stripe stops retrying.
            log.warn("No payment found for PaymentIntent {} — acknowledging succeeded event.", paymentIntentId);
            return;
        }
        if (payment.getStatus() == PaymentStatus.SUCCESS) {
            return; // already confirmed
        }

        payment.setStatus(PaymentStatus.SUCCESS);
        payment.setPaidAt(LocalDateTime.now());

        Order order = payment.getOrder();
        order.setStatus(OrderStatus.CONFIRMED);
        orderRepository.save(order); // cascades payment

        eventPublisher.publishEvent(new OrderStatusChangedEvent(
                order.getId(), order.getUser().getId(),
                OrderStatus.CONFIRMED.name(), LocalDateTime.now()));
        log.info("Order {} confirmed after successful payment {}.", order.getId(), paymentIntentId);
    }

    private void markPaymentFailed(String paymentIntentId) {
        Payment payment = paymentRepository.findByPaymentIntentId(paymentIntentId).orElse(null);
        if (payment == null) {
            log.warn("No payment found for PaymentIntent {} — acknowledging failed event.", paymentIntentId);
            return;
        }
        // Leave the order PLACED so the customer can retry payment or cancel it (§9 decision).
        payment.setStatus(PaymentStatus.FAILED);
        paymentRepository.save(payment);
        log.info("Payment {} marked FAILED; order left PLACED for retry/cancel.", paymentIntentId);
    }

    private String extractPaymentIntentId(Event event) {
        StripeObject object = event.getDataObjectDeserializer().getObject().orElseThrow(() ->
                new PaymentException("Could not deserialize Stripe event " + event.getId()
                        + " (API version mismatch?)"));
        if (object instanceof PaymentIntent intent) {
            return intent.getId();
        }
        throw new PaymentException("Unexpected object type for event " + event.getId());
    }

    // ----- Refund (admin, §9) -----

    /**
     * Refund a paid order: issues a Stripe refund, marks the payment REFUNDED, cancels the
     * order and restores stock. The Stripe call uses an idempotency key so a retried admin
     * request (e.g. after a stock-conflict 409) never refunds twice.
     */
    @Transactional
    public void refund(Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));

        Payment payment = order.getPayment();
        if (payment == null || payment.getPaymentIntentId() == null) {
            throw new PaymentException("Order " + orderId + " has no Stripe payment to refund.");
        }
        if (payment.getStatus() == PaymentStatus.REFUNDED) {
            throw new PaymentException("Order " + orderId + " has already been refunded.");
        }
        if (payment.getStatus() != PaymentStatus.SUCCESS) {
            throw new PaymentException("Only a successfully paid order can be refunded (current: "
                    + payment.getStatus() + ").");
        }

        RefundCreateParams params = RefundCreateParams.builder()
                .setPaymentIntent(payment.getPaymentIntentId())
                .build();
        RequestOptions options = RequestOptions.builder()
                .setIdempotencyKey("refund-order-" + orderId)
                .build();
        try {
            Refund.create(params, options);
        } catch (StripeException e) {
            throw new PaymentException("Refund failed: " + e.getMessage(), e);
        }

        payment.setStatus(PaymentStatus.REFUNDED);
        order.setStatus(OrderStatus.CANCELLED);

        // Restore stock (AFTER_COMMIT listener broadcasts the new level — §5)
        for (OrderItem item : order.getItems()) {
            Product product = item.getProduct();
            if (product != null) {
                product.setStockQuantity(product.getStockQuantity() + item.getQuantity());
                productRepository.save(product);
                eventPublisher.publishEvent(new StockChangedEvent(product.getId()));
            }
        }

        orderRepository.save(order); // cascades payment
        eventPublisher.publishEvent(new OrderStatusChangedEvent(
                order.getId(), order.getUser().getId(),
                OrderStatus.CANCELLED.name(), LocalDateTime.now()));
        log.info("Order {} refunded and cancelled.", orderId);
    }

    // ----- helpers -----

    private long toMinorUnits(BigDecimal amount) {
        // BigDecimal(scale 2) -> integer minor units (cents). e.g. 200.00 -> 20000.
        return amount.movePointRight(2).setScale(0, java.math.RoundingMode.HALF_UP).longValueExact();
    }
}
