package com.shopsphere.realtime;

/** Published inside a transaction whenever a product's stock quantity changes. */
public record StockChangedEvent(Long productId) {
}
