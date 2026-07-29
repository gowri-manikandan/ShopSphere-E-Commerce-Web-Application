package com.shopsphere.service;

import com.shopsphere.entity.Product;
import com.shopsphere.entity.User;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.repository.WishlistItemRepository;
import com.shopsphere.security.SecurityUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WishlistServiceTest {

    @Mock WishlistItemRepository wishlistItemRepository;
    @Mock ProductRepository productRepository;
    @Mock SecurityUtils securityUtils;

    WishlistService wishlistService;

    private final User user = User.builder().id(1L).email("u@x.com").name("U").build();

    @BeforeEach
    void setUp() {
        wishlistService = new WishlistService(wishlistItemRepository, productRepository, securityUtils);
    }

    private Product product(long id) {
        return Product.builder().id(id).name("P").price(new BigDecimal("10.00")).stockQuantity(5).build();
    }

    @Test
    void add_newProduct_savesWishlistItem() {
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(productRepository.findById(10L)).thenReturn(Optional.of(product(10L)));
        when(wishlistItemRepository.existsByUserIdAndProductId(1L, 10L)).thenReturn(false);

        wishlistService.add(10L);

        verify(wishlistItemRepository).save(any());
    }

    @Test
    void add_alreadyPresent_isNoOp() {
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(productRepository.findById(10L)).thenReturn(Optional.of(product(10L)));
        when(wishlistItemRepository.existsByUserIdAndProductId(1L, 10L)).thenReturn(true);

        wishlistService.add(10L);

        verify(wishlistItemRepository, never()).save(any());
    }

    @Test
    void add_productNotFound_throws() {
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(productRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> wishlistService.add(99L))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(wishlistItemRepository, never()).save(any());
    }

    @Test
    void remove_deletesByUserAndProduct() {
        when(securityUtils.getCurrentUser()).thenReturn(user);

        wishlistService.remove(10L);

        verify(wishlistItemRepository).deleteByUserIdAndProductId(1L, 10L);
    }
}
