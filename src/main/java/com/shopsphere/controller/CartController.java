package com.shopsphere.controller;

import com.shopsphere.dto.ApiMessage;
import com.shopsphere.dto.CartItemRequest;
import com.shopsphere.dto.CartResponse;
import com.shopsphere.service.CartService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/cart")
@RequiredArgsConstructor
public class CartController {

    private final CartService cartService;

    @GetMapping
    public ResponseEntity<CartResponse> getCart() {
        return ResponseEntity.ok(cartService.getCart());
    }

    @PostMapping("/add")
    public ResponseEntity<CartResponse> addToCart(@Valid @RequestBody CartItemRequest request) {
        return ResponseEntity.ok(cartService.addToCart(request));
    }

    @PutMapping("/update")
    public ResponseEntity<CartResponse> updateQuantity(@Valid @RequestBody CartItemRequest request) {
        return ResponseEntity.ok(cartService.updateQuantity(request));
    }

    @DeleteMapping("/remove/{productId}")
    public ResponseEntity<CartResponse> removeFromCart(@PathVariable Long productId) {
        return ResponseEntity.ok(cartService.removeFromCart(productId));
    }

    @DeleteMapping("/clear")
    public ResponseEntity<ApiMessage> clearCart() {
        cartService.clearCart();
        return ResponseEntity.ok(new ApiMessage("Cart cleared"));
    }
}
