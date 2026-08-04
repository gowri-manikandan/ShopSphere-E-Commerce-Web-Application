package com.shopsphere.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Autowired
    public EmailService(@Autowired(required = false) JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public boolean isMailSenderConfigured() {
        return this.mailSender != null && mailUsername != null && !mailUsername.isBlank();
    }

    public void sendOtpEmail(String toEmail, String otp) {
        String subject = "Verify Your Sri Maruthi textiles Account";
        String messageText = "Welcome to Sri Maruthi textiles!\n\n"
                + "Your email verification OTP code is: " + otp + "\n\n"
                + "This OTP is valid for 15 minutes.\n\n"
                + "If you did not register for an account, please ignore this email.";

        send(toEmail, subject, messageText, otp, "EMAIL VERIFICATION OTP");
    }

    public void sendPasswordResetEmail(String toEmail, String otp) {
        String subject = "Reset Your Sri Maruthi textiles Password";
        String messageText = "We received a request to reset your Sri Maruthi textiles password.\n\n"
                + "Your password reset OTP code is: " + otp + "\n\n"
                + "This OTP is valid for 5 minutes.\n\n"
                + "If you did not request a password reset, you can safely ignore this email — "
                + "your password will not be changed.";

        send(toEmail, subject, messageText, otp, "PASSWORD RESET OTP");
    }

    /** Sends via SMTP; throws exception if SMTP send fails or is unconfigured. */
    private void send(String toEmail, String subject, String messageText, String otp, String consoleLabel) {
        System.out.println("=================================================");
        System.out.println(consoleLabel + " FOR " + toEmail + ": " + otp);
        System.out.println("=================================================");

        if (mailSender == null || mailUsername == null || mailUsername.isBlank()) {
            log.error("JavaMailSender is not configured. Cannot send email to {}", toEmail);
            throw new IllegalStateException("Email service is not configured. Please set MAIL_USERNAME and MAIL_PASSWORD in your environment.");
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(toEmail);
            message.setSubject(subject);
            message.setText(messageText);
            message.setFrom(mailUsername);
            mailSender.send(message);
            log.info("Email '{}' successfully sent to {}", subject, toEmail);
        } catch (Exception e) {
            log.error("Could not send SMTP email to {}. Reason: {}", toEmail, e.getMessage(), e);
            throw new RuntimeException("Failed to send email: " + e.getMessage(), e);
        }
    }
}
