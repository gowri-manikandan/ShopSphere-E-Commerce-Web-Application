package com.shopsphere.service;

import com.shopsphere.dto.AdminSearchResponse;
import com.shopsphere.entity.Order;
import com.shopsphere.entity.Product;
import com.shopsphere.entity.User;
import com.shopsphere.repository.OrderRepository;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Global admin search (§ dashboard): one query fanned out across products, orders (by customer
 * name or numeric id), and customers (name/email), each capped. {@code type} narrows the scope.
 */
@Service
public class AdminSearchService {

    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final UserRepository userRepository;

    public AdminSearchService(ProductRepository productRepository,
                              OrderRepository orderRepository,
                              UserRepository userRepository) {
        this.productRepository = productRepository;
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public AdminSearchResponse search(String q, String type, int limit) {
        AdminSearchResponse.AdminSearchResponseBuilder result = AdminSearchResponse.builder()
                .products(List.of()).orders(List.of()).customers(List.of());
        if (q == null || q.isBlank()) {
            return result.build();
        }
        String query = q.trim();
        int cap = Math.max(1, Math.min(limit, 50));
        Pageable page = PageRequest.of(0, cap);
        String scope = type == null || type.isBlank() ? "all" : type.toLowerCase();

        if (scope.equals("all") || scope.equals("products")) {
            result.products(productRepository.findByNameContainingIgnoreCase(query, page)
                    .getContent().stream().map(this::toProductHit).toList());
        }
        if (scope.equals("all") || scope.equals("customers")) {
            result.customers(userRepository
                    .findByNameContainingIgnoreCaseOrEmailContainingIgnoreCase(query, query, page)
                    .stream().map(this::toCustomerHit).toList());
        }
        if (scope.equals("all") || scope.equals("orders")) {
            result.orders(searchOrders(query, cap, page));
        }
        return result.build();
    }

    private List<AdminSearchResponse.OrderHit> searchOrders(String query, int cap, Pageable page) {
        // Dedup by order id, preserving insertion order (numeric-id hit first, then name matches).
        Map<Long, AdminSearchResponse.OrderHit> hits = new LinkedHashMap<>();
        if (query.matches("\\d+")) {
            orderRepository.findById(Long.parseLong(query))
                    .ifPresent(o -> hits.put(o.getId(), toOrderHit(o)));
        }
        for (Order o : orderRepository.findByUserNameContainingIgnoreCase(query, page)) {
            if (hits.size() >= cap) {
                break;
            }
            hits.putIfAbsent(o.getId(), toOrderHit(o));
        }
        return new ArrayList<>(hits.values());
    }

    private AdminSearchResponse.ProductHit toProductHit(Product p) {
        return AdminSearchResponse.ProductHit.builder()
                .id(p.getId()).name(p.getName()).price(p.getPrice())
                .stockQuantity(p.getStockQuantity()).build();
    }

    private AdminSearchResponse.CustomerHit toCustomerHit(User u) {
        return AdminSearchResponse.CustomerHit.builder()
                .id(u.getId()).name(u.getName()).email(u.getEmail()).build();
    }

    private AdminSearchResponse.OrderHit toOrderHit(Order o) {
        return AdminSearchResponse.OrderHit.builder()
                .orderId(o.getId())
                .customerName(o.getUser() != null ? o.getUser().getName() : null)
                .status(o.getStatus().name())
                .totalAmount(o.getTotalAmount())
                .orderDate(o.getOrderDate())
                .build();
    }
}
