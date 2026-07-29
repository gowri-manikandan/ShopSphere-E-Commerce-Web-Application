package com.shopsphere.service;

import com.shopsphere.config.CloudinaryConfig;
import com.shopsphere.entity.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the env-gated avatar storage router (§15).
 */
@ExtendWith(MockitoExtension.class)
class ImageStorageServiceTest {

    @Mock CloudinaryConfig cloudinaryConfig;
    @Mock CloudinaryClient cloudinaryClient;

    private final User user = User.builder().id(5L).email("u@x.com").name("U").build();

    private MockMultipartFile image() {
        return new MockMultipartFile("file", "avatar.png", "image/png", new byte[]{1, 2, 3});
    }

    @Test
    void store_cloudinaryConfigured_delegatesToClient_withoutFixedPublicId() {
        when(cloudinaryConfig.isConfigured()).thenReturn(true);
        // publicId is null -> Cloudinary auto-generates a unique id (no overwrite between uploads).
        when(cloudinaryClient.upload(any(), eq("avatar.png"), eq("image/png"), isNull()))
                .thenReturn("https://res.cloudinary.com/demo/image/upload/v1/shopsphere/abc123.png");

        ImageStorageService service = new ImageStorageService(cloudinaryConfig, cloudinaryClient, "unused/");

        String url = service.store(image(), user);

        assertThat(url).isEqualTo(
                "https://res.cloudinary.com/demo/image/upload/v1/shopsphere/abc123.png");
        verify(cloudinaryClient).upload(any(), eq("avatar.png"), eq("image/png"), isNull());
    }

    @Test
    void store_notConfigured_writesToLocalDir_returnsRelativeUrl(@org.junit.jupiter.api.io.TempDir Path tempDir) {
        when(cloudinaryConfig.isConfigured()).thenReturn(false);

        ImageStorageService service = new ImageStorageService(
                cloudinaryConfig, cloudinaryClient, tempDir.toString());

        String url = service.store(image(), user);

        assertThat(url).startsWith("uploads/").endsWith(".png");
        // The file was actually written to the local dir.
        String filename = url.substring("uploads/".length());
        assertThat(Files.exists(tempDir.resolve(filename))).isTrue();
        verify(cloudinaryClient, never()).upload(any(), any(), any(), any());
    }
}
