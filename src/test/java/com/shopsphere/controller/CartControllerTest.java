package com.shopsphere.controller;

import com.shopsphere.exception.BadRequestException;
import com.shopsphere.security.CustomUserDetailsService;
import com.shopsphere.security.JwtService;
import com.shopsphere.security.SecurityConfig;
import com.shopsphere.service.CartService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(CartController.class)
@Import(SecurityConfig.class)
class CartControllerTest {

    @Autowired MockMvc mvc;

    @MockBean CartService cartService;
    @MockBean JwtService jwtService;
    @MockBean CustomUserDetailsService userDetailsService;

    @Test
    @WithMockUser
    void addToCart_quantityZero_returns400WithFieldErrors() throws Exception {
        String body = "{\"productId\":10,\"quantity\":0}"; // @Min(1) violation

        mvc.perform(post("/api/cart/add")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.fieldErrors.quantity").exists());
    }

    @Test
    @WithMockUser
    void addToCart_nullProductId_returns400() throws Exception {
        String body = "{\"quantity\":1}"; // productId omitted -> @NotNull violation

        mvc.perform(post("/api/cart/add")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.fieldErrors.productId").exists());
    }

    @Test
    @WithMockUser
    void addToCart_serviceRejectsStock_returns400() throws Exception {
        when(cartService.addToCart(any()))
                .thenThrow(new BadRequestException("Not enough stock for product: Headphones"));
        String body = "{\"productId\":10,\"quantity\":3}";

        mvc.perform(post("/api/cart/add")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Not enough stock for product: Headphones"));
    }

    @Test
    void addToCart_unauthenticated_returns401() throws Exception {
        String body = "{\"productId\":10,\"quantity\":1}";

        mvc.perform(post("/api/cart/add")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
    }
}
