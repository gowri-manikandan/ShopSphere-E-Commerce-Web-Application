package com.shopsphere.service;

import com.shopsphere.dto.ProductRequest;
import com.shopsphere.dto.ProductResponse;
import com.shopsphere.entity.Category;
import com.shopsphere.entity.Product;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.mapper.ProductMapper;
import com.shopsphere.repository.CategoryRepository;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.repository.ReviewRepository;
import com.shopsphere.repository.CartItemRepository;
import com.shopsphere.repository.OrderItemRepository;
import com.shopsphere.realtime.StockChangedEvent;
import com.shopsphere.search.ProductChangedEvent;
import com.shopsphere.search.ProductDeletedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final ReviewRepository reviewRepository;
    private final CartItemRepository cartItemRepository;
    private final OrderItemRepository orderItemRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public List<ProductResponse> getAll() {
        return productRepository.findAll().stream()
                .map(this::toResponseWithRating)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> getByCategory(Long categoryId) {
        return productRepository.findByCategoryId(categoryId).stream()
                .map(this::toResponseWithRating)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> search(String keyword) {
        return productRepository.findByNameContainingIgnoreCase(keyword).stream()
                .map(this::toResponseWithRating)
                .toList();
    }

    @Transactional(readOnly = true)
    public ProductResponse getById(Long id) {
        return toResponseWithRating(findProduct(id));
    }

    @Transactional
    public ProductResponse create(ProductRequest request) {
        Category category = findCategory(request.getCategoryId());
        Product product = Product.builder()
                .name(request.getName())
                .description(request.getDescription())
                .price(request.getPrice())
                .stockQuantity(request.getStockQuantity())
                .imageUrl(request.getImageUrl())
                .category(category)
                .additionalImages(request.getAdditionalImages() != null ? request.getAdditionalImages() : new java.util.ArrayList<>())
                .build();
        Product saved = productRepository.save(product);
        // Embedding generated after commit, off-thread (see EmbeddingService).
        eventPublisher.publishEvent(new ProductChangedEvent(saved.getId()));
        return toResponseWithRating(saved);
    }

    @Transactional
    public ProductResponse update(Long id, ProductRequest request) {
        Product product = findProduct(id);
        Category category = findCategory(request.getCategoryId());

        product.setName(request.getName());
        product.setDescription(request.getDescription());
        product.setPrice(request.getPrice());
        product.setStockQuantity(request.getStockQuantity());
        product.setImageUrl(request.getImageUrl());
        product.setCategory(category);
        
        if (request.getAdditionalImages() != null) {
            product.getAdditionalImages().clear();
            product.getAdditionalImages().addAll(request.getAdditionalImages());
        }

        Product saved = productRepository.save(product);
        eventPublisher.publishEvent(new ProductChangedEvent(saved.getId()));
        // Admin edits may change stockQuantity — broadcast the committed level (§5)
        eventPublisher.publishEvent(new StockChangedEvent(saved.getId()));
        return toResponseWithRating(saved);
    }

    @Transactional
    public void delete(Long id) {
        Product product = findProduct(id);

        // Delete related cart items
        cartItemRepository.deleteByProductId(id);

        // Delete related reviews
        reviewRepository.deleteByProductId(id);

        // Disassociate related order items
        orderItemRepository.disassociateProduct(id);

        // Delete product (product_embeddings row cascades via FK)
        productRepository.delete(product);
        eventPublisher.publishEvent(new ProductDeletedEvent(id));
    }

    // ---- helpers ----

    private ProductResponse toResponseWithRating(Product product) {
        Double avg = reviewRepository.findAverageRatingByProductId(product.getId());
        return ProductMapper.toResponse(product, avg);
    }

    private Product findProduct(Long id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + id));
    }

    private Category findCategory(Long id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found with id: " + id));
    }
}
