package com.shopsphere.repository;

import com.shopsphere.entity.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProductRepository extends JpaRepository<Product, Long> {

    List<Product> findByDeletedFalse();

    List<Product> findByDeletedTrue();

    List<Product> findByCategoryId(Long categoryId);

    List<Product> findByCategoryIdAndDeletedFalse(Long categoryId);

    Page<Product> findByCategoryId(Long categoryId, Pageable pageable);

    Page<Product> findByCategoryIdAndDeletedFalse(Long categoryId, Pageable pageable);

    List<Product> findByNameContainingIgnoreCase(String keyword);

    List<Product> findByNameContainingIgnoreCaseAndDeletedFalse(String keyword);

    Page<Product> findByNameContainingIgnoreCase(String keyword, Pageable pageable);

    Page<Product> findByNameContainingIgnoreCaseAndDeletedFalse(String keyword, Pageable pageable);

    // Low-stock alerts widget (§ dashboard): products at or below the threshold, neediest first.
    List<Product> findByStockQuantityLessThanEqualOrderByStockQuantityAsc(int threshold);

    List<Product> findByStockQuantityLessThanEqualAndDeletedFalseOrderByStockQuantityAsc(int threshold);
}
