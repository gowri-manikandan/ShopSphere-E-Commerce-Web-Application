package com.shopsphere.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Result of POST /api/orders/checkout (§9).
 *
 * <p>For online orders, the {@code razorpay*} + prefill fields are everything the Razorpay
 * Checkout widget needs on the frontend; the order stays PLACED / payment PENDING until the
 * checkout callback is verified (or the webhook confirms it). For COD — and for the local
 * mock fallback when Razorpay isn't configured — {@code razorpayOrderId} is null and the
 * frontend skips the widget.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CheckoutResponse {
    private OrderResponse order;

    // Razorpay Checkout widget inputs (null for COD / mock fallback)
    private String razorpayOrderId;
    private String razorpayKeyId;
    private Long amountInPaise;
    private String currency;

    // Prefill for the widget (improves UX; all optional)
    private String prefillName;
    private String prefillEmail;
    private String prefillContact;
}
