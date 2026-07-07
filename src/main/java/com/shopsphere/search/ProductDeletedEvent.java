package com.shopsphere.search;

/** Published after a product is deleted so its cached embedding is evicted
 *  (the DB row is removed by the products FK ON DELETE CASCADE). */
public record ProductDeletedEvent(Long productId) {
}
