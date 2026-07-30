package com.shopsphere.service;

import com.shopsphere.dto.ProductResponse;
import com.shopsphere.entity.Product;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductServiceTest {

    @Mock ProductRepository productRepository;
    @Mock CategoryRepository categoryRepository;
    @Mock ReviewRepository reviewRepository;
    @Mock CartItemRepository cartItemRepository;
    @Mock OrderItemRepository orderItemRepository;
    @Mock WishlistItemRepository wishlistItemRepository;
    @Mock ApplicationEventPublisher eventPublisher;

    ProductService productService;

    @BeforeEach
    void setUp() {
        productService = new ProductService(
                productRepository,
                categoryRepository,
                reviewRepository,
                cartItemRepository,
                orderItemRepository,
                wishlistItemRepository,
                eventPublisher
        );
    }

    @Test
    void delete_softDeletesProductAndEvictsCart() {
        Product p = Product.builder()
                .id(1L)
                .name("Widget")
                .price(new BigDecimal("10.00"))
                .stockQuantity(100)
                .deleted(false)
                .build();
        when(productRepository.findById(1L)).thenReturn(Optional.of(p));

        productService.delete(1L);

        assertThat(p.isDeleted()).isTrue();
        assertThat(p.getDeletedAt()).isNotNull();
        verify(productRepository).save(p);
        verify(cartItemRepository).deleteByProductId(1L);
        verify(reviewRepository, never()).deleteByProductId(any());
        verify(wishlistItemRepository, never()).deleteByProductId(any());
        verify(orderItemRepository, never()).disassociateProduct(any());
    }

    @Test
    void restore_restoresSoftDeletedProduct() {
        Product p = Product.builder()
                .id(1L)
                .name("Widget")
                .price(new BigDecimal("10.00"))
                .stockQuantity(100)
                .deleted(true)
                .deletedAt(java.time.LocalDateTime.now())
                .build();
        when(productRepository.findById(1L)).thenReturn(Optional.of(p));
        when(productRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        ProductResponse res = productService.restore(1L);

        assertThat(res.isDeleted()).isFalse();
        assertThat(p.isDeleted()).isFalse();
        assertThat(p.getDeletedAt()).isNull();
        verify(productRepository).save(p);
    }

    @Test
    void getById_throwsNotFoundIfSoftDeleted() {
        Product p = Product.builder()
                .id(1L)
                .name("Widget")
                .price(new BigDecimal("10.00"))
                .stockQuantity(100)
                .deleted(true)
                .build();
        when(productRepository.findById(1L)).thenReturn(Optional.of(p));

        assertThatThrownBy(() -> productService.getById(1L))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Product not found");
    }
}
