package com.shopsphere.repository;

import com.shopsphere.entity.OrderItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    List<OrderItem> findByOrderId(Long orderId);

    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Query("UPDATE OrderItem oi SET oi.product = null WHERE oi.product.id = :productId")
    void disassociateProduct(@org.springframework.data.repository.query.Param("productId") Long productId);
}
