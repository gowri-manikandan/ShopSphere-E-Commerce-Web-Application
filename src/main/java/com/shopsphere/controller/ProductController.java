package com.shopsphere.controller;

import com.shopsphere.dto.ApiMessage;
import com.shopsphere.dto.ProductRequest;
import com.shopsphere.dto.ProductResponse;
import com.shopsphere.search.RecommendationService;
import com.shopsphere.service.ProductService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;
    private final RecommendationService recommendationService;

    // Public: list / filter / search
    @GetMapping
    public ResponseEntity<List<ProductResponse>> getProducts(
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String search) {

        if (search != null && !search.isBlank()) {
            return ResponseEntity.ok(productService.search(search));
        }
        if (categoryId != null) {
            return ResponseEntity.ok(productService.getByCategory(categoryId));
        }
        return ResponseEntity.ok(productService.getAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProductResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(productService.getById(id));
    }

    // Public: AI recommendations — nearest products by embedding, excluding out-of-stock (§6)
    @GetMapping("/{id}/recommendations")
    public ResponseEntity<List<ProductResponse>> recommendations(
            @PathVariable Long id,
            @RequestParam(defaultValue = "5") int limit) {
        return ResponseEntity.ok(recommendationService.recommend(id, limit));
    }

    // Admin only (enforced in SecurityConfig)
    @PostMapping
    public ResponseEntity<ProductResponse> create(@Valid @RequestBody ProductRequest request) {
        return ResponseEntity.ok(productService.create(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ProductResponse> update(@PathVariable Long id,
                                                  @Valid @RequestBody ProductRequest request) {
        return ResponseEntity.ok(productService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiMessage> delete(@PathVariable Long id) {
        productService.delete(id);
        return ResponseEntity.ok(new ApiMessage("Product deleted successfully"));
    }
}
