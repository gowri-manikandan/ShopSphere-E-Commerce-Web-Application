package com.shopsphere.mapper;

import com.shopsphere.dto.OrderItemResponse;
import com.shopsphere.dto.OrderResponse;
import com.shopsphere.entity.Address;
import com.shopsphere.entity.Order;
import com.shopsphere.entity.OrderItem;
import com.shopsphere.entity.Payment;

import java.util.List;

public class OrderMapper {

    public static OrderResponse toResponse(Order order) {
        List<OrderItemResponse> items = order.getItems().stream()
                .map(OrderMapper::toItemResponse)
                .toList();

        Payment payment = order.getPayment();

        return OrderResponse.builder()
                .orderId(order.getId())
                .totalAmount(order.getTotalAmount())
                .status(order.getStatus().name())
                .orderDate(order.getOrderDate())
                .items(items)
                .paymentMethod(payment != null ? payment.getMethod().name() : null)
                .paymentStatus(payment != null ? payment.getStatus().name() : null)
                .transactionRef(payment != null ? payment.getTransactionRef() : null)
                .shippingAddress(toShippingAddress(order))
                .build();
    }

    private static OrderResponse.ShippingAddress toShippingAddress(Order order) {
        Address addr = order.getAddress();
        if (addr == null) {
            return null;
        }
        return OrderResponse.ShippingAddress.builder()
                .name(order.getUser() != null ? order.getUser().getName() : null)
                .line1(addr.getLine1())
                .city(addr.getCity())
                .state(addr.getState())
                .pincode(addr.getPincode())
                .phone(addr.getPhone())
                .build();
    }

    private static OrderItemResponse toItemResponse(OrderItem item) {
        return OrderItemResponse.builder()
                .productId(item.getProduct() != null ? item.getProduct().getId() : null)
                .productName(item.getProduct() != null ? item.getProduct().getName() : "Deleted Product")
                .imageUrl(item.getProduct() != null ? item.getProduct().getImageUrl() : null)
                .quantity(item.getQuantity())
                .price(item.getPrice())
                .subtotal(item.getPrice().multiply(java.math.BigDecimal.valueOf(item.getQuantity())))
                .build();
    }
}
