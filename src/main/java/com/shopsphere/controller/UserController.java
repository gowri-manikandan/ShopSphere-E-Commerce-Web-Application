package com.shopsphere.controller;

import com.shopsphere.dto.ApiMessage;
import com.shopsphere.dto.PasswordChangeRequest;
import com.shopsphere.dto.UserProfileResponse;
import com.shopsphere.dto.UserProfileUpdateRequest;
import com.shopsphere.entity.User;
import com.shopsphere.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping("/profile")
    public ResponseEntity<UserProfileResponse> getProfile() {
        User user = userService.getProfile();
        return ResponseEntity.ok(mapToResponse(user));
    }

    @PutMapping("/profile")
    public ResponseEntity<UserProfileResponse> updateProfile(@Valid @RequestBody UserProfileUpdateRequest request) {
        User user = userService.updateProfile(request);
        return ResponseEntity.ok(mapToResponse(user));
    }

    @PostMapping("/change-password")
    public ResponseEntity<ApiMessage> changePassword(@Valid @RequestBody PasswordChangeRequest request) {
        userService.changePassword(request);
        return ResponseEntity.ok(new ApiMessage("Password updated successfully"));
    }

    private UserProfileResponse mapToResponse(User user) {
        return UserProfileResponse.builder()
                .id(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .role(user.getRole().name())
                .emailVerified(user.isEmailVerified())
                .profileImageUrl(user.getProfileImageUrl())
                .build();
    }
}
