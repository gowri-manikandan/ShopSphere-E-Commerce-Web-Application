-- Migration to update store address and GST details to match Sri Maruthi textiles branding
UPDATE store_settings SET 
    address = '123 Handloom Street, Karur, Tamil Nadu - 639001',
    gst_number = '33AAAAA0000A1Z5'
WHERE id = 1;
