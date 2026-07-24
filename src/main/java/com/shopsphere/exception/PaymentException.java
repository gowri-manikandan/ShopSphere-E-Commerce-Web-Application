package com.shopsphere.exception;

/**
 * Payment-processing failure (§9) — gateway misconfiguration, a bad signature, a rejected
 * charge, a refund error, or a webhook we could not process. Mapped to 402 centrally.
 */
public class PaymentException extends RuntimeException {
    public PaymentException(String message) {
        super(message);
    }

    public PaymentException(String message, Throwable cause) {
        super(message, cause);
    }
}
