package com.shopsphere.config;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * Cloudinary wiring (§15). Reads {@code app.cloudinary.*} credentials.
 *
 * <p>Env-gated: with no credentials the app still boots and avatar uploads fall back to the
 * local {@code frontend/uploads/} directory ({@link #isConfigured()} is false). Set the three
 * keys to push avatars to the Cloudinary CDN instead (persistent across redeploys).
 */
@Configuration
@Getter
public class CloudinaryConfig {

    private static final Logger log = LoggerFactory.getLogger(CloudinaryConfig.class);

    @Value("${app.cloudinary.cloud-name:}")
    private String cloudName;

    @Value("${app.cloudinary.api-key:}")
    private String apiKey;

    @Value("${app.cloudinary.api-secret:}")
    private String apiSecret;

    @Value("${app.cloudinary.folder:shopsphere/avatars}")
    private String folder;

    @PostConstruct
    void init() {
        // Defensive trim: env values are easy to paste with stray leading/trailing spaces
        // (e.g. "= Root"), which would corrupt the request URL and the signature.
        cloudName = trim(cloudName);
        apiKey = trim(apiKey);
        apiSecret = trim(apiSecret);
        folder = trim(folder);

        if (isConfigured()) {
            log.info("Cloudinary configured (cloud={}) — avatar uploads go to the CDN.", cloudName);
        } else {
            log.warn("Cloudinary not configured — avatar uploads fall back to local disk. "
                    + "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET "
                    + "to use the CDN.");
        }
    }

    /** True when cloud name + api key + secret are all present, i.e. CDN uploads can be made. */
    public boolean isConfigured() {
        return isNotBlank(cloudName) && isNotBlank(apiKey) && isNotBlank(apiSecret);
    }

    private boolean isNotBlank(String s) {
        return s != null && !s.isBlank();
    }

    private String trim(String s) {
        return s == null ? null : s.trim();
    }
}
