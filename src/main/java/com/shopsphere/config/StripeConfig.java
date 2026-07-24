package com.shopsphere.config;

import com.stripe.Stripe;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * Stripe wiring (§9). Reads {@code app.stripe.*} and sets the global API key on startup.
 *
 * <p>Env-gated: with no {@code STRIPE_SECRET_KEY} the app still boots and COD checkout
 * works — only card payments and the webhook are disabled ({@link #isConfigured()} is
 * false), so PaymentService can fail fast with a clear message instead of a Stripe NPE.
 */
@Configuration
@Getter
public class StripeConfig {

    private static final Logger log = LoggerFactory.getLogger(StripeConfig.class);

    @Value("${app.stripe.secret-key:}")
    private String secretKey;

    @Value("${app.stripe.webhook-secret:}")
    private String webhookSecret;

    @Value("${app.stripe.publishable-key:}")
    private String publishableKey;

    @Value("${app.stripe.currency:usd}")
    private String currency;

    @PostConstruct
    void init() {
        if (isConfigured()) {
            Stripe.apiKey = secretKey;
            log.info("Stripe configured (currency={}) — card payments enabled.", currency);
        } else {
            log.warn("Stripe secret key not set — card payments disabled; COD still works. "
                    + "Set STRIPE_SECRET_KEY to enable.");
        }
    }

    /** True when a secret key is present, i.e. live Stripe calls can be made. */
    public boolean isConfigured() {
        return secretKey != null && !secretKey.isBlank();
    }

    /** True when the webhook signing secret is present, i.e. webhooks can be verified. */
    public boolean isWebhookConfigured() {
        return webhookSecret != null && !webhookSecret.isBlank();
    }
}
