-- Migration to create store_settings table and seed initial value
CREATE TABLE store_settings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    store_name VARCHAR(150),
    address TEXT,
    gst_number VARCHAR(50),
    pan VARCHAR(50),
    bank_name VARCHAR(100),
    bank_account_number VARCHAR(100),
    bank_ifsc VARCHAR(50)
);

INSERT INTO store_settings (id, store_name, address, gst_number, pan, bank_name, bank_account_number, bank_ifsc) 
VALUES (1, 'ShopSphere', '123 E-Commerce Boulevard, Tech Park, Bangalore, Karnataka - 560001', '29AAAAA0000A1Z5', 'ABCDE1234F', 'State Bank of India', '333344445555', 'SBIN0001234');
