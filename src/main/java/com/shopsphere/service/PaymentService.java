package com.shopsphere.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shopsphere.config.RazorpayConfig;
import com.shopsphere.dto.OrderResponse;
import com.shopsphere.dto.PaymentVerificationRequest;
import com.shopsphere.entity.*;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.exception.PaymentException;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.mapper.OrderMapper;
import com.shopsphere.realtime.OrderStatusChangedEvent;
import com.shopsphere.realtime.StockChangedEvent;
import com.shopsphere.repository.OrderRepository;
import com.shopsphere.repository.PaymentRepository;
import com.shopsphere.repository.ProcessedGatewayEventRepository;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.security.RazorpaySignature;
import com.shopsphere.security.SecurityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * Razorpay payment handling (§9): creating gateway orders at checkout, verifying the checkout
 * callback signature, processing signed webhooks (idempotently), and issuing refunds.
 *
 * <p>State transitions publish an {@link OrderStatusChangedEvent}; the existing AFTER_COMMIT
 * broadcaster then pushes the update to {@code /topic/orders/{userId}} — no new realtime code.
 *
 * <p>Only {@link RazorpayClient} touches the network; everything here (signature checks, DB,
 * events) is local and unit-testable.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final RazorpayConfig razorpayConfig;
    private final RazorpayClient razorpayClient;
    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final ProcessedGatewayEventRepository processedEventRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final SecurityUtils securityUtils;
    private final ObjectMapper objectMapper;

    public PaymentService(RazorpayConfig razorpayConfig,
                          RazorpayClient razorpayClient,
                          PaymentRepository paymentRepository,
                          OrderRepository orderRepository,
                          ProductRepository productRepository,
                          ProcessedGatewayEventRepository processedEventRepository,
                          ApplicationEventPublisher eventPublisher,
                          SecurityUtils securityUtils,
                          ObjectMapper objectMapper) {
        this.razorpayConfig = razorpayConfig;
        this.razorpayClient = razorpayClient;
        this.paymentRepository = paymentRepository;
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.processedEventRepository = processedEventRepository;
        this.eventPublisher = eventPublisher;
        this.securityUtils = securityUtils;
        this.objectMapper = objectMapper;
    }

    // ----- Checkout: create a Razorpay order for a saved (PLACED) order -----

    /** True when Razorpay keys are present, i.e. real online payments can be processed. */
    public boolean isRazorpayEnabled() {
        return razorpayConfig.isConfigured();
    }

    public String getKeyId() {
        return razorpayConfig.getKeyId();
    }

    public String getCurrency() {
        return razorpayConfig.getCurrency();
    }

    public long toMinorUnits(BigDecimal amount) {
        // rupees(scale 2) -> paise. e.g. 200.00 -> 20000.
        return amount.movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
    }

    /**
     * Create a Razorpay order for the given (already-persisted) app order and return its id
     * (order_...). Tagged with {@code notes.orderId} so the webhook/callback can be tied back.
     */
    public String createOrder(Order order) {
        if (!isRazorpayEnabled()) {
            throw new PaymentException("Online payments are not available right now. "
                    + "Please choose Cash on Delivery or try again later.");
        }
        return razorpayClient.createOrder(
                toMinorUnits(order.getTotalAmount()),
                razorpayConfig.getCurrency(),
                "rcpt_" + order.getId(),
                Map.of("orderId", String.valueOf(order.getId())));
    }

    // ----- Verify the checkout callback (primary confirmation path) -----

    /**
     * Verify the Razorpay Checkout callback signature and confirm the order (§9). Called by the
     * customer's browser right after a successful payment in the widget.
     */
    @Transactional
    public OrderResponse verifyAndConfirm(PaymentVerificationRequest req) {
        User user = securityUtils.getCurrentUser();
        Order order = orderRepository.findById(req.getOrderId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Order not found with id: " + req.getOrderId()));
        if (!order.getUser().getId().equals(user.getId())) {
            throw new BadRequestException("You can only pay for your own orders");
        }

        Payment payment = order.getPayment();
        if (payment == null || payment.getRazorpayOrderId() == null) {
            throw new PaymentException("This order has no online payment to verify.");
        }
        if (!payment.getRazorpayOrderId().equals(req.getRazorpayOrderId())) {
            throw new PaymentException("Payment does not match this order.");
        }

        if (!RazorpaySignature.verifyPaymentSignature(req.getRazorpayOrderId(),
                req.getRazorpayPaymentId(), req.getRazorpaySignature(), razorpayConfig.getKeySecret())) {
            throw new PaymentException("Payment signature verification failed.");
        }

        confirmPayment(payment, req.getRazorpayPaymentId());
        return OrderMapper.toResponse(order);
    }

    // ----- Webhook (reliability backup) -----

    /**
     * Verify and process a Razorpay webhook (§9). Verifies the body signature, ignores events
     * already processed (idempotency), applies the state change, then records the event id.
     */
    @Transactional(rollbackFor = Exception.class)
    public void handleWebhook(String rawBody, String signature, String eventId) {
        if (!razorpayConfig.isWebhookConfigured()) {
            throw new PaymentException("Razorpay webhook secret is not configured.");
        }
        if (!RazorpaySignature.verifyWebhookSignature(rawBody, signature, razorpayConfig.getWebhookSecret())) {
            throw new PaymentException("Invalid Razorpay webhook signature.");
        }

        JsonNode root = readJson(rawBody);
        String eventType = root.path("event").asText();
        // Dedup key: prefer the event-id header; fall back to event+payment id if absent.
        JsonNode paymentEntity = root.path("payload").path("payment").path("entity");
        String razorpayPaymentId = paymentEntity.path("id").asText(null);
        String razorpayOrderId = paymentEntity.path("order_id").asText(null);
        String dedupKey = (eventId != null && !eventId.isBlank())
                ? eventId
                : eventType + ":" + razorpayPaymentId;

        if (processedEventRepository.existsById(dedupKey)) {
            log.info("Razorpay event {} already processed — ignoring duplicate.", dedupKey);
            return;
        }

        switch (eventType) {
            case "payment.captured", "order.paid" -> confirmByRazorpayOrderId(razorpayOrderId, razorpayPaymentId);
            case "payment.failed" -> failByRazorpayOrderId(razorpayOrderId);
            default -> log.info("Ignoring unhandled Razorpay event type: {}", eventType);
        }

        processedEventRepository.save(ProcessedGatewayEvent.builder()
                .eventId(dedupKey)
                .eventType(eventType)
                .processedAt(LocalDateTime.now())
                .build());
    }

    private void confirmByRazorpayOrderId(String razorpayOrderId, String razorpayPaymentId) {
        if (razorpayOrderId == null) {
            log.warn("Webhook payment has no order_id — skipping.");
            return;
        }
        Payment payment = paymentRepository.findByRazorpayOrderId(razorpayOrderId).orElse(null);
        if (payment == null) {
            log.warn("No payment found for Razorpay order {} — acknowledging webhook.", razorpayOrderId);
            return;
        }
        if (payment.getStatus() == PaymentStatus.SUCCESS) {
            return; // already confirmed (e.g. via the callback)
        }
        confirmPayment(payment, razorpayPaymentId);
    }

    private void failByRazorpayOrderId(String razorpayOrderId) {
        if (razorpayOrderId == null) {
            return;
        }
        Payment payment = paymentRepository.findByRazorpayOrderId(razorpayOrderId).orElse(null);
        if (payment == null || payment.getStatus() == PaymentStatus.SUCCESS) {
            return;
        }
        // Leave the order PLACED so the customer can retry payment or cancel it.
        payment.setStatus(PaymentStatus.FAILED);
        paymentRepository.save(payment);
        log.info("Razorpay order {} payment marked FAILED; order left PLACED.", razorpayOrderId);
    }

    /** Mark a payment successful and confirm its order, broadcasting the status change. */
    private void confirmPayment(Payment payment, String razorpayPaymentId) {
        payment.setStatus(PaymentStatus.SUCCESS);
        payment.setRazorpayPaymentId(razorpayPaymentId);
        payment.setPaidAt(LocalDateTime.now());
        if (razorpayPaymentId != null) {
            payment.setTransactionRef(razorpayPaymentId);
        }

        Order order = payment.getOrder();
        order.setStatus(OrderStatus.CONFIRMED);
        orderRepository.save(order); // cascades payment

        eventPublisher.publishEvent(new OrderStatusChangedEvent(
                order.getId(), order.getUser().getId(),
                OrderStatus.CONFIRMED.name(), LocalDateTime.now()));
        log.info("Order {} confirmed after successful payment {}.", order.getId(), razorpayPaymentId);
    }

    // ----- Refund (admin, §9) -----

    /**
     * Refund a paid order: issues a Razorpay refund, marks the payment REFUNDED, cancels the
     * order and restores stock.
     */
    @Transactional
    public void refund(Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));

        Payment payment = order.getPayment();
        if (payment == null || payment.getRazorpayPaymentId() == null) {
            throw new PaymentException("Order " + orderId + " has no captured online payment to refund.");
        }
        if (payment.getStatus() == PaymentStatus.REFUNDED) {
            throw new PaymentException("Order " + orderId + " has already been refunded.");
        }
        if (payment.getStatus() != PaymentStatus.SUCCESS) {
            throw new PaymentException("Only a successfully paid order can be refunded (current: "
                    + payment.getStatus() + ").");
        }

        razorpayClient.refund(payment.getRazorpayPaymentId());

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

    private JsonNode readJson(String body) {
        try {
            return objectMapper.readTree(body);
        } catch (Exception e) {
            throw new PaymentException("Malformed webhook payload.", e);
        }
    }
}
