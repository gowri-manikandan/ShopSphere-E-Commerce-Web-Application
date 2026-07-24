package com.shopsphere.config;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * Razorpay wiring (§9). Reads {@code app.razorpay.*} keys.
 *
 * <p>Env-gated: with no {@code RAZORPAY_KEY_ID}/{@code RAZORPAY_KEY_SECRET} the app still
 * boots and COD checkout works — card/UPI/netbanking then fall back to a mock success locally
 * ({@link #isConfigured()} is false). The webhook needs {@code RAZORPAY_WEBHOOK_SECRET}.
 */
@Configuration
@Getter
public class RazorpayConfig {

    private static final Logger log = LoggerFactory.getLogger(RazorpayConfig.class);

    @Value("${app.razorpay.key-id:}")
    private String keyId;

    @Value("${app.razorpay.key-secret:}")
    private String keySecret;

    @Value("${app.razorpay.webhook-secret:}")
    private String webhookSecret;

    @Value("${app.razorpay.currency:INR}")
    private String currency;

    @PostConstruct
    void init() {
        if (isConfigured()) {
            log.info("Razorpay configured (currency={}) — card/UPI/netbanking enabled.", currency);
        } else {
            log.warn("Razorpay keys not set — online payments disabled; COD still works "
                    + "(card/UPI/netbanking fall back to mock locally). Set RAZORPAY_KEY_ID "
                    + "and RAZORPAY_KEY_SECRET to enable.");
        }
    }

    /** True when both key id and secret are present, i.e. live Razorpay calls can be made. */
    public boolean isConfigured() {
        return keyId != null && !keyId.isBlank()
                && keySecret != null && !keySecret.isBlank();
    }

    /** True when the webhook signing secret is present, i.e. webhooks can be verified. */
    public boolean isWebhookConfigured() {
        return webhookSecret != null && !webhookSecret.isBlank();
    }
}
