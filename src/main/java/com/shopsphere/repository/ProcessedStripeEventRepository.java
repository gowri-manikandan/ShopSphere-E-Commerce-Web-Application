package com.shopsphere.repository;

import com.shopsphere.entity.ProcessedStripeEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProcessedStripeEventRepository extends JpaRepository<ProcessedStripeEvent, String> {
    // existsById(eventId) provides the idempotency check (§9).
}
