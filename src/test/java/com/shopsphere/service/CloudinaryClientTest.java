package com.shopsphere.service;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the Cloudinary signed-upload signature (§15). Pure SHA-1 — no network.
 */
class CloudinaryClientTest {

    @Test
    void sign_isDeterministic_and40CharLowercaseHex() {
        Map<String, String> params = new TreeMap<>();
        params.put("public_id", "user_5");
        params.put("timestamp", "1315060510");

        String sig = CloudinaryClient.sign(params, "abcd");

        assertThat(sig).matches("[0-9a-f]{40}"); // SHA-1 = 20 bytes = 40 hex chars
        assertThat(CloudinaryClient.sign(params, "abcd")).isEqualTo(sig); // deterministic
    }

    @Test
    void sign_isSha1OfSortedParamsJoinedWithSecretAppended() throws Exception {
        // Cloudinary's scheme: SHA-1( "k=v&k=v"(sorted) + apiSecret ). Compute the expected
        // independently here to validate the exact string Cloudinary would sign.
        Map<String, String> params = new TreeMap<>();
        params.put("public_id", "sample");
        params.put("timestamp", "1315060510");

        String toSign = "public_id=sample&timestamp=1315060510" + "abcd";
        String expected = sha1Hex(toSign);

        assertThat(CloudinaryClient.sign(params, "abcd")).isEqualTo(expected);
    }

    private static String sha1Hex(String s) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-1").digest(s.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder(digest.length * 2);
        for (byte b : digest) {
            hex.append(Character.forDigit((b >> 4) & 0xF, 16));
            hex.append(Character.forDigit(b & 0xF, 16));
        }
        return hex.toString();
    }

    @Test
    void sign_sortsParamsAlphabetically_regardlessOfInsertionOrder() {
        // Insertion order deliberately non-alphabetical; TreeMap in the client sorts, so the
        // signature must equal the alphabetically-signed one (folder < public_id < timestamp).
        Map<String, String> unordered = new LinkedHashMap<>();
        unordered.put("timestamp", "111");
        unordered.put("folder", "shopsphere/avatars");
        unordered.put("public_id", "user_1");

        Map<String, String> sorted = new TreeMap<>(unordered);

        assertThat(CloudinaryClient.sign(unordered, "secret"))
                .isEqualTo(CloudinaryClient.sign(sorted, "secret"));
    }
}
