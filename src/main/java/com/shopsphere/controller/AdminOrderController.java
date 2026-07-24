package com.shopsphere.controller;

import com.shopsphere.dto.ApiMessage;
import com.shopsphere.dto.OrderResponse;
import com.shopsphere.service.OrderService;
import com.shopsphere.service.PaymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/orders")
@RequiredArgsConstructor
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
}
