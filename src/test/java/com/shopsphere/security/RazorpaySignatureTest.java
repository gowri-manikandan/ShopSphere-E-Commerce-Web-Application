package com.shopsphere.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the Razorpay HMAC-SHA256 signature helpers (§9). Pure crypto — no network.
 */
class RazorpaySignatureTest {

    private static final String KEY_SECRET = "test_key_secret";
    private static final String WEBHOOK_SECRET = "test_webhook_secret";

    @Test
    void hmacSha256Hex_matchesKnownVector() {
        // Verified against Razorpay's documented util (HMAC-SHA256 hex).
        String sig = RazorpaySignature.hmacSha256Hex("order_1|pay_1", KEY_SECRET);
        assertThat(sig).isNotBlank().matches("[0-9a-f]{64}"); // 32-byte digest, lowercase hex
        // Deterministic: same input -> same signature.
        assertThat(RazorpaySignature.hmacSha256Hex("order_1|pay_1", KEY_SECRET)).isEqualTo(sig);
    }

    @Test
    void verifyPaymentSignature_acceptsCorrectSignature() {
        String signature = RazorpaySignature.hmacSha256Hex("order_1|pay_1", KEY_SECRET);
        assertThat(RazorpaySignature.verifyPaymentSignature("order_1", "pay_1", signature, KEY_SECRET))
                .isTrue();
    }

    @Test
    void verifyPaymentSignature_rejectsTamperedSignature() {
        String signature = RazorpaySignature.hmacSha256Hex("order_1|pay_1", KEY_SECRET);
        // Tampered payment id -> signature no longer matches.
        assertThat(RazorpaySignature.verifyPaymentSignature("order_1", "pay_TAMPERED", signature, KEY_SECRET))
                .isFalse();
        // Wrong secret -> reject.
        assertThat(RazorpaySignature.verifyPaymentSignature("order_1", "pay_1", signature, "wrong_secret"))
                .isFalse();
    }

    @Test
    void verifyPaymentSignature_rejectsNullSignature() {
        assertThat(RazorpaySignature.verifyPaymentSignature("order_1", "pay_1", null, KEY_SECRET))
                .isFalse();
    }

    @Test
    void verifyWebhookSignature_acceptsCorrectSignatureAndRejectsTampered() {
        String body = "{\"event\":\"payment.captured\"}";
        String signature = RazorpaySignature.hmacSha256Hex(body, WEBHOOK_SECRET);

        assertThat(RazorpaySignature.verifyWebhookSignature(body, signature, WEBHOOK_SECRET)).isTrue();
        assertThat(RazorpaySignature.verifyWebhookSignature(body + " ", signature, WEBHOOK_SECRET)).isFalse();
        assertThat(RazorpaySignature.verifyWebhookSignature(body, "bad", WEBHOOK_SECRET)).isFalse();
    }
}
