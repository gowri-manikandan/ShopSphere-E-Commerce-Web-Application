package com.shopsphere.controller;

import com.shopsphere.dto.ApiMessage;
import com.shopsphere.dto.OtpVerificationRequest;
import com.shopsphere.dto.SendOtpRequest;
import com.shopsphere.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class GlobalOtpController {

    private final AuthService authService;

    @PostMapping("/send-otp")
    public ResponseEntity<ApiMessage> sendOtp(@Valid @RequestBody SendOtpRequest request) {
        authService.sendOtpForLogin(request.getEmail());
        return ResponseEntity.ok(new ApiMessage("OTP sent successfully."));
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<ApiMessage> verifyOtp(@Valid @RequestBody OtpVerificationRequest request) {
        authService.verifyOtpForLogin(request.getEmail(), request.getOtp());
        return ResponseEntity.ok(new ApiMessage("Email verified successfully"));
    }
}
