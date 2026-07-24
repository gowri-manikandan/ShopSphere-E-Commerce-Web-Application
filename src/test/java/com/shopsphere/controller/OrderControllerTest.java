package com.shopsphere.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shopsphere.dto.CheckoutResponse;
import com.shopsphere.dto.OrderRequest;
import com.shopsphere.dto.OrderResponse;
import com.shopsphere.security.CustomUserDetailsService;
import com.shopsphere.security.JwtService;
import com.shopsphere.security.SecurityConfig;
import com.shopsphere.service.OrderService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(OrderController.class)
@Import(SecurityConfig.class)
class OrderControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

    @MockBean OrderService orderService;
    // Beans required to build the imported SecurityConfig / JwtAuthenticationFilter.
    @MockBean JwtService jwtService;
    @MockBean CustomUserDetailsService userDetailsService;

    private String validBody() throws Exception {
        OrderRequest r = new OrderRequest();
        r.setAddressId(5L);
        r.setPaymentMethod("CARD");
        return objectMapper.writeValueAsString(r);
    }

    @Test
    @WithMockUser
    void checkout_valid_returns200() throws Exception {
        when(orderService.checkout(any())).thenReturn(
                CheckoutResponse.builder()
                        .order(OrderResponse.builder().orderId(100L).status("PLACED")
                                .paymentStatus("PENDING").build())
                        .razorpayOrderId("order_test_123")
                        .razorpayKeyId("rzp_test_key")
                        .amountInPaise(20000L)
                        .currency("INR")
                        .build());

        mvc.perform(post("/api/orders/checkout")
                        .contentType(MediaType.APPLICATION_JSON).content(validBody()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.order.orderId").value(100))
                .andExpect(jsonPath("$.order.status").value("PLACED"))
                .andExpect(jsonPath("$.razorpayOrderId").value("order_test_123"));
    }

    @Test
    @WithMockUser
    void checkout_missingAddressId_returns400WithFieldErrors() throws Exception {
        String body = "{\"paymentMethod\":\"CARD\"}"; // addressId omitted -> @NotNull violation

        mvc.perform(post("/api/orders/checkout")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.addressId").exists());
    }

    @Test
    @WithMockUser
    void checkout_optimisticLockConflict_returns409() throws Exception {
        when(orderService.checkout(any()))
                .thenThrow(new ObjectOptimisticLockingFailureException("Product", 1L));

        mvc.perform(post("/api/orders/checkout")
                        .contentType(MediaType.APPLICATION_JSON).content(validBody()))
                .andExpect(status().isConflict());
    }

    @Test
    void checkout_unauthenticated_returns401() throws Exception {
        mvc.perform(post("/api/orders/checkout")
                        .contentType(MediaType.APPLICATION_JSON).content(validBody()))
                .andExpect(status().isUnauthorized());
    }
}
