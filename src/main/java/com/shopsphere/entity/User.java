package com.shopsphere.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, unique = true, length = 150)
    private String email;

    @Column(nullable = false)
    private String password; // BCrypt hash

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Column(name = "profile_image_url", length = 500)
    private String profileImageUrl;

    @Column(name = "email_verified", nullable = false)
    @Builder.Default
    private boolean emailVerified = false;

    @Column(name = "verification_otp_secure", length = 100)
    private String verificationOtp;

    @Column(name = "verification_otp_expiry")
    private LocalDateTime verificationOtpExpiry;

    @Column(name = "otp_verification_attempts")
    @Builder.Default
    private Integer otpVerificationAttempts = 0;

    @Column(name = "otp_resend_attempts")
    @Builder.Default
    private Integer otpResendAttempts = 0;

    @Column(name = "last_otp_requested_at")
    private LocalDateTime lastOtpRequestedAt;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public int getOtpVerificationAttempts() {
        return otpVerificationAttempts != null ? otpVerificationAttempts : 0;
    }

    public int getOtpResendAttempts() {
        return otpResendAttempts != null ? otpResendAttempts : 0;
    }
}
