package com.shopsphere.search;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Dependency-free, fully offline embedding using the hashing trick (a.k.a. feature hashing).
 * Tokens are lower-cased word n-grams; each is hashed to a bucket with a sign, term counts
 * accumulate, and the vector is L2-normalized. Cosine similarity then reflects token overlap,
 * giving a lexical-semantic search that needs no model, network, or API key.
 *
 * Default provider (matchIfMissing = true) so the feature works out of the box.
 */
@Component
@ConditionalOnProperty(name = "app.embedding.provider", havingValue = "local", matchIfMissing = true)
public class LocalHashingEmbeddingClient implements EmbeddingClient {

    private final int dimensions;

    public LocalHashingEmbeddingClient(@Value("${app.embedding.dimensions:256}") int dimensions) {
        this.dimensions = dimensions;
    }

    @Override
    public float[] embed(String text) {
        float[] vec = new float[dimensions];
        if (text == null || text.isBlank()) {
            return vec;
        }
        String[] tokens = text.toLowerCase().split("[^a-z0-9]+");
        for (String token : tokens) {
            if (token.isEmpty()) {
                continue;
            }
            int h = token.hashCode();
            int bucket = Math.floorMod(h, dimensions);
            // Second, independent hash decides the sign — reduces collision-cancellation bias.
            int sign = (Math.floorMod(h * 31 + 7, 2) == 0) ? 1 : -1;
            vec[bucket] += sign;
        }
        l2Normalize(vec);
        return vec;
    }

    private void l2Normalize(float[] vec) {
        double sumSq = 0.0;
        for (float v : vec) {
            sumSq += (double) v * v;
        }
        if (sumSq == 0.0) {
            return;
        }
        double norm = Math.sqrt(sumSq);
        for (int i = 0; i < vec.length; i++) {
            vec[i] = (float) (vec[i] / norm);
        }
    }

    @Override
    public String model() {
        return "local-hashing-v1(dim=" + dimensions + ")";
    }
}
