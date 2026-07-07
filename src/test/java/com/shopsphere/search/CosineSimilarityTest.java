package com.shopsphere.search;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class CosineSimilarityTest {

    @Test
    void identicalVectors_returnOne() {
        float[] v = {1f, 2f, 3f};
        assertThat(CosineSimilarity.cosine(v, v)).isCloseTo(1.0, within(1e-9));
    }

    @Test
    void orthogonalVectors_returnZero() {
        assertThat(CosineSimilarity.cosine(new float[]{1f, 0f}, new float[]{0f, 1f}))
                .isCloseTo(0.0, within(1e-9));
    }

    @Test
    void oppositeVectors_returnMinusOne() {
        assertThat(CosineSimilarity.cosine(new float[]{1f, 0f}, new float[]{-1f, 0f}))
                .isCloseTo(-1.0, within(1e-9));
    }

    @Test
    void isSymmetric() {
        float[] a = {0.2f, 0.9f, -0.1f};
        float[] b = {0.5f, -0.3f, 0.8f};
        assertThat(CosineSimilarity.cosine(a, b)).isCloseTo(CosineSimilarity.cosine(b, a), within(1e-12));
    }

    @Test
    void mismatchedOrNullOrZero_returnZero() {
        assertThat(CosineSimilarity.cosine(new float[]{1f}, new float[]{1f, 2f})).isZero();
        assertThat(CosineSimilarity.cosine(null, new float[]{1f})).isZero();
        assertThat(CosineSimilarity.cosine(new float[]{0f, 0f}, new float[]{1f, 1f})).isZero();
    }
}
