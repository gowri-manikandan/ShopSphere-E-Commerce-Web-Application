package com.shopsphere.controller;

import com.shopsphere.dto.ApiMessage;
import com.shopsphere.dto.OrderResponse;
import com.shopsphere.dto.PaymentVerificationRequest;
import com.shopsphere.service.PaymentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    /**
     * Confirm a payment from the Razorpay Checkout callback (§9). Authenticated — the customer
     * posts the three values Razorpay handed their browser; the backend verifies the signature
     * and confirms the order.
     */
    @PostMapping("/verify")
    public ResponseEntity<OrderResponse> verify(@Valid @RequestBody PaymentVerificationRequest request) {
        return ResponseEntity.ok(paymentService.verifyAndConfirm(request));
    }

    /**
     * Razorpay webhook endpoint (§9). Public (see SecurityConfig) because Razorpay calls it
     * server-to-server with no JWT — the X-Razorpay-Signature header is what authenticates it.
     *
     * <p>The body is taken as a raw String, not a parsed DTO: the HMAC is computed over the
     * exact bytes, so Jackson re-serialization would break signature verification.
     */
    @PostMapping("/webhook")
    public ResponseEntity<ApiMessage> webhook(@RequestBody String payload,
                                              @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature,
                                              @RequestHeader(value = "X-Razorpay-Event-Id", required = false) String eventId) {
        paymentService.handleWebhook(payload, signature, eventId);
        return ResponseEntity.ok(new ApiMessage("Webhook received"));
    }
}
