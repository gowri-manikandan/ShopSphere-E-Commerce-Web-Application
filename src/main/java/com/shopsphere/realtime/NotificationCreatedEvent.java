package com.shopsphere.realtime;

/** Published (inside the notification's transaction) when a notification is created for a user. */
public record NotificationCreatedEvent(Long userId, NotificationMessage payload) {
}
