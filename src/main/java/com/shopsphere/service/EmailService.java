package com.shopsphere.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Autowired
    public EmailService(@Autowired(required = false) JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public void sendOtpEmail(String toEmail, String otp) {
        String subject = "Verify Your ShopSphere Account";
        String messageText = "Welcome to ShopSphere!\n\n"
                + "Your email verification OTP code is: " + otp + "\n\n"
                + "This OTP is valid for 15 minutes.\n\n"
                + "If you did not register for an account, please ignore this email.";

        // Always print prominently in console logs for testing ease
        System.out.println("=================================================");
        System.out.println("EMAIL VERIFICATION OTP FOR " + toEmail + ": " + otp);
        System.out.println("=================================================");

        try {
            if (mailSender != null) {
                SimpleMailMessage message = new SimpleMailMessage();
                message.setTo(toEmail);
                message.setSubject(subject);
                message.setText(messageText);
                message.setFrom("no-reply@shopsphere.com");
                mailSender.send(message);
                log.info("Verification email successfully sent to {}", toEmail);
            } else {
                log.info("JavaMailSender is not configured. OTP printed to console log only.");
            }
        } catch (Exception e) {
            log.warn("Could not send SMTP email to {}. Fallback to console logging. Reason: {}", toEmail, e.getMessage());
        }
    }
}
