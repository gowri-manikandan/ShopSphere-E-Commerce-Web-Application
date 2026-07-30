package com.shopsphere.search;

import com.shopsphere.dto.ProductResponse;
import com.shopsphere.entity.Product;
import com.shopsphere.mapper.ProductMapper;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Semantic search: embed the free-text query, rank cached product vectors by cosine similarity,
 * and return the top matches. This endpoint doubles as §6's "Ask AI" natural-language finder.
 */
@Service
@RequiredArgsConstructor
public class SemanticSearchService {

    private static final int DEFAULT_LIMIT = 10;
    private static final int MAX_LIMIT = 50;

    private final EmbeddingClient embeddingClient;
    private final EmbeddingCache cache;
    private final ProductRepository productRepository;
    private final ReviewRepository reviewRepository;

    @Transactional(readOnly = true)
    public List<ProductResponse> search(String query, int limit) {
        if (query == null || query.isBlank() || cache.size() == 0) {
            return List.of();
        }
        float[] queryVector = embeddingClient.embed(query);

        List<Long> rankedIds = cache.entries().stream()
                .map(e -> Map.entry(e.getKey(), CosineSimilarity.cosine(queryVector, e.getValue())))
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .limit(clampLimit(limit))
                .map(Map.Entry::getKey)
                .toList();

        return loadInOrder(rankedIds);
    }

    private List<ProductResponse> loadInOrder(List<Long> orderedIds) {
        Map<Long, Product> byId = productRepository.findAllById(orderedIds).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        List<ProductResponse> out = new ArrayList<>();
        for (Long id : orderedIds) {
            Product p = byId.get(id);
            if (p != null && !p.isDeleted()) {
                out.add(ProductMapper.toResponse(p, reviewRepository.findAverageRatingByProductId(id)));
            }
        }
        return out;
    }

    static int clampLimit(int limit) {
        if (limit < 1) {
            return DEFAULT_LIMIT;
        }
        return Math.min(limit, MAX_LIMIT);
    }
}
