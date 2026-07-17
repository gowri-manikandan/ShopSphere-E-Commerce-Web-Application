package com.shopsphere.service;

import com.shopsphere.dto.ResetPasswordRequest;
import com.shopsphere.entity.Role;
import com.shopsphere.entity.User;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.repository.UserRepository;
import com.shopsphere.security.GoogleTokenVerifier;
import com.shopsphere.security.JwtService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceResetTest {

    @Mock UserRepository userRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtService jwtService;
    @Mock AuthenticationManager authenticationManager;
    @Mock EmailService emailService;
    @Mock RefreshTokenService refreshTokenService;
    @Mock GoogleTokenVerifier googleTokenVerifier;

    @InjectMocks AuthService authService;

    private User user(String hashedOtp, LocalDateTime expiry, int attempts) {
        return User.builder().id(1L).name("Buyer").email("buyer@shopsphere.com")
                .password("oldhash").role(Role.CUSTOMER).emailVerified(true)
                .verificationOtp(hashedOtp).verificationOtpExpiry(expiry)
                .otpVerificationAttempts(attempts).build();
    }

    private ResetPasswordRequest req(String otp, String pw, String confirm) {
        ResetPasswordRequest r = new ResetPasswordRequest();
        r.setEmail("buyer@shopsphere.com");
        r.setOtp(otp);
        r.setNewPassword(pw);
        r.setConfirmPassword(confirm);
        return r;
    }

    // ----- sendPasswordResetOtp -----

    @Test
    void sendPasswordResetOtp_unknownEmail_doesNotThrowOrLeak() {
        when(userRepository.findByEmail("ghost@x.com")).thenReturn(Optional.empty());

        authService.sendPasswordResetOtp("ghost@x.com"); // must not throw (non-enumeration)

        verify(userRepository, never()).save(any());
        verify(emailService, never()).sendPasswordResetEmail(anyString(), anyString());
    }

    @Test
    void sendPasswordResetOtp_throttled_throws() {
        User u = user(null, null, 0);
        u.setLastOtpRequestedAt(LocalDateTime.now()); // just requested
        when(userRepository.findByEmail("buyer@shopsphere.com")).thenReturn(Optional.of(u));

        assertThatThrownBy(() -> authService.sendPasswordResetOtp("buyer@shopsphere.com"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("wait");
    }

    @Test
    void sendPasswordResetOtp_happy_savesAndEmailsResetOtp() {
        User u = user(null, null, 0);
        when(userRepository.findByEmail("buyer@shopsphere.com")).thenReturn(Optional.of(u));
        when(passwordEncoder.encode(anyString())).thenReturn("hashedOtp");

        authService.sendPasswordResetOtp("buyer@shopsphere.com");

        verify(userRepository).save(u);
        verify(emailService).sendPasswordResetEmail(eq("buyer@shopsphere.com"), anyString());
        assertThat(u.getVerificationOtpExpiry()).isAfter(LocalDateTime.now());
    }

    // ----- resetPassword -----

    @Test
    void resetPassword_success_setsEncodedPasswordAndClearsOtp() {
        User u = user("hashedOtp", LocalDateTime.now().plusMinutes(3), 0);
        when(userRepository.findByEmail("buyer@shopsphere.com")).thenReturn(Optional.of(u));
        when(passwordEncoder.matches("123456", "hashedOtp")).thenReturn(true);
        when(passwordEncoder.encode("Passw0rd!")).thenReturn("newHash");

        authService.resetPassword(req("123456", "Passw0rd!", "Passw0rd!"));

        assertThat(u.getPassword()).isEqualTo("newHash");
        assertThat(u.getVerificationOtp()).isNull();
        assertThat(u.getVerificationOtpExpiry()).isNull();
    }

    @Test
    void resetPassword_mismatch_throws() {
        assertThatThrownBy(() -> authService.resetPassword(req("123456", "Passw0rd!", "Different1!")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("match");
        verify(userRepository, never()).findByEmail(anyString());
    }

    @Test
    void resetPassword_weakPassword_throws() {
        assertThatThrownBy(() -> authService.resetPassword(req("123456", "weak", "weak")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("at least 8");
    }

    @Test
    void resetPassword_wrongOtp_throws() {
        User u = user("hashedOtp", LocalDateTime.now().plusMinutes(3), 0);
        when(userRepository.findByEmail("buyer@shopsphere.com")).thenReturn(Optional.of(u));
        when(passwordEncoder.matches("000000", "hashedOtp")).thenReturn(false);

        assertThatThrownBy(() -> authService.resetPassword(req("000000", "Passw0rd!", "Passw0rd!")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Invalid OTP");
    }

    @Test
    void resetPassword_expiredOtp_throws() {
        User u = user("hashedOtp", LocalDateTime.now().minusMinutes(1), 0);
        when(userRepository.findByEmail("buyer@shopsphere.com")).thenReturn(Optional.of(u));

        assertThatThrownBy(() -> authService.resetPassword(req("123456", "Passw0rd!", "Passw0rd!")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("expired");
    }

    @Test
    void resetPassword_attemptCapExceeded_throws() {
        User u = user("hashedOtp", LocalDateTime.now().plusMinutes(3), 5);
        when(userRepository.findByEmail("buyer@shopsphere.com")).thenReturn(Optional.of(u));

        assertThatThrownBy(() -> authService.resetPassword(req("123456", "Passw0rd!", "Passw0rd!")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Maximum verification attempts");
    }
}
