-- AI semantic search / recommendations (CLAUDE.md §6).
-- Embeddings live in their own table (not on `products`) so product reads stay fast.
-- `embedding` is a JSON array of floats serialized as text. ON DELETE CASCADE removes
-- the embedding automatically when its product is deleted.
CREATE TABLE `product_embeddings` (
  `product_id` bigint NOT NULL,
  `embedding` mediumtext NOT NULL,
  `model` varchar(100) DEFAULT NULL,
  `dimensions` int DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`product_id`),
  CONSTRAINT `fk_product_embeddings_product` FOREIGN KEY (`product_id`)
      REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
