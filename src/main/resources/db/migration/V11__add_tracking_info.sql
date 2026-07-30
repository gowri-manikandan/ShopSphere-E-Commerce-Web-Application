-- Add tracking info to orders table
ALTER TABLE `orders`
ADD COLUMN `courier_partner` VARCHAR(100) DEFAULT NULL,
ADD COLUMN `tracking_number` VARCHAR(100) DEFAULT NULL;
