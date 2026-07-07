package com.shopsphere.service;

import com.shopsphere.repository.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Separate bean so the theft-response revocation runs in its OWN transaction
 * (REQUIRES_NEW). The caller then throws to reject the request; without an
 * independent transaction, that throw would roll the revocation back.
 */
@Service
@RequiredArgsConstructor
public class TokenRevocationService {

    private final RefreshTokenRepository refreshTokenRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void revokeAllForUser(Long userId) {
        refreshTokenRepository.revokeAllForUser(userId);
    }
}
