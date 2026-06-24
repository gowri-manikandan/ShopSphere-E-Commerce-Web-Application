package com.shopsphere.service;

import com.shopsphere.dto.OrderRequest;
import com.shopsphere.dto.OrderResponse;
import com.shopsphere.entity.*;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.mapper.OrderMapper;
import com.shopsphere.repository.*;
import com.shopsphere.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final AddressRepository addressRepository;
    private final SecurityUtils securityUtils;

    /**
     * Full checkout flow, all in ONE transaction:
     *  1. Read the user's cart (must not be empty)
     *  2. Validate stock for each item
     *  3. Create the Order + OrderItems (price snapshot)
     *  4. Deduct stock from products
     *  5. Create a mock Payment (PENDING -> SUCCESS, COD stays PENDING)
     *  6. Clear the cart
     * If anything throws, the whole thing rolls back.
     */
    @Transactional
    public OrderResponse checkout(OrderRequest request) {
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

            // Deduct stock
            product.setStockQuantity(product.getStockQuantity() - cartItem.getQuantity());
            productRepository.save(product);

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

        // ----- Mock payment -----
        Payment payment = Payment.builder()
                .order(order)
                .amount(total)
                .method(method)
                .status(method == PaymentMethod.COD ? PaymentStatus.PENDING : PaymentStatus.SUCCESS)
                .transactionRef("TXN-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase())
                .paidAt(method == PaymentMethod.COD ? null : LocalDateTime.now())
                .build();
        order.setPayment(payment);

        Order saved = orderRepository.save(order); // cascades items + payment

        // Empty the cart
        cartItemRepository.deleteByUserId(user.getId());

        return OrderMapper.toResponse(saved);
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
        return OrderMapper.toResponse(orderRepository.save(order));
    }

    // ----- helpers -----

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
