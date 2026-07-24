package com.shopsphere.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Idempotency ledger for Stripe webhooks (§9). Stripe retries webhook delivery, so every
 * event id we successfully process is recorded here and re-deliveries are ignored — an
 * order is never fulfilled (or refunded) twice.
 */
@Entity
@Table(name = "processed_stripe_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProcessedStripeEvent {

    // Stripe event id (evt_...) — natural primary key, so existsById is the dedup check.
    @Id
    @Column(name = "event_id", length = 255)
    private String eventId;

    @Column(name = "event_type", length = 100)
    private String eventType;

    @Column(name = "processed_at", nullable = false)
    private LocalDateTime processedAt;
}
