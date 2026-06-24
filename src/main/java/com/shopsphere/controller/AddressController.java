package com.shopsphere.controller;

import com.shopsphere.dto.AddressRequest;
import com.shopsphere.dto.AddressResponse;
import com.shopsphere.dto.ApiMessage;
import com.shopsphere.service.AddressService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/addresses")
@RequiredArgsConstructor
public class AddressController {

    private final AddressService addressService;

    @GetMapping
    public ResponseEntity<List<AddressResponse>> getMyAddresses() {
        return ResponseEntity.ok(addressService.getMyAddresses());
    }

    @PostMapping
    public ResponseEntity<AddressResponse> add(@Valid @RequestBody AddressRequest request) {
        return ResponseEntity.ok(addressService.add(request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiMessage> delete(@PathVariable Long id) {
        addressService.delete(id);
        return ResponseEntity.ok(new ApiMessage("Address deleted"));
    }
}
