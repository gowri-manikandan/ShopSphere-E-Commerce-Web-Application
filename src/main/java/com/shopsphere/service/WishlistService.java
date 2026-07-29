package com.shopsphere.service;

import com.shopsphere.dto.WishlistItemResponse;
import com.shopsphere.entity.Product;
import com.shopsphere.entity.User;
import com.shopsphere.entity.WishlistItem;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.mapper.WishlistMapper;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.repository.WishlistItemRepository;
import com.shopsphere.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class WishlistService {

    private final WishlistItemRepository wishlistItemRepository;
    private final ProductRepository productRepository;
    private final SecurityUtils securityUtils;

    @Transactional(readOnly = true)
    public List<WishlistItemResponse> getMyWishlist() {
        User user = securityUtils.getCurrentUser();
        return wishlistItemRepository.findByUserIdOrderByAddedAtDesc(user.getId()).stream()
                .map(WishlistMapper::toResponse)
                .toList();
    }

    /** Product ids in the current user's wishlist — used by the catalog to render heart states. */
    @Transactional(readOnly = true)
    public List<Long> getMyProductIds() {
        User user = securityUtils.getCurrentUser();
        return wishlistItemRepository.findProductIdsByUserId(user.getId());
    }

    /** Idempotent: adding a product already in the wishlist is a no-op. */
    @Transactional
    public void add(Long productId) {
        User user = securityUtils.getCurrentUser();
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + productId));
        if (wishlistItemRepository.existsByUserIdAndProductId(user.getId(), productId)) {
            return;
        }
        wishlistItemRepository.save(WishlistItem.builder().user(user).product(product).build());
    }

    @Transactional
    public void remove(Long productId) {
        User user = securityUtils.getCurrentUser();
        wishlistItemRepository.deleteByUserIdAndProductId(user.getId(), productId);
    }
}
