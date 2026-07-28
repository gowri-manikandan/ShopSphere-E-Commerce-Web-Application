package com.shopsphere.controller;

import com.shopsphere.dto.AdminSearchResponse;
import com.shopsphere.service.AdminSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Admin global search (§ dashboard). ADMIN-only. */
@RestController
@RequestMapping("/api/admin/search")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminSearchController {

    private final AdminSearchService searchService;

    @GetMapping
    public ResponseEntity<AdminSearchResponse> search(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "all") String type,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(searchService.search(q, type, limit));
    }
}
