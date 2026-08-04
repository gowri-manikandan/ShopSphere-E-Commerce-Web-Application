package com.shopsphere.service;

import com.shopsphere.dto.CategoryRequest;
import com.shopsphere.dto.CategoryResponse;
import com.shopsphere.entity.Category;
import com.shopsphere.entity.Product;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.mapper.CategoryMapper;
import com.shopsphere.repository.CategoryRepository;
import com.shopsphere.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;

    public List<CategoryResponse> getAll() {
        return categoryRepository.findAll().stream()
                .map(CategoryMapper::toResponse)
                .toList();
    }

    public CategoryResponse getById(Long id) {
        Category category = findCategory(id);
        return CategoryMapper.toResponse(category);
    }

    public CategoryResponse create(CategoryRequest request) {
        if (categoryRepository.existsByName(request.getName())) {
            throw new BadRequestException("Category already exists: " + request.getName());
        }
        Category category = Category.builder()
                .name(request.getName())
                .description(request.getDescription())
                .build();
        return CategoryMapper.toResponse(categoryRepository.save(category));
    }

    public CategoryResponse update(Long id, CategoryRequest request) {
        Category category = findCategory(id);
        category.setName(request.getName());
        category.setDescription(request.getDescription());
        return CategoryMapper.toResponse(categoryRepository.save(category));
    }

    @org.springframework.transaction.annotation.Transactional
    public void delete(Long id) {
        Category category = findCategory(id);

        // Find or create "Uncategorized" category
        Category uncategorized = categoryRepository.findByName("Uncategorized")
                .orElseGet(() -> categoryRepository.save(Category.builder()
                        .name("Uncategorized")
                        .description("Default category for products whose category was deleted")
                        .build()));

        // Check if we are trying to delete the Uncategorized category itself
        if (category.getId().equals(uncategorized.getId())) {
            throw new BadRequestException("The Uncategorized category cannot be deleted.");
        }

        // Reassign all products belonging to this category to Uncategorized
        List<Product> products = productRepository.findByCategoryId(id);
        for (Product product : products) {
            product.setCategory(uncategorized);
            productRepository.save(product);
        }

        categoryRepository.delete(category);
    }

    private Category findCategory(Long id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found with id: " + id));
    }
}
