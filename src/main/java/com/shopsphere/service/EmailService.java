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

        send(toEmail, subject, messageText, otp, "EMAIL VERIFICATION OTP");
    }

    public void sendPasswordResetEmail(String toEmail, String otp) {
        String subject = "Reset Your ShopSphere Password";
        String messageText = "We received a request to reset your ShopSphere password.\n\n"
                + "Your password reset OTP code is: " + otp + "\n\n"
                + "This OTP is valid for 5 minutes.\n\n"
                + "If you did not request a password reset, you can safely ignore this email — "
                + "your password will not be changed.";

        send(toEmail, subject, messageText, otp, "PASSWORD RESET OTP");
    }

    /** Sends via SMTP when configured; always prints the OTP to the console for local testing. */
    private void send(String toEmail, String subject, String messageText, String otp, String consoleLabel) {
        System.out.println("=================================================");
        System.out.println(consoleLabel + " FOR " + toEmail + ": " + otp);
        System.out.println("=================================================");

        try {
            if (mailSender != null) {
                SimpleMailMessage message = new SimpleMailMessage();
                message.setTo(toEmail);
                message.setSubject(subject);
                message.setText(messageText);
                message.setFrom("no-reply@shopsphere.com");
                mailSender.send(message);
                log.info("Email '{}' successfully sent to {}", subject, toEmail);
            } else {
                log.info("JavaMailSender is not configured. OTP printed to console log only.");
            }
        } catch (Exception e) {
            log.warn("Could not send SMTP email to {}. Fallback to console logging. Reason: {}", toEmail, e.getMessage());
        }
    }
}
