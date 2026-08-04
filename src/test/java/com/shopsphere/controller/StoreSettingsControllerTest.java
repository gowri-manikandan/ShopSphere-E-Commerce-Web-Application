package com.shopsphere.controller;

import com.shopsphere.entity.StoreSettings;
import com.shopsphere.repository.StoreSettingsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StoreSettingsControllerTest {

    @Mock
    StoreSettingsRepository repository;

    private StoreSettingsController controller;

    @BeforeEach
    void setUp() {
        controller = new StoreSettingsController(repository);
    }

    @Test
    void getSettings_createsCanonicalRowWhenMissing() {
        when(repository.findById(1L)).thenReturn(Optional.empty());
        when(repository.save(any(StoreSettings.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ResponseEntity<StoreSettings> response = controller.getSettings();

        ArgumentCaptor<StoreSettings> captor = ArgumentCaptor.forClass(StoreSettings.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getId()).isEqualTo(1L);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getId()).isEqualTo(1L);
        assertThat(response.getBody().getStoreName()).isEqualTo("ShopSphere");
    }

    @Test
    void updateSettings_keepsCanonicalRowId() {
        StoreSettings request = StoreSettings.builder()
                .storeName("Acme Books")
                .address("42 Example St")
                .gstNumber("29AAAAA0000A1Z5")
                .pan("ABCDE1234F")
                .bankName("HDFC Bank")
                .bankAccountNumber("501002345678")
                .bankIfsc("HDFC0000123")
                .build();

        when(repository.findById(1L)).thenReturn(Optional.empty());
        when(repository.save(any(StoreSettings.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ResponseEntity<StoreSettings> response = controller.updateSettings(request);

        ArgumentCaptor<StoreSettings> captor = ArgumentCaptor.forClass(StoreSettings.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getId()).isEqualTo(1L);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getId()).isEqualTo(1L);
        assertThat(response.getBody().getStoreName()).isEqualTo("Acme Books");
    }
}
