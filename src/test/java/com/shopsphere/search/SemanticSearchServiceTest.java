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
class SemanticSearchServiceTest {

    @Mock ProductRepository productRepository;
    @Mock ReviewRepository reviewRepository;

    EmbeddingCache cache;
    SemanticSearchService service;

    // Query embeds to [1,0,0]; cached vectors are ranked by cosine against it.
    private final EmbeddingClient fakeClient = new EmbeddingClient() {
        public float[] embed(String text) { return new float[]{1f, 0f, 0f}; }
        public String model() { return "fake"; }
    };

    @BeforeEach
    void setUp() {
        cache = new EmbeddingCache();
        service = new SemanticSearchService(fakeClient, cache, productRepository, reviewRepository);
        cache.put(1L, new float[]{1f, 0f, 0f});   // cosine 1.0  (closest)
        cache.put(2L, new float[]{0.6f, 0.8f, 0f}); // cosine 0.6  (middle)
        cache.put(3L, new float[]{0f, 1f, 0f});    // cosine 0.0  (farthest)
        when(reviewRepository.findAverageRatingByProductId(anyLong())).thenReturn(null);
    }

    private Product product(long id) {
        return Product.builder().id(id).name("P" + id).price(new BigDecimal("10.00")).stockQuantity(5).build();
    }

    @Test
    void search_ranksByCosine_andRespectsLimit() {
        when(productRepository.findAllById(any())).thenReturn(List.of(product(1L), product(2L)));

        List<ProductResponse> results = service.search("anything", 2);

        assertThat(results).extracting(ProductResponse::getId).containsExactly(1L, 2L);
    }

    @Test
    void search_blankQuery_returnsEmpty() {
        assertThat(service.search("   ", 10)).isEmpty();
    }

    @Test
    void search_emptyCache_returnsEmpty() {
        EmbeddingCache empty = new EmbeddingCache();
        SemanticSearchService svc = new SemanticSearchService(fakeClient, empty, productRepository, reviewRepository);
        assertThat(svc.search("phone", 10)).isEmpty();
    }
}
