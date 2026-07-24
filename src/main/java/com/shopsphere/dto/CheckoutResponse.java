package com.shopsphere.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Result of POST /api/orders/checkout (§9).
 *
 * <p>For card orders, {@code clientSecret} + {@code publishableKey} let Stripe.js confirm
 * the PaymentIntent on the frontend; the order stays PLACED / payment PENDING until the
 * {@code payment_intent.succeeded} webhook confirms it. For COD both are null.
 *
 * <p>The client secret is deliberately kept off {@link OrderResponse} so GET /api/orders
 * never leaks it — it is only returned here, once, at checkout time.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CheckoutResponse {
    private OrderResponse order;
    private String clientSecret;
    private String publishableKey;
}
