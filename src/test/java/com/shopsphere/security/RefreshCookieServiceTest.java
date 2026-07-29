package com.shopsphere.security;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseCookie;

import static org.assertj.core.api.Assertions.assertThat;

/** Unit tests for the refresh-token cookie attributes (§7). */
class RefreshCookieServiceTest {

    private static final long SEVEN_DAYS_MS = 604_800_000L;

    @Test
    void create_isHttpOnly_pathScoped_withConfiguredAttributes() {
        RefreshCookieService svc = new RefreshCookieService(SEVEN_DAYS_MS, false, "Lax");

        ResponseCookie c = svc.create("raw-token-value");

        assertThat(c.getName()).isEqualTo("refreshToken");
        assertThat(c.getValue()).isEqualTo("raw-token-value");
        assertThat(c.isHttpOnly()).isTrue();
        assertThat(c.isSecure()).isFalse();
        assertThat(c.getPath()).isEqualTo("/api/auth"); // only sent to /refresh + /logout
        assertThat(c.getSameSite()).isEqualTo("Lax");
        assertThat(c.getMaxAge().getSeconds()).isEqualTo(SEVEN_DAYS_MS / 1000);
    }

    @Test
    void create_prodProfile_isSecureAndSameSiteNone() {
        RefreshCookieService svc = new RefreshCookieService(SEVEN_DAYS_MS, true, "None");

        ResponseCookie c = svc.create("t");

        assertThat(c.isSecure()).isTrue();
        assertThat(c.getSameSite()).isEqualTo("None");
        assertThat(c.isHttpOnly()).isTrue();
    }

    @Test
    void clear_isExpiredEmptyCookie() {
        RefreshCookieService svc = new RefreshCookieService(SEVEN_DAYS_MS, false, "Lax");

        ResponseCookie c = svc.clear();

        assertThat(c.getName()).isEqualTo("refreshToken");
        assertThat(c.getValue()).isEmpty();
        assertThat(c.getMaxAge().getSeconds()).isZero(); // deletes the cookie
        assertThat(c.isHttpOnly()).isTrue();
        assertThat(c.getPath()).isEqualTo("/api/auth");
    }
}
