package com.shopsphere.exception;

/**
 * Payment-processing failure (§9) — Stripe misconfiguration, a rejected charge, a refund
 * error, or a webhook we could not process. Mapped to 402 PAYMENT_REQUIRED centrally.
 */
public class PaymentException extends RuntimeException {
    public PaymentException(String message) {
        super(message);
    }

    public PaymentException(String message, Throwable cause) {
        super(message, cause);
    }
}
