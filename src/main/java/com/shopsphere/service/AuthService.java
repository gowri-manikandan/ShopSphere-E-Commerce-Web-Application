package com.shopsphere.service;

import com.shopsphere.dto.AuthResponse;
import com.shopsphere.dto.LoginRequest;
import com.shopsphere.dto.RegisterRequest;
import com.shopsphere.entity.Role;
import com.shopsphere.entity.User;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.repository.UserRepository;
import com.shopsphere.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final EmailService emailService;

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

        // Send verification email (logs to console on failure)
        emailService.sendOtpEmail(user.getEmail(), otp);

        return AuthResponse.builder()
                .token(null) // No token until verified
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
        return AuthResponse.builder()
                .token(token)
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
        return AuthResponse.builder()
                .token(token)
                .name(user.getName())
                .email(user.getEmail())
                .role(user.getRole().name())
                .build();
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
}
