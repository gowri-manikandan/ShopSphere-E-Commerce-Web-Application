package com.shopsphere.search;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory store of productId -> embedding vector, used for cosine ranking. Fine at
 * mid-level scale (<50k products per §6). Warmed at startup and kept current by
 * {@link EmbeddingService}. Deliberately a dumb store — loading/backfill lives in the service.
 */
@Component
public class EmbeddingCache {

    private final Map<Long, float[]> vectors = new ConcurrentHashMap<>();

    public void put(Long productId, float[] vector) {
        vectors.put(productId, vector);
    }

    public void evict(Long productId) {
        vectors.remove(productId);
    }

    public float[] get(Long productId) {
        return vectors.get(productId);
    }

    public boolean contains(Long productId) {
        return vectors.containsKey(productId);
    }

    /** Live view of all cached entries (for similarity scans). */
    public Set<Map.Entry<Long, float[]>> entries() {
        return vectors.entrySet();
    }

    public int size() {
        return vectors.size();
    }
}
