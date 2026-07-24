package com.shopsphere.repository;

import com.shopsphere.entity.ProcessedGatewayEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProcessedGatewayEventRepository extends JpaRepository<ProcessedGatewayEvent, String> {
    // existsById(eventId) provides the webhook idempotency check (§9).
}
