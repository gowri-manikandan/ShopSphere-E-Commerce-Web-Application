-- Switch the payment gateway from Stripe to Razorpay (§9).
-- V6 (Stripe) stays untouched on disk so Flyway checksums remain valid; this migration
-- morphs the schema in place.

-- Repurpose the gateway order-id column (was Stripe's payment_intent_id) and add the
-- Razorpay payment id captured on success. The existing unique index on the column carries
-- over to the renamed column.
ALTER TABLE `payments`
  CHANGE COLUMN `payment_intent_id` `razorpay_order_id` varchar(255) DEFAULT NULL;
ALTER TABLE `payments`
  ADD COLUMN `razorpay_payment_id` varchar(255) DEFAULT NULL;

-- Generalise the webhook idempotency ledger (was processed_stripe_events).
RENAME TABLE `processed_stripe_events` TO `processed_gateway_events`;
