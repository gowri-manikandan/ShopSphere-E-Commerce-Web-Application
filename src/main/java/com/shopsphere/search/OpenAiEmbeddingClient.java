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
 * Embeddings via OpenAI's /embeddings endpoint (default text-embedding-3-small). Uses the JDK
 * HttpClient (no extra dependency). NOTE: external HTTPS uses the JVM truststore — on a machine
 * whose corporate proxy CA is not in cacerts this will fail with a PKIX error; prefer local/ollama
 * there. Requires app.embedding.openai.api-key.
 */
@Component
@ConditionalOnProperty(name = "app.embedding.provider", havingValue = "openai")
public class OpenAiEmbeddingClient implements EmbeddingClient {

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String model;
    private final String apiKey;

    public OpenAiEmbeddingClient(ObjectMapper objectMapper,
                                 @Value("${app.embedding.openai.base-url:https://api.openai.com/v1}") String baseUrl,
                                 @Value("${app.embedding.openai.model:text-embedding-3-small}") String model,
                                 @Value("${app.embedding.openai.api-key:}") String apiKey) {
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
        this.model = model;
        this.apiKey = apiKey;
    }

    @Override
    public float[] embed(String text) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new EmbeddingException("OpenAI provider selected but app.embedding.openai.api-key is not set");
        }
        try {
            String body = objectMapper.writeValueAsString(Map.of("model", model, "input", text == null ? "" : text));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/embeddings"))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new EmbeddingException("OpenAI returned HTTP " + response.statusCode() + ": " + response.body());
            }
            JsonNode arr = objectMapper.readTree(response.body()).path("data").path(0).path("embedding");
            return EmbeddingJson.toFloatArray(arr);
        } catch (EmbeddingException e) {
            throw e;
        } catch (Exception e) {
            throw new EmbeddingException("OpenAI embedding call failed: " + e.getMessage(), e);
        }
    }

    @Override
    public String model() {
        return "openai:" + model;
    }
}
