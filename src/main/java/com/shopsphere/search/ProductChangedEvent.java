package com.shopsphere.search;

/** Published after a product is created or updated so its embedding is (re)generated. */
public record ProductChangedEvent(Long productId) {
}
