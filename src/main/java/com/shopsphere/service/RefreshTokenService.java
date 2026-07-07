package com.shopsphere.service;

import com.shopsphere.entity.RefreshToken;
import com.shopsphere.entity.User;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.repository.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final TokenRevocationService tokenRevocationService;

    @Value("${app.jwt.refresh-expiration-ms}")
    private long refreshExpirationMs;

    /** Result of a rotation: the user + the new raw refresh token to hand back to the client. */
    public record RotationResult(User user, String newRawToken) {}

    /** Issue a brand-new refresh token for a user; returns the RAW token (only stored hashed). */
    @Transactional
    public String createForUser(User user) {
        String rawToken = UUID.randomUUID().toString() + "." + UUID.randomUUID().toString();
        RefreshToken entity = RefreshToken.builder()
                .tokenHash(sha256(rawToken))
                .user(user)
                .expiryDate(LocalDateTime.now().plusNanos(refreshExpirationMs * 1_000_000))
                .revoked(false)
                .build();
        refreshTokenRepository.save(entity);
        return rawToken;
    }

    /**
     * Rotate a refresh token: validate it, revoke it, and issue a fresh one.
     * Detects reuse of an already-revoked token (token theft) and kills all the user's tokens.
     */
    @Transactional
    public RotationResult rotate(String rawToken) {
        RefreshToken stored = refreshTokenRepository.findByTokenHash(sha256(rawToken))
                .orElseThrow(() -> new BadRequestException("Invalid refresh token. Please log in again."));

        if (stored.isRevoked()) {
            // A revoked token is being reused -> assume theft, revoke everything for this
            // user in a SEPARATE transaction so it survives the rejection throw below.
            tokenRevocationService.revokeAllForUser(stored.getUser().getId());
            throw new BadRequestException("Refresh token reuse detected. Please log in again.");
        }

        if (stored.getExpiryDate().isBefore(LocalDateTime.now())) {
            throw new BadRequestException("Refresh token expired. Please log in again.");
        }

        // Rotate: revoke the old one, mint a new one.
        stored.setRevoked(true);
        refreshTokenRepository.save(stored);

        String newRaw = createForUser(stored.getUser());
        return new RotationResult(stored.getUser(), newRaw);
    }

    /** Revoke a refresh token on logout (idempotent — silently ignores unknown tokens). */
    @Transactional
    public void revoke(String rawToken) {
        refreshTokenRepository.findByTokenHash(sha256(rawToken)).ifPresent(rt -> {
            rt.setRevoked(true);
            refreshTokenRepository.save(rt);
        });
    }

    private String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Unable to hash refresh token", e);
        }
    }
}
