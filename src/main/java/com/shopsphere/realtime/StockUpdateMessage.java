package com.shopsphere.realtime;

/** Socket payload for /topic/stock/{productId} — shape fixed by CLAUDE.md §5. */
public record StockUpdateMessage(Long productId, int availableStock, String status) {

    public static final String IN_STOCK = "IN_STOCK";
    public static final String LOW_STOCK = "LOW_STOCK";
    public static final String OUT_OF_STOCK = "OUT_OF_STOCK";
}
