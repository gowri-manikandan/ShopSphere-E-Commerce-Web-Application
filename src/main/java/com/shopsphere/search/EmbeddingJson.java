package com.shopsphere.search;

import com.fasterxml.jackson.databind.JsonNode;

/** Helpers to convert a JSON array node of numbers into a float[]. */
final class EmbeddingJson {

    private EmbeddingJson() {
    }

    static float[] toFloatArray(JsonNode arrayNode) {
        if (arrayNode == null || !arrayNode.isArray() || arrayNode.isEmpty()) {
            throw new EmbeddingException("Embedding response did not contain a numeric array");
        }
        float[] out = new float[arrayNode.size()];
        for (int i = 0; i < arrayNode.size(); i++) {
            out[i] = (float) arrayNode.get(i).asDouble();
        }
        return out;
    }
}
