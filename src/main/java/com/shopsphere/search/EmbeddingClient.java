package com.shopsphere.search;

/**
 * Produces a vector embedding for a piece of text. Implementations are selected at runtime
 * by the {@code app.embedding.provider} property (local | ollama | openai) — see the
 * @ConditionalOnProperty on each implementation. Exactly one bean is active.
 */
public interface EmbeddingClient {

    /** Embed the given text into a dense float vector. */
    float[] embed(String text);

    /** Identifier of the underlying model, stored alongside each embedding for traceability. */
    String model();
}
