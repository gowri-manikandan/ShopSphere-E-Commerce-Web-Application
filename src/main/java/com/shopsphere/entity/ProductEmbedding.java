package com.shopsphere.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Stored embedding for a product (CLAUDE.md §6). Separate table from `products` to keep
 * product reads fast. `productId` is both PK and FK to products(id); the FK is ON DELETE
 * CASCADE (see V3 migration), so deleting a product removes its embedding automatically.
 */
@Entity
@Table(name = "product_embeddings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductEmbedding {

    @Id
    @Column(name = "product_id")
    private Long productId;

    // JSON array of floats, e.g. "[0.12,-0.03,...]"
    @Column(nullable = false, columnDefinition = "MEDIUMTEXT")
    private String embedding;

    @Column(length = 100)
    private String model;

    private Integer dimensions;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = LocalDateTime.now();
    }
}
