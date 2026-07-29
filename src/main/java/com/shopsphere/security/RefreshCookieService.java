package com.shopsphere.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Builds the httpOnly refresh-token cookie (§7). The raw refresh token lives here — never in the
 * response body or localStorage — so JS/XSS can't read it.
 *
 * <p>Scoped to {@code /api/auth} (only /refresh and /logout need it). Attributes are config-driven:
 * defaults ({@code SameSite=Lax}, non-Secure) work for local http dev; set
 * {@code REFRESH_COOKIE_SAMESITE=None} + {@code REFRESH_COOKIE_SECURE=true} for cross-site HTTPS prod.
 */
@Component
public class RefreshCookieService {

    public static final String COOKIE_NAME = "refreshToken";
    private static final String PATH = "/api/auth";

    private final long maxAgeSeconds;
    private final boolean secure;
    private final String sameSite;

    public RefreshCookieService(
            @Value("${app.jwt.refresh-expiration-ms:604800000}") long refreshExpirationMs,
            @Value("${app.auth.refresh-cookie.secure:false}") boolean secure,
            @Value("${app.auth.refresh-cookie.same-site:Lax}") String sameSite) {
        this.maxAgeSeconds = refreshExpirationMs / 1000L;
        this.secure = secure;
        this.sameSite = sameSite;
    }

    /** Cookie carrying a freshly-issued (or rotated) refresh token. */
    public ResponseCookie create(String rawToken) {
        return base(rawToken, Duration.ofSeconds(maxAgeSeconds)).build();
    }

    /** Expired cookie (Max-Age=0) that clears the refresh token on logout. */
    public ResponseCookie clear() {
        return base("", Duration.ZERO).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value, Duration maxAge) {
        return ResponseCookie.from(COOKIE_NAME, value)
                .httpOnly(true)
                .secure(secure)
                .path(PATH)
                .maxAge(maxAge)
                .sameSite(sameSite);
    }
}
