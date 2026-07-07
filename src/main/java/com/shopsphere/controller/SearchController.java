package com.shopsphere.controller;

import com.shopsphere.dto.ProductResponse;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.search.SemanticSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * AI semantic search (CLAUDE.md §6). Public, like product browsing. Free-text query in,
 * semantically nearest products out — this also serves as the "Ask AI" natural-language finder.
 */
@RestController
@RequestMapping("/api/search")
@RequiredArgsConstructor
public class SearchController {

    private final SemanticSearchService semanticSearchService;

    @GetMapping("/semantic")
    public ResponseEntity<List<ProductResponse>> semantic(
            @RequestParam(value = "q", required = false) String q,
            @RequestParam(defaultValue = "10") int limit) {
        if (q == null || q.isBlank()) {
            throw new BadRequestException("Query parameter 'q' must not be blank");
        }
        return ResponseEntity.ok(semanticSearchService.search(q, limit));
    }
}
