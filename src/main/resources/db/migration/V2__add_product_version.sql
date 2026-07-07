-- Optimistic-locking column for products (CLAUDE.md §5 concurrency rule).
-- Hibernate bumps `version` on every UPDATE and includes it in the WHERE clause,
-- so concurrent stock writes conflict instead of silently overwriting each other.
ALTER TABLE `products`
  ADD COLUMN `version` bigint NOT NULL DEFAULT 0;
