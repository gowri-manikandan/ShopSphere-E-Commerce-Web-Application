package com.shopsphere.security;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the in-memory token-bucket rate limiter (§7). A controllable clock exercises
 * refill deterministically without sleeping.
 */
class RateLimiterServiceTest {

    @Test
    void allowsUpToCapacityThenBlocks() {
        RateLimiterService limiter = new RateLimiterService(5, 60, () -> 0L); // frozen clock

        for (int i = 0; i < 5; i++) {
            assertThat(limiter.tryConsume("ip1|/api/auth/login")).as("request %d", i + 1).isTrue();
        }
        assertThat(limiter.tryConsume("ip1|/api/auth/login")).as("6th is blocked").isFalse();
    }

    @Test
    void keysAreIndependent() {
        RateLimiterService limiter = new RateLimiterService(1, 60, () -> 0L);

        assertThat(limiter.tryConsume("ipA|/api/auth/login")).isTrue();
        assertThat(limiter.tryConsume("ipA|/api/auth/login")).isFalse(); // A exhausted
        assertThat(limiter.tryConsume("ipB|/api/auth/login")).isTrue();  // B unaffected
        assertThat(limiter.tryConsume("ipA|/api/auth/register")).isTrue(); // different path = own bucket
    }

    @Test
    void refillsOverTime() {
        AtomicLong now = new AtomicLong(0L);
        RateLimiterService limiter = new RateLimiterService(5, 60, now::get);

        for (int i = 0; i < 5; i++) {
            assertThat(limiter.tryConsume("ip1|/api/auth/login")).isTrue();
        }
        assertThat(limiter.tryConsume("ip1|/api/auth/login")).isFalse(); // exhausted

        now.set(60_000L); // one full window later -> fully refilled
        assertThat(limiter.tryConsume("ip1|/api/auth/login")).isTrue();
    }

    @Test
    void partialRefillGrantsProportionalTokens() {
        AtomicLong now = new AtomicLong(0L);
        RateLimiterService limiter = new RateLimiterService(5, 60, now::get); // ~1 token / 12s

        for (int i = 0; i < 5; i++) {
            limiter.tryConsume("ip1|/api/auth/login");
        }
        assertThat(limiter.tryConsume("ip1|/api/auth/login")).isFalse();

        now.set(12_000L); // 1/5 of the window -> ~1 token back
        assertThat(limiter.tryConsume("ip1|/api/auth/login")).isTrue();
        assertThat(limiter.tryConsume("ip1|/api/auth/login")).isFalse();
    }
}
