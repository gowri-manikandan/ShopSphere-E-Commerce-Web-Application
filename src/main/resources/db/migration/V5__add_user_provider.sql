-- Google Sign-In support: track how an account authenticates, and allow Google-only
-- accounts (which have no local password) to have a NULL password.
ALTER TABLE `users`
  ADD COLUMN `provider` varchar(20) NOT NULL DEFAULT 'LOCAL',
  MODIFY COLUMN `password` varchar(255) NULL;
