package com.shopsphere.repository;

import com.shopsphere.entity.WishlistItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface WishlistItemRepository extends JpaRepository<WishlistItem, Long> {

    List<WishlistItem> findByUserIdOrderByAddedAtDesc(Long userId);

    boolean existsByUserIdAndProductId(Long userId, Long productId);

    @Query("SELECT w.product.id FROM WishlistItem w WHERE w.user.id = :userId")
    List<Long> findProductIdsByUserId(@Param("userId") Long userId);

    @Modifying
    @Transactional
    void deleteByUserIdAndProductId(Long userId, Long productId);

    // Called when a product is deleted (mirrors cart/review cleanup in ProductService.delete).
    @Modifying
    @Transactional
    void deleteByProductId(Long productId);
}
