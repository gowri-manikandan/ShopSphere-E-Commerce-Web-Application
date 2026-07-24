package com.shopsphere.controller;

import com.shopsphere.dto.ApiMessage;
import com.shopsphere.service.PaymentService;
import com.stripe.exception.SignatureVerificationException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    /**
     * Stripe webhook endpoint (§9). Public (see SecurityConfig) because Stripe calls it
     * server-to-server with no JWT — the Stripe-Signature header is what authenticates it.
     *
     * <p>The body is taken as a raw String, not a parsed DTO: Stripe's HMAC is computed over
     * the exact bytes, so Jackson re-serialization would break signature verification.
     */
    @PostMapping("/webhook")
    public ResponseEntity<ApiMessage> webhook(@RequestBody String payload,
                                              @RequestHeader("Stripe-Signature") String signature)
            throws SignatureVerificationException {
        paymentService.handleWebhook(payload, signature);
        return ResponseEntity.ok(new ApiMessage("Webhook received"));
    }
}
