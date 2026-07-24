package com.shopsphere.service;

import com.shopsphere.dto.CheckoutResponse;
import com.shopsphere.dto.OrderRequest;
import com.shopsphere.dto.OrderResponse;
import com.shopsphere.entity.*;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.mapper.OrderMapper;
import com.shopsphere.realtime.OrderStatusChangedEvent;
import com.shopsphere.realtime.StockChangedEvent;
import com.shopsphere.repository.*;
import com.shopsphere.security.SecurityUtils;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

@Service
public class OrderService {

    // A concurrency conflict means "someone bought/restocked the same product this instant".
    // Under real DB contention this surfaces two ways: an optimistic-lock failure (@Version
    // mismatch) OR an InnoDB deadlock (multiple row locks per checkout). Both are transient
    // ConcurrencyFailureExceptions; retrying re-reads fresh stock and usually succeeds, so we
    // surface a 409 only after exhausting attempts.
    private static final int MAX_STOCK_CONFLICT_ATTEMPTS = 3;

    private final OrderRepository orderRepository;
    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final AddressRepository addressRepository;
    private final SecurityUtils securityUtils;
    private final ApplicationEventPublisher eventPublisher;
    private final PaymentService paymentService;
    private final OrderService self;

    public OrderService(OrderRepository orderRepository,
                        CartItemRepository cartItemRepository,
                        ProductRepository productRepository,
                        AddressRepository addressRepository,
                        SecurityUtils securityUtils,
                        ApplicationEventPublisher eventPublisher,
                        PaymentService paymentService,
                        @Lazy OrderService self) {
        this.orderRepository = orderRepository;
        this.cartItemRepository = cartItemRepository;
        this.productRepository = productRepository;
        this.addressRepository = addressRepository;
        this.securityUtils = securityUtils;
        this.eventPublisher = eventPublisher;
        this.paymentService = paymentService;
        // Own proxy: the retry loop must call the @Transactional methods through the
        // proxy (self-invocation via `this` would skip transaction handling entirely).
        this.self = self;
    }

    /**
     * Full checkout flow, all in ONE transaction:
     *  1. Read the user's cart (must not be empty)
     *  2. Validate stock for each item
     *  3. Create the Order + OrderItems (price snapshot)
     *  4. Deduct stock from products
     *  5. Create the Payment (PENDING). Online orders get a Razorpay order and stay PENDING
     *     until the checkout callback/webhook confirms them; COD stays PENDING until delivery.
     *  6. Clear the cart
     * If anything throws, the whole thing rolls back.
     *
     * Retried on optimistic-lock conflicts: a concurrent checkout of the same product
     * bumps Product.version, which fails this transaction at commit — rerunning it
     * re-reads the fresh stock and re-validates.
     */
    public CheckoutResponse checkout(OrderRequest request) {
        return withStockConflictRetry(() -> self.doCheckout(request));
    }

    @Transactional
    public CheckoutResponse doCheckout(OrderRequest request) {
        User user = securityUtils.getCurrentUser();

        List<CartItem> cartItems = cartItemRepository.findByUserId(user.getId());
        if (cartItems.isEmpty()) {
            throw new BadRequestException("Your cart is empty");
        }

        Address address = addressRepository.findById(request.getAddressId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Address not found with id: " + request.getAddressId()));
        if (!address.getUser().getId().equals(user.getId())) {
            throw new BadRequestException("Invalid shipping address");
        }

        PaymentMethod method = parsePaymentMethod(request.getPaymentMethod());

        Order order = Order.builder()
                .user(user)
                .address(address)
                .status(OrderStatus.PLACED)
                .totalAmount(BigDecimal.ZERO)
                .build();

        BigDecimal total = BigDecimal.ZERO;

        for (CartItem cartItem : cartItems) {
            Product product = cartItem.getProduct();

            if (product.getStockQuantity() < cartItem.getQuantity()) {
                throw new BadRequestException("Not enough stock for product: " + product.getName());
            }

            // Deduct stock (AFTER_COMMIT listener broadcasts the new level — §5)
            product.setStockQuantity(product.getStockQuantity() - cartItem.getQuantity());
            productRepository.save(product);
            eventPublisher.publishEvent(new StockChangedEvent(product.getId()));

            // Snapshot price at purchase time
            OrderItem orderItem = OrderItem.builder()
                    .product(product)
                    .quantity(cartItem.getQuantity())
                    .price(product.getPrice())
                    .build();
            order.addItem(orderItem);

            total = total.add(product.getPrice().multiply(BigDecimal.valueOf(cartItem.getQuantity())));
        }

        order.setTotalAmount(total);

        boolean isCod = method == PaymentMethod.COD;

        // Payment starts PENDING for everything. COD is settled on delivery; online orders are
        // confirmed by the Razorpay checkout callback / webhook (§9).
        Payment payment = Payment.builder()
                .order(order)
                .amount(total)
                .method(method)
                .status(PaymentStatus.PENDING)
                .transactionRef(isCod
                        ? "COD-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase()
                        : null)
                .paidAt(null)
                .build();
        order.setPayment(payment);

        Order saved = orderRepository.save(order); // cascades items + payment, assigns ids

        String razorpayOrderId = null;
        if (!isCod) {
            if (paymentService.isRazorpayEnabled()) {
                // Order now has an id, so the gateway order can carry notes.orderId for the
                // callback/webhook. A Razorpay failure throws PaymentException -> rolls back
                // this transaction, restoring the stock we just deducted.
                razorpayOrderId = paymentService.createOrder(saved);
                payment.setRazorpayOrderId(razorpayOrderId);
                payment.setTransactionRef(razorpayOrderId);
            } else {
                // Razorpay not configured (local/dev): mock an immediate successful payment so
                // checkout still completes end-to-end without live payments. In prod Razorpay
                // is always configured and this branch is never taken.
                payment.setStatus(PaymentStatus.SUCCESS);
                payment.setPaidAt(LocalDateTime.now());
                payment.setTransactionRef(
                        "MOCK-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase());
                order.setStatus(OrderStatus.CONFIRMED);
            }
        }

        // Empty the cart
        cartItemRepository.deleteByUserId(user.getId());

        CheckoutResponse.CheckoutResponseBuilder response = CheckoutResponse.builder()
                .order(OrderMapper.toResponse(saved));
        if (razorpayOrderId != null) {
            // Everything the Razorpay Checkout widget needs on the frontend.
            response.razorpayOrderId(razorpayOrderId)
                    .razorpayKeyId(paymentService.getKeyId())
                    .amountInPaise(paymentService.toMinorUnits(saved.getTotalAmount()))
                    .currency(paymentService.getCurrency())
                    .prefillName(user.getName())
                    .prefillEmail(user.getEmail())
                    .prefillContact(address.getPhone());
        }
        return response.build();
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> getMyOrders() {
        User user = securityUtils.getCurrentUser();
        return orderRepository.findByUserIdOrderByOrderDateDesc(user.getId()).stream()
                .map(OrderMapper::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public OrderResponse getMyOrderById(Long orderId) {
        User user = securityUtils.getCurrentUser();
        Order order = findOrder(orderId);
        if (!order.getUser().getId().equals(user.getId())) {
            throw new BadRequestException("You can only view your own orders");
        }
        return OrderMapper.toResponse(order);
    }

    // ----- Admin operations -----

    @Transactional(readOnly = true)
    public List<OrderResponse> getAllOrders() {
        return orderRepository.findAllByOrderByOrderDateDesc().stream()
                .map(OrderMapper::toResponse)
                .toList();
    }

    @Transactional
    public OrderResponse updateStatus(Long orderId, String status) {
        Order order = findOrder(orderId);
        OrderStatus newStatus;
        try {
            newStatus = OrderStatus.valueOf(status.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid order status: " + status);
        }
        order.setStatus(newStatus);
        Order saved = orderRepository.save(order);
        eventPublisher.publishEvent(new OrderStatusChangedEvent(
                saved.getId(), saved.getUser().getId(), newStatus.name(), LocalDateTime.now()));
        return OrderMapper.toResponse(saved);
    }

    // Retried like checkout: restoring stock can conflict with a concurrent checkout.
    public OrderResponse cancelOrder(Long orderId) {
        return withStockConflictRetry(() -> self.doCancelOrder(orderId));
    }

    @Transactional
    public OrderResponse doCancelOrder(Long orderId) {
        User user = securityUtils.getCurrentUser();
        Order order = findOrder(orderId);

        if (!order.getUser().getId().equals(user.getId())) {
            throw new BadRequestException("You can only cancel your own orders");
        }

        if (order.getStatus() != OrderStatus.PLACED) {
            throw new BadRequestException("Order cannot be cancelled in its current state: " + order.getStatus());
        }

        if (order.getOrderDate().plusHours(24).isBefore(LocalDateTime.now())) {
            throw new BadRequestException("Orders can only be cancelled within 24 hours of placement");
        }

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

        if (order.getPayment() != null) {
            order.getPayment().setStatus(PaymentStatus.FAILED);
        }

        eventPublisher.publishEvent(new OrderStatusChangedEvent(
                order.getId(), user.getId(), OrderStatus.CANCELLED.name(), LocalDateTime.now()));

        return OrderMapper.toResponse(orderRepository.save(order));
    }

    // ----- helpers -----

    private <T> T withStockConflictRetry(Supplier<T> action) {
        ConcurrencyFailureException conflict = null;
        for (int attempt = 1; attempt <= MAX_STOCK_CONFLICT_ATTEMPTS; attempt++) {
            try {
                return action.get();
            } catch (ConcurrencyFailureException e) {
                // Covers OptimisticLockingFailureException (version mismatch) and
                // CannotAcquireLockException/DeadlockLoserDataAccessException (InnoDB deadlock).
                conflict = e;
            }
        }
        throw conflict; // handled centrally -> 409 CONFLICT
    }

    private Order findOrder(Long orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
    }

    private PaymentMethod parsePaymentMethod(String method) {
        try {
            return PaymentMethod.valueOf(method.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid payment method: " + method);
        }
    }
}
