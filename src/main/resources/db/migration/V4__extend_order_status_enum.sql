-- CLAUDE.md §5 order lifecycle: PLACED -> CONFIRMED -> PACKED -> SHIPPED -> DELIVERED (+ CANCELLED).
-- The status column is a native MySQL enum, so new values must be added via MODIFY.
-- Superset of the existing values: current rows are unaffected.
ALTER TABLE `orders`
  MODIFY COLUMN `status` enum('PLACED','CONFIRMED','PACKED','SHIPPED','DELIVERED','CANCELLED') NOT NULL;
