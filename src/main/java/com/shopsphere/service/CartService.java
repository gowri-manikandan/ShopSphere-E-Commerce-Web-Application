package com.shopsphere.service;

import com.shopsphere.dto.CartItemRequest;
import com.shopsphere.dto.CartItemResponse;
import com.shopsphere.dto.CartResponse;
import com.shopsphere.entity.CartItem;
import com.shopsphere.entity.Product;
import com.shopsphere.entity.User;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.repository.CartItemRepository;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CartService {

    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final SecurityUtils securityUtils;

    @Transactional(readOnly = true)
    public CartResponse getCart() {
        User user = securityUtils.getCurrentUser();
        List<CartItem> items = cartItemRepository.findByUserId(user.getId());
        return buildCartResponse(items);
    }

    @Transactional
    public CartResponse addToCart(CartItemRequest request) {
        User user = securityUtils.getCurrentUser();
        Product product = productRepository.findById(request.getProductId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Product not found with id: " + request.getProductId()));

        if (product.getStockQuantity() < request.getQuantity()) {
            throw new BadRequestException("Not enough stock for product: " + product.getName());
        }

        CartItem cartItem = cartItemRepository
                .findByUserIdAndProductId(user.getId(), product.getId())
                .orElse(CartItem.builder()
                        .user(user)
                        .product(product)
                        .quantity(0)
                        .build());

        cartItem.setQuantity(cartItem.getQuantity() + request.getQuantity());
        cartItemRepository.save(cartItem);

        return getCart();
    }

    @Transactional
    public CartResponse updateQuantity(CartItemRequest request) {
        User user = securityUtils.getCurrentUser();
        CartItem cartItem = cartItemRepository
                .findByUserIdAndProductId(user.getId(), request.getProductId())
                .orElseThrow(() -> new ResourceNotFoundException("Item not in cart"));

        if (cartItem.getProduct().getStockQuantity() < request.getQuantity()) {
            throw new BadRequestException("Not enough stock for product: "
                    + cartItem.getProduct().getName());
        }

        cartItem.setQuantity(request.getQuantity());
        cartItemRepository.save(cartItem);
        return getCart();
    }

    @Transactional
    public CartResponse removeFromCart(Long productId) {
        User user = securityUtils.getCurrentUser();
        CartItem cartItem = cartItemRepository
                .findByUserIdAndProductId(user.getId(), productId)
                .orElseThrow(() -> new ResourceNotFoundException("Item not in cart"));
        cartItemRepository.delete(cartItem);
        return getCart();
    }

    @Transactional
    public void clearCart() {
        User user = securityUtils.getCurrentUser();
        cartItemRepository.deleteByUserId(user.getId());
    }

    // ---- helpers ----

    private CartResponse buildCartResponse(List<CartItem> items) {
        List<CartItemResponse> itemResponses = items.stream()
                .map(this::toItemResponse)
                .toList();

        BigDecimal grandTotal = itemResponses.stream()
                .map(CartItemResponse::getSubtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        int totalItems = items.stream().mapToInt(CartItem::getQuantity).sum();

        return CartResponse.builder()
                .items(itemResponses)
                .grandTotal(grandTotal)
                .totalItems(totalItems)
                .build();
    }

    private CartItemResponse toItemResponse(CartItem item) {
        BigDecimal price = item.getProduct().getPrice();
        BigDecimal subtotal = price.multiply(BigDecimal.valueOf(item.getQuantity()));
        return CartItemResponse.builder()
                .cartItemId(item.getId())
                .productId(item.getProduct().getId())
                .productName(item.getProduct().getName())
                .imageUrl(item.getProduct().getImageUrl())
                .price(price)
                .quantity(item.getQuantity())
                .subtotal(subtotal)
                .build();
    }
}
