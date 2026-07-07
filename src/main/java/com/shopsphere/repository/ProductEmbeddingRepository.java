package com.shopsphere.repository;

import com.shopsphere.entity.ProductEmbedding;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * PK is the product id. findAll() is used to warm the in-memory cache at startup;
 * deletion is handled by the products FK ON DELETE CASCADE, so no custom delete needed.
 */
public interface ProductEmbeddingRepository extends JpaRepository<ProductEmbedding, Long> {
}
