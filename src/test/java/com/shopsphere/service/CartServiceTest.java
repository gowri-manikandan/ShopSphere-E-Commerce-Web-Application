package com.shopsphere.service;

import com.shopsphere.dto.CartItemRequest;
import com.shopsphere.dto.CartResponse;
import com.shopsphere.entity.CartItem;
import com.shopsphere.entity.Product;
import com.shopsphere.entity.User;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.repository.CartItemRepository;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.security.SecurityUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CartServiceTest {

    @Mock CartItemRepository cartItemRepository;
    @Mock ProductRepository productRepository;
    @Mock SecurityUtils securityUtils;

    CartService cartService;

    private User user;

    @BeforeEach
    void setUp() {
        cartService = new CartService(cartItemRepository, productRepository, securityUtils);
        user = User.builder().id(1L).email("buyer@shopsphere.com").name("Buyer").build();
    }

    private Product product(long id, String name, String price, int stock) {
        return Product.builder()
                .id(id).name(name).price(new BigDecimal(price)).stockQuantity(stock)
                .build();
    }

    private CartItemRequest request(long productId, int qty) {
        CartItemRequest r = new CartItemRequest();
        r.setProductId(productId);
        r.setQuantity(qty);
        return r;
    }

    @Test
    void addToCart_newItem_setsQuantityAndReturnsCart() {
        Product p = product(10L, "Headphones", "2499.00", 50);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(productRepository.findById(10L)).thenReturn(Optional.of(p));
        when(cartItemRepository.findByUserIdAndProductId(1L, 10L)).thenReturn(Optional.empty());
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of(
                CartItem.builder().id(1L).user(user).product(p).quantity(3).build()));

        CartResponse response = cartService.addToCart(request(10L, 3));

        ArgumentCaptor<CartItem> saved = ArgumentCaptor.forClass(CartItem.class);
        verify(cartItemRepository).save(saved.capture());
        assertThat(saved.getValue().getQuantity()).isEqualTo(3);
        assertThat(response.getTotalItems()).isEqualTo(3);
        assertThat(response.getGrandTotal()).isEqualByComparingTo("7497.00");
    }

    @Test
    void addToCart_existingItem_accumulatesQuantity() {
        Product p = product(10L, "Headphones", "2499.00", 50);
        CartItem existing = CartItem.builder().id(1L).user(user).product(p).quantity(2).build();
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(productRepository.findById(10L)).thenReturn(Optional.of(p));
        when(cartItemRepository.findByUserIdAndProductId(1L, 10L)).thenReturn(Optional.of(existing));
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of(existing));

        cartService.addToCart(request(10L, 3));

        ArgumentCaptor<CartItem> saved = ArgumentCaptor.forClass(CartItem.class);
        verify(cartItemRepository).save(saved.capture());
        assertThat(saved.getValue().getQuantity()).isEqualTo(5); // 2 + 3
    }

    @Test
    void addToCart_insufficientStock_throwsAndDoesNotSave() {
        Product p = product(10L, "Headphones", "2499.00", 1);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(productRepository.findById(10L)).thenReturn(Optional.of(p));

        assertThatThrownBy(() -> cartService.addToCart(request(10L, 5)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Not enough stock");

        verify(cartItemRepository, never()).save(any());
    }

    @Test
    void addToCart_productNotFound_throwsResourceNotFound() {
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(productRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> cartService.addToCart(request(99L, 1)))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(cartItemRepository, never()).save(any());
    }

    @Test
    void updateQuantity_insufficientStock_throws() {
        Product p = product(10L, "Headphones", "2499.00", 2);
        CartItem existing = CartItem.builder().id(1L).user(user).product(p).quantity(1).build();
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserIdAndProductId(1L, 10L)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> cartService.updateQuantity(request(10L, 5)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Not enough stock");

        verify(cartItemRepository, never()).save(any());
    }

    @Test
    void updateQuantity_itemNotInCart_throwsResourceNotFound() {
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserIdAndProductId(1L, 10L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> cartService.updateQuantity(request(10L, 1)))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void removeFromCart_itemNotInCart_throwsResourceNotFound() {
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserIdAndProductId(1L, 10L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> cartService.removeFromCart(10L))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(cartItemRepository, never()).delete(any());
    }

    @Test
    void getCart_computesGrandTotalAndItemCount() {
        Product a = product(10L, "Headphones", "2499.00", 50);
        Product b = product(11L, "T-Shirt", "499.00", 100);
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(cartItemRepository.findByUserId(1L)).thenReturn(List.of(
                CartItem.builder().id(1L).user(user).product(a).quantity(2).build(),
                CartItem.builder().id(2L).user(user).product(b).quantity(3).build()));

        CartResponse response = cartService.getCart();

        assertThat(response.getTotalItems()).isEqualTo(5); // 2 + 3
        // (2499 * 2) + (499 * 3) = 4998 + 1497 = 6495
        assertThat(response.getGrandTotal()).isEqualByComparingTo("6495.00");
        assertThat(response.getItems()).hasSize(2);
    }
}
