package com.shopsphere.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shopsphere.exception.BadRequestException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.Locator;
import io.jsonwebtoken.ProtectedHeader;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.Key;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.util.Base64;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Verifies a Google Sign-In ID token (RS256) using Google's published JWKS, then validates the
 * standard claims (aud, iss, exp, email_verified). No Google libraries are needed — jjwt verifies
 * the RSA signature and the RSA public key is built from the JWKS with the JDK.
 *
 * NOTE (this machine): fetching Google's JWKS is an outbound HTTPS call that uses the JVM
 * truststore. On a machine whose corporate proxy CA is not in cacerts, that fetch fails with a
 * PKIX error — same limitation as OpenAiEmbeddingClient. Verification works in a normal deployment.
 */
@Component
public class GoogleTokenVerifier {

    private static final Set<String> VALID_ISSUERS =
            Set.of("accounts.google.com", "https://accounts.google.com");
    private static final String GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

    /** Resolves an RSA public key by JWKS key id. Swappable so tests need no network. */
    public interface KeyResolver {
        RSAPublicKey resolve(String kid) throws Exception;
    }

    public record GoogleUser(String email, String name, String sub) {}

    private final String clientId;
    private final KeyResolver keyResolver;

    // Spring wiring: read the client id, use the real JWKS resolver.
    @Autowired
    public GoogleTokenVerifier(@Value("${spring.security.oauth2.client.registration.google.client-id:}") String clientId) {
        this(clientId, new GoogleJwksKeyResolver());
    }

    // Test wiring: inject a fixed key resolver.
    GoogleTokenVerifier(String clientId, KeyResolver keyResolver) {
        this.clientId = clientId;
        this.keyResolver = keyResolver;
    }

    public GoogleUser verify(String idToken) {
        if (clientId == null || clientId.isBlank()) {
            throw new BadRequestException("Google sign-in is not configured.");
        }

        Claims claims;
        try {
            Locator<Key> keyLocator = header -> {
                if (header instanceof ProtectedHeader ph) {
                    try {
                        return keyResolver.resolve(ph.getKeyId());
                    } catch (Exception e) {
                        throw new IllegalStateException("Unable to resolve Google signing key", e);
                    }
                }
                return null;
            };
            claims = Jwts.parser()
                    .keyLocator(keyLocator)
                    .clockSkewSeconds(60)
                    .build()
                    .parseSignedClaims(idToken) // verifies signature + expiry
                    .getPayload();
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestException("Invalid Google token.");
        }

        // aud must equal our client id
        Set<String> aud = claims.getAudience();
        if (aud == null || !aud.contains(clientId)) {
            throw new BadRequestException("Google token audience mismatch.");
        }
        // iss must be Google
        if (!VALID_ISSUERS.contains(claims.getIssuer())) {
            throw new BadRequestException("Google token issuer invalid.");
        }
        // email must be present and verified
        String email = claims.get("email", String.class);
        Object emailVerified = claims.get("email_verified");
        boolean verified = Boolean.TRUE.equals(emailVerified) || "true".equals(String.valueOf(emailVerified));
        if (email == null || email.isBlank() || !verified) {
            throw new BadRequestException("Google account email is not verified.");
        }

        return new GoogleUser(email, claims.get("name", String.class), claims.getSubject());
    }

    /** Default resolver: fetch + cache Google's JWKS via the JDK HttpClient. */
    static final class GoogleJwksKeyResolver implements KeyResolver {
        private final HttpClient http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).build();
        private final ObjectMapper mapper = new ObjectMapper();
        private final ConcurrentHashMap<String, RSAPublicKey> cache = new ConcurrentHashMap<>();

        @Override
        public RSAPublicKey resolve(String kid) throws Exception {
            RSAPublicKey cached = cache.get(kid);
            if (cached != null) return cached;
            refresh();
            RSAPublicKey key = cache.get(kid);
            if (key == null) throw new BadRequestException("Unknown Google signing key.");
            return key;
        }

        private void refresh() throws Exception {
            HttpRequest req = HttpRequest.newBuilder(URI.create(GOOGLE_JWKS_URL))
                    .timeout(Duration.ofSeconds(5)).GET().build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                throw new BadRequestException("Could not fetch Google signing keys.");
            }
            JsonNode keys = mapper.readTree(resp.body()).path("keys");
            for (JsonNode k : keys) {
                if (!"RSA".equals(k.path("kty").asText())) continue;
                String kid = k.path("kid").asText();
                BigInteger modulus = new BigInteger(1, Base64.getUrlDecoder().decode(k.path("n").asText()));
                BigInteger exponent = new BigInteger(1, Base64.getUrlDecoder().decode(k.path("e").asText()));
                RSAPublicKey pub = (RSAPublicKey) KeyFactory.getInstance("RSA")
                        .generatePublic(new RSAPublicKeySpec(modulus, exponent));
                cache.put(kid, pub);
            }
        }
    }
}
