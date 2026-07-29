package com.shopsphere.security;

import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Simple in-memory token-bucket rate limiter for auth endpoints (§7). No external dependency
 * (Bucket4j is only a suggested example in §7) so the offline build stays clean. Instantiated
 * by {@code SecurityConfig} (not a component) so the web-test slice needn't provide it.
 *
 * <p>Each key (e.g. {@code clientIp|/api/auth/login}) gets a bucket of {@code capacity} tokens
 * that refills linearly over {@code windowSeconds}. Single-instance only — fine at this scale;
 * a distributed limiter (Redis) would be the next step if the backend is ever scaled out.
 */
public class RateLimiterService {

    private final int capacity;
    private final long windowMillis;
    private final LongSupplier clock;
    private final ConcurrentHashMap<String, TokenBucket> buckets = new ConcurrentHashMap<>();

    public RateLimiterService(int capacity, long windowSeconds) {
        this(capacity, windowSeconds, System::currentTimeMillis);
    }

    // Package-private: lets tests inject a controllable clock to exercise refill deterministically.
    RateLimiterService(int capacity, long windowSeconds, LongSupplier clock) {
        this.capacity = capacity;
        this.windowMillis = windowSeconds * 1000L;
        this.clock = clock;
    }

    /** @return true if a token was available (request allowed), false if the bucket is empty. */
    public boolean tryConsume(String key) {
        return buckets
                .computeIfAbsent(key, k -> new TokenBucket(capacity, windowMillis, clock))
                .tryConsume();
    }

    private static final class TokenBucket {
        private final int capacity;
        private final long windowMillis;
        private final LongSupplier clock;
        private double tokens;
        private long lastRefill;

        TokenBucket(int capacity, long windowMillis, LongSupplier clock) {
            this.capacity = capacity;
            this.windowMillis = windowMillis;
            this.clock = clock;
            this.tokens = capacity;
            this.lastRefill = clock.getAsLong();
        }

        synchronized boolean tryConsume() {
            refill();
            if (tokens >= 1d) {
                tokens -= 1d;
                return true;
            }
            return false;
        }

        private void refill() {
            long now = clock.getAsLong();
            long elapsed = now - lastRefill;
            if (elapsed <= 0) {
                return;
            }
            double refilled = elapsed * ((double) capacity / windowMillis);
            tokens = Math.min(capacity, tokens + refilled);
            lastRefill = now;
        }
    }
}
