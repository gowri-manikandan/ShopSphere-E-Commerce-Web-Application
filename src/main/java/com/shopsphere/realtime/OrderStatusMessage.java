package com.shopsphere.realtime;

import java.time.LocalDateTime;

/** Socket payload for /topic/orders/{userId} — shape fixed by CLAUDE.md §5. */
public record OrderStatusMessage(Long orderId, String status, LocalDateTime updatedAt) {
}
