-- Migration to add video_url column to the products table
ALTER TABLE products ADD COLUMN video_url VARCHAR(500) DEFAULT NULL;
