package com.shopsphere.service;

import com.shopsphere.dto.AuthResponse;
import com.shopsphere.entity.AuthProvider;
import com.shopsphere.entity.Role;
import com.shopsphere.entity.User;
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

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceGoogleTest {

    @Mock UserRepository userRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtService jwtService;
    @Mock AuthenticationManager authenticationManager;
    @Mock EmailService emailService;
    @Mock RefreshTokenService refreshTokenService;
    @Mock GoogleTokenVerifier googleTokenVerifier;

    @InjectMocks AuthService authService;

    @Test
    void googleSignIn_newEmail_createsGoogleUser() {
        when(googleTokenVerifier.verify("idtok"))
                .thenReturn(new GoogleTokenVerifier.GoogleUser("ada@x.com", "Ada", "sub-1"));
        when(userRepository.findByEmail("ada@x.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            u.setId(99L);
            return u;
        });
        when(jwtService.generateToken(any(), any())).thenReturn("jwt");
        when(refreshTokenService.createForUser(any())).thenReturn("refresh");

        AuthResponse res = authService.googleSignIn("idtok");

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        User u = saved.getValue();
        assertThat(u.getProvider()).isEqualTo(AuthProvider.GOOGLE);
        assertThat(u.getPassword()).isNull();
        assertThat(u.isEmailVerified()).isTrue();
        assertThat(u.getRole()).isEqualTo(Role.CUSTOMER);
        assertThat(u.getName()).isEqualTo("Ada");

        assertThat(res.getToken()).isEqualTo("jwt");
        assertThat(res.getRefreshToken()).isEqualTo("refresh");
        assertThat(res.getEmail()).isEqualTo("ada@x.com");
        assertThat(res.getUserId()).isEqualTo(99L);
    }

    @Test
    void googleSignIn_existingEmail_logsInWithoutCreating() {
        User existing = User.builder().id(7L).name("Existing").email("ada@x.com")
                .password("hash").role(Role.CUSTOMER).provider(AuthProvider.LOCAL)
                .emailVerified(true).build();
        when(googleTokenVerifier.verify("idtok"))
                .thenReturn(new GoogleTokenVerifier.GoogleUser("ada@x.com", "Ada", "sub-1"));
        when(userRepository.findByEmail("ada@x.com")).thenReturn(Optional.of(existing));
        when(jwtService.generateToken(any(), any())).thenReturn("jwt");
        when(refreshTokenService.createForUser(any())).thenReturn("refresh");

        AuthResponse res = authService.googleSignIn("idtok");

        verify(userRepository, never()).save(any());
        assertThat(res.getUserId()).isEqualTo(7L);
        assertThat(res.getToken()).isEqualTo("jwt");
    }

    @Test
    void googleSignIn_gowriEmail_createsGoogleUser() {
        when(googleTokenVerifier.verify("user-google-token"))
                .thenReturn(new GoogleTokenVerifier.GoogleUser("gowrimanikandanon2003@gmail.com", "Gowri Manikandan", "google-sub-gowri"));
        when(userRepository.findByEmail("gowrimanikandanon2003@gmail.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            u.setId(101L);
            return u;
        });
        when(jwtService.generateToken(any(), any())).thenReturn("mock-jwt-token");
        when(refreshTokenService.createForUser(any())).thenReturn("mock-refresh-token");

        AuthResponse res = authService.googleSignIn("user-google-token");

        assertThat(res.getEmail()).isEqualTo("gowrimanikandanon2003@gmail.com");
        assertThat(res.getName()).isEqualTo("Gowri Manikandan");
        assertThat(res.getRole()).isEqualTo("CUSTOMER");
        assertThat(res.getToken()).isEqualTo("mock-jwt-token");
    }
}
