package com.shopsphere.search;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * Embeddings via a local Ollama server (default nomic-embed-text). Uses the JDK HttpClient
 * (no extra dependency) against localhost HTTP, so it sidesteps the JVM-truststore/proxy
 * issues that would affect external HTTPS on this machine.
 */
@Component
@ConditionalOnProperty(name = "app.embedding.provider", havingValue = "ollama")
public class OllamaEmbeddingClient implements EmbeddingClient {

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String model;

    public OllamaEmbeddingClient(ObjectMapper objectMapper,
                                 @Value("${app.embedding.ollama.base-url:http://localhost:11434}") String baseUrl,
                                 @Value("${app.embedding.ollama.model:nomic-embed-text}") String model) {
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
        this.model = model;
    }

    @Override
    public float[] embed(String text) {
        try {
            String body = objectMapper.writeValueAsString(Map.of("model", model, "prompt", text == null ? "" : text));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/embeddings"))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new EmbeddingException("Ollama returned HTTP " + response.statusCode() + ": " + response.body());
            }
            JsonNode arr = objectMapper.readTree(response.body()).path("embedding");
            return EmbeddingJson.toFloatArray(arr);
        } catch (EmbeddingException e) {
            throw e;
        } catch (Exception e) {
            throw new EmbeddingException("Ollama embedding call failed: " + e.getMessage(), e);
        }
    }

    @Override
    public String model() {
        return "ollama:" + model;
    }
}
