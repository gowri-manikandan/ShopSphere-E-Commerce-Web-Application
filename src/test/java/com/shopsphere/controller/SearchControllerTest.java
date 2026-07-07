package com.shopsphere.controller;

import com.shopsphere.dto.ProductResponse;
import com.shopsphere.search.SemanticSearchService;
import com.shopsphere.security.CustomUserDetailsService;
import com.shopsphere.security.JwtService;
import com.shopsphere.security.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SearchController.class)
@Import(SecurityConfig.class)
class SearchControllerTest {

    @Autowired MockMvc mvc;

    @MockBean SemanticSearchService semanticSearchService;
    @MockBean JwtService jwtService;
    @MockBean CustomUserDetailsService userDetailsService;

    @Test
    void semantic_returnsResults_publicNoAuth() throws Exception {
        when(semanticSearchService.search(eq("phone"), anyInt()))
                .thenReturn(List.of(ProductResponse.builder().id(1L).name("Smartphone X").build()));

        mvc.perform(get("/api/search/semantic").param("q", "phone"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].name").value("Smartphone X"));
    }

    @Test
    void semantic_blankQuery_returns400() throws Exception {
        mvc.perform(get("/api/search/semantic").param("q", "   "))
                .andExpect(status().isBadRequest());
    }

    @Test
    void semantic_missingQuery_returns400() throws Exception {
        mvc.perform(get("/api/search/semantic"))
                .andExpect(status().isBadRequest());
    }
}
