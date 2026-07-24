package com.shopsphere.service;

import com.shopsphere.dto.AuthResponse;
import com.shopsphere.dto.LoginRequest;
import com.shopsphere.dto.RegisterRequest;
import com.shopsphere.entity.AuthProvider;
import com.shopsphere.entity.Role;
import com.shopsphere.entity.User;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.repository.UserRepository;
import com.shopsphere.security.GoogleTokenVerifier;
import com.shopsphere.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final EmailService emailService;
    private final RefreshTokenService refreshTokenService;
    private final GoogleTokenVerifier googleTokenVerifier;

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already registered: " + request.getEmail());
        }

        String otp = String.format("%06d", new java.util.Random().nextInt(999999));

        User user = User.builder()
                .name(request.getName())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(Role.CUSTOMER)
                .emailVerified(false)
                .verificationOtp(passwordEncoder.encode(otp))
                .verificationOtpExpiry(java.time.LocalDateTime.now().plusMinutes(15))
                .build();

        userRepository.save(user);

        // Send verification email
        emailService.sendOtpEmail(user.getEmail(), otp);

        return AuthResponse.builder()
                .token(null) // No token until verified
                .userId(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .role(user.getRole().name())
                .build();
    }

    public AuthResponse login(LoginRequest request) {
        // Throws BadCredentialsException if password/email is wrong (handled globally)
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BadRequestException("Invalid email or password"));

        if (!user.isEmailVerified()) {
            throw new BadRequestException("Email is not verified. Please verify your email first.");
        }

        String token = jwtService.generateToken(user.getEmail(), user.getRole().name());
        String refreshToken = refreshTokenService.createForUser(user);
        return AuthResponse.builder()
                .token(token)
                .refreshToken(refreshToken)
                .userId(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .role(user.getRole().name())
                .build();
    }

    public AuthResponse verifyOtp(com.shopsphere.dto.OtpVerificationRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BadRequestException("User not found with email: " + request.getEmail()));

        if (user.isEmailVerified()) {
            throw new BadRequestException("Email is already verified.");
        }

        if (user.getVerificationOtp() == null || !passwordEncoder.matches(request.getOtp(), user.getVerificationOtp())) {
            throw new BadRequestException("Invalid verification OTP code.");
        }

        if (user.getVerificationOtpExpiry() == null || user.getVerificationOtpExpiry().isBefore(java.time.LocalDateTime.now())) {
            throw new BadRequestException("Verification OTP code has expired.");
        }

        user.setEmailVerified(true);
        user.setVerificationOtp(null);
        user.setVerificationOtpExpiry(null);
        userRepository.save(user);

        // Authenticate automatically on verification success
        String token = jwtService.generateToken(user.getEmail(), user.getRole().name());
        String refreshToken = refreshTokenService.createForUser(user);
        return AuthResponse.builder()
                .token(token)
                .refreshToken(refreshToken)
                .userId(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .role(user.getRole().name())
                .build();
    }

    /** Exchange a valid refresh token for a new access token + rotated refresh token. */
    @Transactional
    public AuthResponse refresh(String refreshToken) {
        RefreshTokenService.RotationResult result = refreshTokenService.rotate(refreshToken);
        User user = result.user();
        String accessToken = jwtService.generateToken(user.getEmail(), user.getRole().name());
        return AuthResponse.builder()
                .token(accessToken)
                .refreshToken(result.newRawToken())
                .userId(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .role(user.getRole().name())
                .build();
    }

    /** Revoke a refresh token on logout (best-effort). */
    public void logout(String refreshToken) {
        if (refreshToken != null && !refreshToken.isBlank()) {
            refreshTokenService.revoke(refreshToken);
        }
    }

    public void resendOtp(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BadRequestException("User not found with email: " + email));

        if (user.isEmailVerified()) {
            throw new BadRequestException("Email is already verified.");
        }

        String otp = String.format("%06d", new java.util.Random().nextInt(999999));
        user.setVerificationOtp(passwordEncoder.encode(otp));
        user.setVerificationOtpExpiry(java.time.LocalDateTime.now().plusMinutes(15));
        userRepository.save(user);

        // Resend email
        emailService.sendOtpEmail(user.getEmail(), otp);
    }

    public void sendOtpForLogin(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BadRequestException("User not found with email: " + email));

        java.time.LocalDateTime now = java.time.LocalDateTime.now();

        // 1. Prevent multiple requests simultaneously (60 seconds throttle)
        if (user.getLastOtpRequestedAt() != null && 
            user.getLastOtpRequestedAt().plusSeconds(60).isAfter(now)) {
            long secondsLeft = java.time.Duration.between(now, user.getLastOtpRequestedAt().plusSeconds(60)).getSeconds();
            throw new BadRequestException("Please wait " + (secondsLeft > 0 ? secondsLeft : 60) + " seconds before requesting another OTP.");
        }

        // 2. Resend count check (Max 3 resends, i.e., max 4 requests total)
        if (user.getVerificationOtpExpiry() == null || user.getVerificationOtpExpiry().isBefore(now)) {
            user.setOtpResendAttempts(0);
        } else {
            if (user.getOtpResendAttempts() >= 3) {
                throw new BadRequestException("Maximum OTP resend attempts (3) exceeded. Please try again later.");
            }
            user.setOtpResendAttempts(user.getOtpResendAttempts() + 1);
        }

        // 3. Generate secure random 6-digit OTP
        java.security.SecureRandom secureRandom = new java.security.SecureRandom();
        String otp = String.format("%06d", secureRandom.nextInt(1000000));

        // 4. Hash and save the OTP
        user.setVerificationOtp(passwordEncoder.encode(otp));
        user.setVerificationOtpExpiry(now.plusMinutes(5));
        user.setLastOtpRequestedAt(now);
        user.setOtpVerificationAttempts(0); // Reset attempts
        userRepository.save(user);

        // 5. Send plain text OTP to user's email
        emailService.sendOtpEmail(user.getEmail(), otp);
    }

    public void verifyOtpForLogin(String email, String otp) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BadRequestException("User not found with email: " + email));

        java.time.LocalDateTime now = java.time.LocalDateTime.now();

        // 1. Limit verification attempts
        if (user.getOtpVerificationAttempts() >= 5) {
            throw new BadRequestException("Maximum verification attempts (5) exceeded. Please request a new OTP.");
        }

        // Increment attempts count and save immediately
        user.setOtpVerificationAttempts(user.getOtpVerificationAttempts() + 1);
        userRepository.save(user);

        // 2. Expiry check
        if (user.getVerificationOtpExpiry() == null || user.getVerificationOtpExpiry().isBefore(now)) {
            throw new BadRequestException("OTP expired.");
        }

        // 3. Validation check
        if (user.getVerificationOtp() == null || !passwordEncoder.matches(otp, user.getVerificationOtp())) {
            throw new BadRequestException("Invalid OTP.");
        }

        // 4. Success: Clear verification OTP tracking
        user.setEmailVerified(true);
        user.setVerificationOtp(null);
        user.setVerificationOtpExpiry(null);
        user.setLastOtpRequestedAt(null);
        user.setOtpVerificationAttempts(0);
        user.setOtpResendAttempts(0);
        userRepository.save(user);
    }

    // ===== Forgot password / reset =====

    /**
     * Send a password-reset OTP. Reuses the login-OTP machinery (60s throttle, max-3 resend,
     * SecureRandom 6-digit, BCrypt-hashed, 5-min expiry). Non-enumerating: an unknown email
     * returns normally so callers can't probe which emails are registered.
     */
    public void sendPasswordResetOtp(String email) {
        var maybeUser = userRepository.findByEmail(email);
        if (maybeUser.isEmpty()) {
            return; // silently succeed — don't reveal whether the email exists
        }
        User user = maybeUser.get();
        java.time.LocalDateTime now = java.time.LocalDateTime.now();

        // 60-second throttle between requests
        if (user.getLastOtpRequestedAt() != null &&
            user.getLastOtpRequestedAt().plusSeconds(60).isAfter(now)) {
            long secondsLeft = java.time.Duration.between(now, user.getLastOtpRequestedAt().plusSeconds(60)).getSeconds();
            throw new BadRequestException("Please wait " + (secondsLeft > 0 ? secondsLeft : 60) + " seconds before requesting another OTP.");
        }

        // Max 3 resends within a live OTP window
        if (user.getVerificationOtpExpiry() == null || user.getVerificationOtpExpiry().isBefore(now)) {
            user.setOtpResendAttempts(0);
        } else {
            if (user.getOtpResendAttempts() >= 3) {
                throw new BadRequestException("Maximum OTP resend attempts (3) exceeded. Please try again later.");
            }
            user.setOtpResendAttempts(user.getOtpResendAttempts() + 1);
        }

        java.security.SecureRandom secureRandom = new java.security.SecureRandom();
        String otp = String.format("%06d", secureRandom.nextInt(1000000));

        user.setVerificationOtp(passwordEncoder.encode(otp));
        user.setVerificationOtpExpiry(now.plusMinutes(5));
        user.setLastOtpRequestedAt(now);
        user.setOtpVerificationAttempts(0);
        userRepository.save(user);

        emailService.sendPasswordResetEmail(user.getEmail(), otp);
    }

    /**
     * Verify the reset OTP and set a new password. Enforces the strong-password policy and the
     * 5-attempt cap. Does not auto-login — the UI redirects to the login page afterwards.
     */
    public void resetPassword(com.shopsphere.dto.ResetPasswordRequest request) {
        if (!request.getNewPassword().equals(request.getConfirmPassword())) {
            throw new BadRequestException("Passwords do not match.");
        }
        validatePasswordStrength(request.getNewPassword());

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BadRequestException("Invalid or expired reset request."));

        java.time.LocalDateTime now = java.time.LocalDateTime.now();

        if (user.getOtpVerificationAttempts() >= 5) {
            throw new BadRequestException("Maximum verification attempts (5) exceeded. Please request a new OTP.");
        }
        user.setOtpVerificationAttempts(user.getOtpVerificationAttempts() + 1);
        userRepository.save(user);

        if (user.getVerificationOtpExpiry() == null || user.getVerificationOtpExpiry().isBefore(now)) {
            throw new BadRequestException("OTP expired. Please request a new one.");
        }
        if (user.getVerificationOtp() == null || !passwordEncoder.matches(request.getOtp(), user.getVerificationOtp())) {
            throw new BadRequestException("Invalid OTP.");
        }

        // Success: set new password, clear all OTP tracking
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        user.setVerificationOtp(null);
        user.setVerificationOtpExpiry(null);
        user.setLastOtpRequestedAt(null);
        user.setOtpVerificationAttempts(0);
        user.setOtpResendAttempts(0);
        userRepository.save(user);
    }

    // ===== Google sign-in =====

    /**
     * Verify a Google ID token and log the user in, creating a GOOGLE-provider account on first
     * sign-in. Existing accounts (any provider) with the same email are logged in as-is.
     */
    public AuthResponse googleSignIn(String idToken) {
        GoogleTokenVerifier.GoogleUser g = googleTokenVerifier.verify(idToken);

        User user = userRepository.findByEmail(g.email()).orElseGet(() ->
                userRepository.save(User.builder()
                        .name(g.name() != null && !g.name().isBlank() ? g.name() : g.email())
                        .email(g.email())
                        .password(null) // Google accounts have no local password
                        .role(Role.CUSTOMER)
                        .provider(AuthProvider.GOOGLE)
                        .emailVerified(true)
                        .build()));

        String token = jwtService.generateToken(user.getEmail(), user.getRole().name());
        String refreshToken = refreshTokenService.createForUser(user);
        return AuthResponse.builder()
                .token(token)
                .refreshToken(refreshToken)
                .userId(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .role(user.getRole().name())
                .build();
    }

    /** Strong-password policy: 8+ chars with upper, lower, digit and special character. */
    private void validatePasswordStrength(String password) {
        boolean ok = password != null
                && password.length() >= 8
                && password.matches(".*[A-Z].*")
                && password.matches(".*[a-z].*")
                && password.matches(".*[0-9].*")
                && password.matches(".*[^A-Za-z0-9].*");
        if (!ok) {
            throw new BadRequestException(
                    "Password must be at least 8 characters and include an uppercase letter, "
                    + "a lowercase letter, a number, and a special character.");
        }
    }
}
