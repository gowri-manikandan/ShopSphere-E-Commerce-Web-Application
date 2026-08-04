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

    private final StoreSettingsRepository repository;

    @GetMapping
    public ResponseEntity<StoreSettings> getSettings() {
        StoreSettings settings = repository.findById(1L)
                .orElseGet(() -> repository.save(StoreSettings.builder()
                        .storeName("ShopSphere")
                        .address("123 E-Commerce Boulevard, Tech Park, Bangalore, Karnataka - 560001")
                        .gstNumber("29AAAAA0000A1Z5")
                        .pan("ABCDE1234F")
                        .bankName("State Bank of India")
                        .bankAccountNumber("333344445555")
                        .bankIfsc("SBIN0001234")
                        .build()));
        return ResponseEntity.ok(settings);
    }

    @PutMapping
    public ResponseEntity<StoreSettings> updateSettings(@RequestBody StoreSettings newSettings) {
        StoreSettings settings = repository.findById(1L)
                .orElseGet(() -> StoreSettings.builder().build());
        
        settings.setStoreName(newSettings.getStoreName());
        settings.setAddress(newSettings.getAddress());
        settings.setGstNumber(newSettings.getGstNumber());
        settings.setPan(newSettings.getPan());
        settings.setBankName(newSettings.getBankName());
        settings.setBankAccountNumber(newSettings.getBankAccountNumber());
        settings.setBankIfsc(newSettings.getBankIfsc());

        return ResponseEntity.ok(repository.save(settings));
    }
}
