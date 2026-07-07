package com.shopsphere.search;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LocalHashingEmbeddingClientTest {

    private final LocalHashingEmbeddingClient client = new LocalHashingEmbeddingClient(256);

    @Test
    void embedding_hasConfiguredDimensions() {
        assertThat(client.embed("wireless bluetooth headphones")).hasSize(256);
    }

    @Test
    void embedding_isDeterministic() {
        assertThat(client.embed("noise cancelling headphones"))
                .containsExactly(client.embed("noise cancelling headphones"));
    }

    @Test
    void blankText_returnsZeroVector() {
        float[] v = client.embed("   ");
        assertThat(v).hasSize(256);
        for (float f : v) {
            assertThat(f).isZero();
        }
    }

    @Test
    void relatedTextsScoreHigherThanUnrelated() {
        float[] headphones = client.embed("wireless noise cancelling over-ear headphones");
        float[] similar = client.embed("wireless headphones with noise cancelling");
        float[] unrelated = client.embed("stainless steel kitchen blender for smoothies");

        double relatedScore = CosineSimilarity.cosine(headphones, similar);
        double unrelatedScore = CosineSimilarity.cosine(headphones, unrelated);

        assertThat(relatedScore).isGreaterThan(unrelatedScore);
    }
}
