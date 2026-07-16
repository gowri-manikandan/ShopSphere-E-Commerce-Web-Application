package com.shopsphere.realtime;

import java.time.LocalDateTime;

/** Published inside a transaction whenever an order's status changes. */
public record OrderStatusChangedEvent(Long orderId, Long userId, String status, LocalDateTime updatedAt) {
}
