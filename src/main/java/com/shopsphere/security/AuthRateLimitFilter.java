package com.shopsphere.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Throttles abuse-prone auth endpoints (§7): login, register, and the OTP/password-reset
 * endpoints. Keyed by client IP + path so each endpoint has its own budget. Returns 429 with
 * the ApiResponse error shape when the limit is exceeded.
 *
 * <p>Runs as a security filter (not a controller), so exceptions here wouldn't reach the
 * {@code @RestControllerAdvice} — it writes the 429 response directly.
 */
public class AuthRateLimitFilter extends OncePerRequestFilter {

    private static final Set<String> LIMITED_PATHS = Set.of(
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/send-otp",
            "/api/auth/verify-otp",
            "/api/auth/resend-otp",
            "/api/auth/forgot-password");

    private final RateLimiterService rateLimiter;
    private final ObjectMapper objectMapper;

    public AuthRateLimitFilter(RateLimiterService rateLimiter, ObjectMapper objectMapper) {
        this.rateLimiter = rateLimiter;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if ("POST".equalsIgnoreCase(request.getMethod())
                && LIMITED_PATHS.contains(request.getRequestURI())) {
            String key = clientIp(request) + "|" + request.getRequestURI();
            if (!rateLimiter.tryConsume(key)) {
                writeTooManyRequests(request, response);
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim(); // first hop = original client
        }
        return request.getRemoteAddr();
    }

    private void writeTooManyRequests(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        response.setStatus(429); // 429 Too Many Requests (no Servlet constant for this)
        response.setContentType("application/json");
        // Match the ApiResponse error envelope (§8) since this runs in the filter chain,
        // before the @RestControllerAdvice handlers.
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("message", "Too many attempts. Please wait a minute and try again.");
        body.put("errorCode", "RATE_LIMITED");
        body.put("timestamp", LocalDateTime.now().toString());
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }
}
