-- Allow order_items.product_id to be NULL.
-- Deleting a product dissociates it from historical order items
-- (ProductService.delete -> OrderItemRepository.disassociateProduct sets product = null) so the
-- order history is preserved and shows "Deleted Product" (OrderMapper handles a null product).
-- The baseline created this column NOT NULL, which rejected that UPDATE with
-- "Column 'product_id' cannot be null". The JPA entity already maps it nullable=true.
-- The existing foreign key stays in place; a nullable FK simply permits NULL values.
ALTER TABLE `order_items`
  MODIFY COLUMN `product_id` bigint NULL;
