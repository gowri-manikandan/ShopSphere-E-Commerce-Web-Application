package com.shopsphere.controller;

import com.shopsphere.dto.AuthResponse;
import com.shopsphere.dto.LoginRequest;
import com.shopsphere.dto.RegisterRequest;
import com.shopsphere.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.ok(authService.register(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @PostMapping("/verify")
    public ResponseEntity<AuthResponse> verify(@Valid @RequestBody com.shopsphere.dto.OtpVerificationRequest request) {
        return ResponseEntity.ok(authService.verifyOtp(request));
    }

    @PostMapping("/resend-otp")
    public ResponseEntity<com.shopsphere.dto.ApiMessage> resendOtp(@RequestParam String email) {
        authService.resendOtp(email);
        return ResponseEntity.ok(new com.shopsphere.dto.ApiMessage("Verification OTP resent successfully"));
    }

    @PostMapping("/send-otp")
    public ResponseEntity<com.shopsphere.dto.ApiMessage> sendOtp(@Valid @RequestBody com.shopsphere.dto.SendOtpRequest request) {
        authService.sendOtpForLogin(request.getEmail());
        return ResponseEntity.ok(new com.shopsphere.dto.ApiMessage("OTP sent successfully."));
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<com.shopsphere.dto.ApiMessage> verifyOtpForLogin(@Valid @RequestBody com.shopsphere.dto.OtpVerificationRequest request) {
        authService.verifyOtpForLogin(request.getEmail(), request.getOtp());
        return ResponseEntity.ok(new com.shopsphere.dto.ApiMessage("Email verified successfully"));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<com.shopsphere.dto.ApiMessage> forgotPassword(
            @Valid @RequestBody com.shopsphere.dto.ForgotPasswordRequest request) {
        authService.sendPasswordResetOtp(request.getEmail());
        // Always a generic response so this can't be used to probe which emails exist.
        return ResponseEntity.ok(new com.shopsphere.dto.ApiMessage(
                "If an account exists for that email, a reset code has been sent."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<com.shopsphere.dto.ApiMessage> resetPassword(
            @Valid @RequestBody com.shopsphere.dto.ResetPasswordRequest request) {
        authService.resetPassword(request);
        return ResponseEntity.ok(new com.shopsphere.dto.ApiMessage(
                "Password reset successfully. You can now log in with your new password."));
    }

    @PostMapping("/google")
    public ResponseEntity<AuthResponse> google(@Valid @RequestBody com.shopsphere.dto.GoogleSignInRequest request) {
        return ResponseEntity.ok(authService.googleSignIn(request.getIdToken()));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@Valid @RequestBody com.shopsphere.dto.RefreshTokenRequest request) {
        return ResponseEntity.ok(authService.refresh(request.getRefreshToken()));
    }

    @PostMapping("/logout")
    public ResponseEntity<com.shopsphere.dto.ApiMessage> logout(@Valid @RequestBody com.shopsphere.dto.RefreshTokenRequest request) {
        authService.logout(request.getRefreshToken());
        return ResponseEntity.ok(new com.shopsphere.dto.ApiMessage("Logged out successfully"));
    }
}
