package com.shopsphere.service;

import com.shopsphere.dto.PasswordChangeRequest;
import com.shopsphere.dto.UserProfileUpdateRequest;
import com.shopsphere.entity.User;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.repository.UserRepository;
import com.shopsphere.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecurityUtils securityUtils;
    private final EmailService emailService;

    @Transactional(readOnly = true)
    public User getProfile() {
        return securityUtils.getCurrentUser();
    }

    @Transactional
    public User updateProfile(UserProfileUpdateRequest request) {
        User user = securityUtils.getCurrentUser();

        // Check if email is already taken by another user
        if (!user.getEmail().equalsIgnoreCase(request.getEmail()) && userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already in use: " + request.getEmail());
        }

        user.setName(request.getName());
        user.setProfileImageUrl(request.getProfileImageUrl());

        // Re-verify if email is changed
        if (!user.getEmail().equalsIgnoreCase(request.getEmail())) {
            user.setEmail(request.getEmail());
            user.setEmailVerified(false);
            String otp = String.format("%06d", new java.util.Random().nextInt(999999));
            user.setVerificationOtp(otp);
            user.setVerificationOtpExpiry(LocalDateTime.now().plusMinutes(15));
            emailService.sendOtpEmail(user.getEmail(), otp);
        }

        return userRepository.save(user);
    }

    @Transactional
    public void changePassword(PasswordChangeRequest request) {
        User user = securityUtils.getCurrentUser();

        if (!passwordEncoder.matches(request.getOldPassword(), user.getPassword())) {
            throw new BadRequestException("Current password does not match");
        }

        if (!request.getNewPassword().equals(request.getConfirmPassword())) {
            throw new BadRequestException("Confirm password does not match new password");
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }
}
