package com.shopsphere.search;

/** Raised when an embedding provider call fails. Embedding generation is async/best-effort,
 *  so callers log-and-continue rather than failing the triggering request. */
public class EmbeddingException extends RuntimeException {
    public EmbeddingException(String message) {
        super(message);
    }

    public EmbeddingException(String message, Throwable cause) {
        super(message, cause);
    }
}
