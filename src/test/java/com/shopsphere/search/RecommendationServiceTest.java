package com.shopsphere.search;

import com.shopsphere.dto.ProductResponse;
import com.shopsphere.entity.Product;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.repository.ReviewRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RecommendationServiceTest {

    @Mock ProductRepository productRepository;
    @Mock ReviewRepository reviewRepository;

    EmbeddingCache cache;
    RecommendationService service;

    @BeforeEach
    void setUp() {
        cache = new EmbeddingCache();
        service = new RecommendationService(cache, productRepository, reviewRepository);
        cache.put(1L, new float[]{1f, 0f, 0f});    // base product
        cache.put(2L, new float[]{0.9f, 0.1f, 0f}); // very similar, in stock
        cache.put(3L, new float[]{1f, 0f, 0f});     // most similar, but OUT OF STOCK
        cache.put(4L, new float[]{0f, 1f, 0f});     // dissimilar, in stock
        when(reviewRepository.findAverageRatingByProductId(anyLong())).thenReturn(null);
    }

    private Product product(long id, int stock) {
        return Product.builder().id(id).name("P" + id).price(new BigDecimal("10.00")).stockQuantity(stock).build();
    }

    @Test
    void recommend_excludesSelfAndOutOfStock_ordersBySimilarity() {
        when(productRepository.findAllById(any())).thenReturn(List.of(
                product(2L, 5), product(3L, 0), product(4L, 7)));

        List<ProductResponse> recs = service.recommend(1L, 5);

        // id3 is the closest but out of stock (excluded); self (id1) excluded; -> [2, 4]
        assertThat(recs).extracting(ProductResponse::getId).containsExactly(2L, 4L);
    }

    @Test
    void recommend_respectsLimit() {
        when(productRepository.findAllById(any())).thenReturn(List.of(
                product(2L, 5), product(3L, 9), product(4L, 7)));

        List<ProductResponse> recs = service.recommend(1L, 1);

        assertThat(recs).hasSize(1);
        assertThat(recs.get(0).getId()).isEqualTo(3L); // closest in-stock
    }

    @Test
    void recommend_unknownProduct_returnsEmpty() {
        assertThat(service.recommend(999L, 5)).isEmpty();
    }
}
