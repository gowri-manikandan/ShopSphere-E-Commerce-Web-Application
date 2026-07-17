package com.shopsphere.security;

import com.shopsphere.exception.BadRequestException;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Verifies GoogleTokenVerifier without any network: we generate a local RSA keypair, sign a
 * fake "Google" ID token, and inject the matching public key via the test KeyResolver.
 */
class GoogleTokenVerifierTest {

    private static final String CLIENT_ID = "my-client-id.apps.googleusercontent.com";
    private static RSAPrivateKey privateKey;
    private static RSAPublicKey publicKey;

    @BeforeAll
    static void keys() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair kp = gen.generateKeyPair();
        privateKey = (RSAPrivateKey) kp.getPrivate();
        publicKey = (RSAPublicKey) kp.getPublic();
    }

    private GoogleTokenVerifier verifier() {
        return new GoogleTokenVerifier(CLIENT_ID, kid -> publicKey);
    }

    private String token(String audience, String issuer, String email,
                         Object emailVerified, Date expiry) {
        return Jwts.builder()
                .subject("google-sub-123")
                .audience().add(audience).and()
                .issuer(issuer)
                .claim("email", email)
                .claim("email_verified", emailVerified)
                .claim("name", "Ada Lovelace")
                .issuedAt(new Date(System.currentTimeMillis() - 10_000))
                .expiration(expiry)
                .signWith(privateKey)
                .compact();
    }

    private Date future() { return new Date(System.currentTimeMillis() + 300_000); }

    @Test
    void validToken_returnsGoogleUser() {
        String jwt = token(CLIENT_ID, "https://accounts.google.com", "ada@x.com", true, future());

        GoogleTokenVerifier.GoogleUser u = verifier().verify(jwt);

        assertThat(u.email()).isEqualTo("ada@x.com");
        assertThat(u.name()).isEqualTo("Ada Lovelace");
        assertThat(u.sub()).isEqualTo("google-sub-123");
    }

    @Test
    void wrongAudience_throws() {
        String jwt = token("someone-else.apps.googleusercontent.com",
                "https://accounts.google.com", "ada@x.com", true, future());

        assertThatThrownBy(() -> verifier().verify(jwt))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("audience");
    }

    @Test
    void invalidIssuer_throws() {
        String jwt = token(CLIENT_ID, "https://evil.example.com", "ada@x.com", true, future());

        assertThatThrownBy(() -> verifier().verify(jwt))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("issuer");
    }

    @Test
    void expiredToken_throws() {
        Date past = new Date(System.currentTimeMillis() - 120_000);
        String jwt = token(CLIENT_ID, "https://accounts.google.com", "ada@x.com", true, past);

        assertThatThrownBy(() -> verifier().verify(jwt))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Invalid Google token");
    }

    @Test
    void emailNotVerified_throws() {
        String jwt = token(CLIENT_ID, "https://accounts.google.com", "ada@x.com", false, future());

        assertThatThrownBy(() -> verifier().verify(jwt))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("not verified");
    }

    @Test
    void notConfigured_throws() {
        GoogleTokenVerifier unconfigured = new GoogleTokenVerifier("", kid -> publicKey);
        String jwt = token(CLIENT_ID, "https://accounts.google.com", "ada@x.com", true, future());

        assertThatThrownBy(() -> unconfigured.verify(jwt))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("not configured");
    }
}
