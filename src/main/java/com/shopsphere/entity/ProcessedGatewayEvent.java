package com.shopsphere.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Idempotency ledger for payment-gateway webhooks (§9). Razorpay retries webhook delivery, so
 * every event id we successfully process is recorded here and re-deliveries are ignored — an
 * order is never fulfilled (or refunded) twice.
 */
@Entity
@Table(name = "processed_gateway_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProcessedGatewayEvent {

    // Gateway event id (Razorpay's X-Razorpay-Event-Id) — natural PK, so existsById dedups.
    @Id
    @Column(name = "event_id", length = 255)
    private String eventId;

    @Column(name = "event_type", length = 100)
    private String eventType;

    @Column(name = "processed_at", nullable = false)
    private LocalDateTime processedAt;
}
