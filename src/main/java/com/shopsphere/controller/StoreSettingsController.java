package com.shopsphere.controller;

import com.shopsphere.entity.StoreSettings;
import com.shopsphere.repository.StoreSettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/store-settings")
@RequiredArgsConstructor
public class StoreSettingsController {

    private static final Long SETTINGS_ID = 1L;

    private final StoreSettingsRepository repository;

    @GetMapping
    public ResponseEntity<StoreSettings> getSettings() {
        return ResponseEntity.ok(repository.findById(SETTINGS_ID)
                .orElseGet(() -> repository.save(defaultSettings())));
    }

    @PutMapping
    public ResponseEntity<StoreSettings> updateSettings(@RequestBody StoreSettings newSettings) {
        StoreSettings settings = repository.findById(SETTINGS_ID)
                .orElseGet(() -> StoreSettings.builder().id(SETTINGS_ID).build());

        settings.setId(SETTINGS_ID);
        settings.setStoreName(newSettings.getStoreName());
        settings.setAddress(newSettings.getAddress());
        settings.setGstNumber(newSettings.getGstNumber());
        settings.setPan(newSettings.getPan());
        settings.setBankName(newSettings.getBankName());
        settings.setBankAccountNumber(newSettings.getBankAccountNumber());
        settings.setBankIfsc(newSettings.getBankIfsc());

        return ResponseEntity.ok(repository.save(settings));
    }

    private StoreSettings defaultSettings() {
        return StoreSettings.builder()
                .id(SETTINGS_ID)
                .storeName("Sri Maruthi textiles")
                .address("123 Handloom Street, Karur, Tamil Nadu - 639001")
                .gstNumber("33AAAAA0000A1Z5")
                .pan("ABCDE1234F")
                .bankName("State Bank of India")
                .bankAccountNumber("333344445555")
                .bankIfsc("SBIN0001234")
                .build();
    }
}
