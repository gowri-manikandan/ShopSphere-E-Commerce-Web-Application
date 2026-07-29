package com.shopsphere.realtime;

import java.time.LocalDateTime;

/** STOMP payload pushed to {@code /topic/notifications/{userId}} (§16). */
public record NotificationMessage(Long id, String type, String title, String message,
                                  String link, boolean read, LocalDateTime createdAt) {
}
