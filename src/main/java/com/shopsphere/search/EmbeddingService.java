package com.shopsphere.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shopsphere.entity.Product;
import com.shopsphere.entity.ProductEmbedding;
import com.shopsphere.repository.ProductEmbeddingRepository;
import com.shopsphere.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Generates and stores product embeddings, and keeps the in-memory cache current.
 *
 * Generation runs AFTER_COMMIT and @Async so we never call an embedding provider while a
 * product transaction is open (CLAUDE.md §15) and never block the create/update request.
 * A transaction is always active around {@link #doGenerate} (either the listener's
 * REQUIRES_NEW tx or the warmup tx) so the product's lazy category can be read.
 */
@Service
@RequiredArgsConstructor
public class EmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);

    private final EmbeddingClient embeddingClient;
    private final ProductEmbeddingRepository embeddingRepository;
    private final ProductRepository productRepository;
    private final EmbeddingCache cache;
    private final ObjectMapper objectMapper;

    @Value("${app.embedding.enabled:true}")
    private boolean enabled;

    // ---- event-driven regeneration ----

    @Async("embeddingExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onProductChanged(ProductChangedEvent event) {
        doGenerate(event.productId());
    }

    @Async("embeddingExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onProductDeleted(ProductDeletedEvent event) {
        // DB row is removed by ON DELETE CASCADE; just drop the cached vector.
        cache.evict(event.productId());
    }

    // ---- startup warmup + backfill ----

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void warmCacheAndBackfill() {
        if (!enabled) {
            log.info("Embeddings disabled (app.embedding.enabled=false); skipping warmup");
            return;
        }
        // 1) Warm the cache from stored embeddings.
        for (ProductEmbedding pe : embeddingRepository.findAll()) {
            try {
                cache.put(pe.getProductId(), objectMapper.readValue(pe.getEmbedding(), float[].class));
            } catch (Exception e) {
                log.warn("Could not load embedding for product {}: {}", pe.getProductId(), e.getMessage());
            }
        }
        log.info("Embedding cache warmed with {} vectors", cache.size());

        // 2) Backfill products that have no embedding yet (e.g. seeded demo data).
        int backfilled = 0;
        for (Product product : productRepository.findAll()) {
            if (!cache.contains(product.getId())) {
                doGenerate(product.getId());
                backfilled++;
            }
        }
        if (backfilled > 0) {
            log.info("Backfilled embeddings for {} products", backfilled);
        }
    }

    // ---- core (always runs inside a caller-provided transaction) ----

    /** Best-effort: logs and returns on failure rather than propagating. */
    void doGenerate(Long productId) {
        if (!enabled) {
            return;
        }
        try {
            Product product = productRepository.findById(productId).orElse(null);
            if (product == null) {
                cache.evict(productId);
                return;
            }
            float[] vector = embeddingClient.embed(buildText(product));
            ProductEmbedding entity = embeddingRepository.findById(productId)
                    .orElseGet(ProductEmbedding::new);
            entity.setProductId(productId);
            entity.setEmbedding(objectMapper.writeValueAsString(vector));
            entity.setModel(embeddingClient.model());
            entity.setDimensions(vector.length);
            embeddingRepository.save(entity);
            cache.put(productId, vector);
            log.info("Embedding generated for product {} ({} dims, model {})",
                    productId, vector.length, embeddingClient.model());
        } catch (Exception e) {
            log.warn("Embedding generation failed for product {}: {}", productId, e.getMessage());
        }
    }

    /** The text an embedding is computed from: name + description + category (no tags field exists). */
    String buildText(Product product) {
        StringBuilder sb = new StringBuilder();
        if (product.getName() != null) {
            sb.append(product.getName()).append(' ');
        }
        if (product.getDescription() != null) {
            sb.append(product.getDescription()).append(' ');
        }
        if (product.getCategory() != null && product.getCategory().getName() != null) {
            sb.append(product.getCategory().getName());
        }
        return sb.toString().trim();
    }
}
