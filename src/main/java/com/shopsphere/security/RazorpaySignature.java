package com.shopsphere.security;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Razorpay signature helpers (§9). Pure HMAC-SHA256 — no network, so fully unit-testable.
 *
 * <ul>
 *   <li>Payment (checkout callback): {@code HMAC_SHA256(orderId + "|" + paymentId, keySecret)}.</li>
 *   <li>Webhook: {@code HMAC_SHA256(rawRequestBody, webhookSecret)}.</li>
 * </ul>
 * Comparison is constant-time to avoid timing attacks.
 */
public final class RazorpaySignature {

    private RazorpaySignature() {
    }

    public static String hmacSha256Hex(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (Exception e) {
            // NoSuchAlgorithmException / InvalidKeyException — should never happen for HmacSHA256.
            throw new IllegalStateException("Unable to compute HMAC-SHA256 signature", e);
        }
    }

    /** Verify the checkout callback signature: expected = HMAC(orderId|paymentId, keySecret). */
    public static boolean verifyPaymentSignature(String razorpayOrderId, String razorpayPaymentId,
                                                 String signature, String keySecret) {
        String expected = hmacSha256Hex(razorpayOrderId + "|" + razorpayPaymentId, keySecret);
        return constantTimeEquals(expected, signature);
    }

    /** Verify a webhook: expected = HMAC(rawBody, webhookSecret) against the X-Razorpay-Signature. */
    public static boolean verifyWebhookSignature(String rawBody, String signature, String webhookSecret) {
        String expected = hmacSha256Hex(rawBody, webhookSecret);
        return constantTimeEquals(expected, signature);
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8),
                b.getBytes(StandardCharsets.UTF_8));
    }
}
