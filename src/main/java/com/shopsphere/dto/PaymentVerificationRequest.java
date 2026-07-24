package com.shopsphere.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * Payload the frontend posts to POST /api/payments/verify after the Razorpay Checkout widget
 * succeeds — the three values Razorpay hands to the JS handler, plus our own order id (§9).
 */
@Data
public class PaymentVerificationRequest {

    @NotNull
    private Long orderId;

    @NotBlank
    private String razorpayOrderId;

    @NotBlank
    private String razorpayPaymentId;

    @NotBlank
    private String razorpaySignature;
}
