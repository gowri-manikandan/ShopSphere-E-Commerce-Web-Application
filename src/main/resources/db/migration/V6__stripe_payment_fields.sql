-- Stripe payment integration (§9).
-- 1. Extend payments.status with REFUNDED (native MySQL enum -> add value via MODIFY).
--    Superset of the existing values, so current rows are unaffected.
ALTER TABLE `payments`
  MODIFY COLUMN `status` enum('PENDING','SUCCESS','FAILED','REFUNDED') NOT NULL;

-- 2. Store the Stripe PaymentIntent id so an incoming webhook can be correlated back
--    to its payment. Nullable (COD has none); unique so a PaymentIntent maps to one payment.
ALTER TABLE `payments`
  ADD COLUMN `payment_intent_id` varchar(255) DEFAULT NULL,
  ADD UNIQUE KEY `uk_payments_payment_intent_id` (`payment_intent_id`);

-- 3. Idempotency ledger: every Stripe event id we process is recorded here so retried
--    webhook deliveries are ignored (no double-fulfilment / double-refund).
CREATE TABLE `processed_stripe_events` (
  `event_id` varchar(255) NOT NULL,
  `event_type` varchar(100) DEFAULT NULL,
  `processed_at` datetime(6) NOT NULL,
  PRIMARY KEY (`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
