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
 * "Customers also viewed" style recommendations: nearest neighbors of a product's embedding
 * by cosine similarity, excluding the product itself and any out-of-stock items (§6).
 */
@Service
@RequiredArgsConstructor
public class RecommendationService {

    private static final int DEFAULT_LIMIT = 5;
    private static final int MAX_LIMIT = 50;

    private final EmbeddingCache cache;
    private final ProductRepository productRepository;
    private final ReviewRepository reviewRepository;

    @Transactional(readOnly = true)
    public List<ProductResponse> recommend(Long productId, int limit) {
        float[] base = cache.get(productId);
        if (base == null) {
            return List.of();
        }
        // Rank all other products by similarity to the base vector.
        List<Long> rankedIds = cache.entries().stream()
                .filter(e -> !e.getKey().equals(productId))
                .map(e -> Map.entry(e.getKey(), CosineSimilarity.cosine(base, e.getValue())))
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .map(Map.Entry::getKey)
                .toList();

        Map<Long, Product> byId = productRepository.findAllById(rankedIds).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));

        int cap = clampLimit(limit);
        List<ProductResponse> out = new ArrayList<>();
        for (Long id : rankedIds) {
            if (out.size() >= cap) {
                break;
            }
            Product p = byId.get(id);
            if (p != null && !p.isDeleted() && p.getStockQuantity() != null && p.getStockQuantity() > 0) {
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
