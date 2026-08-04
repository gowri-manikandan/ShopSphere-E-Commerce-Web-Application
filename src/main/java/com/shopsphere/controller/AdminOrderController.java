package com.shopsphere.controller;

import com.shopsphere.dto.ApiMessage;
import com.shopsphere.dto.OrderResponse;
import com.shopsphere.service.OrderService;
import com.shopsphere.service.PaymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/api/admin/orders")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminOrderController {

    private final OrderService orderService;
    private final PaymentService paymentService;

    // Admin: view all orders
    @GetMapping
    public ResponseEntity<List<OrderResponse>> getAllOrders() {
        return ResponseEntity.ok(orderService.getAllOrders());
    }

    // Admin: update order status (PLACED/SHIPPED/DELIVERED/CANCELLED)
    @PutMapping("/{id}/status")
    public ResponseEntity<OrderResponse> updateStatus(@PathVariable Long id,
                                                      @RequestParam String status) {
        return ResponseEntity.ok(orderService.updateStatus(id, status));
    }

    // Admin: refund a paid order via Razorpay, then cancel it and restore stock (§9)
    @PostMapping("/{id}/refund")
    public ResponseEntity<ApiMessage> refund(@PathVariable Long id) {
        paymentService.refund(id);
        return ResponseEntity.ok(new ApiMessage("Order refunded and cancelled"));
    }

    // Admin: update shipping & tracking info
    @PutMapping("/{id}/shipping")
    public ResponseEntity<OrderResponse> updateShippingInfo(@PathVariable Long id,
                                                            @RequestBody com.shopsphere.dto.ShippingInfoRequest request) {
        return ResponseEntity.ok(orderService.updateShippingInfo(
                id,
                request.getLine1(),
                request.getCity(),
                request.getState(),
                request.getPincode(),
                request.getPhone(),
                request.getCourierPartner(),
                request.getTrackingNumber(),
                request.getEstimatedDeliveryDate()
        ));
    }

    // Admin: update COD payment status (received or not)
    @PutMapping("/{id}/cod-payment")
    public ResponseEntity<OrderResponse> updateCodPaymentStatus(@PathVariable Long id,
                                                                @RequestParam boolean received) {
        return ResponseEntity.ok(orderService.updateCodPaymentStatus(id, received));
    }
}
