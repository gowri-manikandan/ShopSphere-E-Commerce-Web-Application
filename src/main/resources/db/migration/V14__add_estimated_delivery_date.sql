-- Migration to add estimated_delivery_date column to the orders table
ALTER TABLE orders ADD COLUMN estimated_delivery_date DATETIME(6) DEFAULT NULL;
