package com.shopsphere.repository;

import com.shopsphere.entity.OrderItem;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    List<OrderItem> findByOrderId(Long orderId);

    @Modifying
    @Transactional
    @Query("UPDATE OrderItem oi SET oi.product = null WHERE oi.product.id = :productId")
    void disassociateProduct(@Param("productId") Long productId);

    // ----- Analytics (§ dashboard). Excludes CANCELLED orders and deleted (null) products. -----

    // Row: [Long productId, String productName, Long unitsSold, BigDecimal revenue]
    @Query("SELECT oi.product.id, oi.product.name, SUM(oi.quantity), SUM(oi.price * oi.quantity) "
            + "FROM OrderItem oi "
            + "WHERE oi.order.status <> com.shopsphere.entity.OrderStatus.CANCELLED "
            + "AND oi.product IS NOT NULL "
            + "AND oi.order.orderDate BETWEEN :start AND :end "
            + "GROUP BY oi.product.id, oi.product.name "
            + "ORDER BY SUM(oi.quantity) DESC")
    List<Object[]> topProductsByUnits(@Param("start") LocalDateTime start,
                                      @Param("end") LocalDateTime end, Pageable pageable);

    // Row: [Long productId, String productName, Long unitsSold, BigDecimal revenue]
    @Query("SELECT oi.product.id, oi.product.name, SUM(oi.quantity), SUM(oi.price * oi.quantity) "
            + "FROM OrderItem oi "
            + "WHERE oi.order.status <> com.shopsphere.entity.OrderStatus.CANCELLED "
            + "AND oi.product IS NOT NULL "
            + "AND oi.order.orderDate BETWEEN :start AND :end "
            + "GROUP BY oi.product.id, oi.product.name "
            + "ORDER BY SUM(oi.price * oi.quantity) DESC")
    List<Object[]> topProductsByRevenue(@Param("start") LocalDateTime start,
                                        @Param("end") LocalDateTime end, Pageable pageable);

    // Row: [String yyyy-MM, Long unitsSold, BigDecimal revenue]
    @Query("SELECT FUNCTION('DATE_FORMAT', oi.order.orderDate, '%Y-%m'), "
            + "SUM(oi.quantity), SUM(oi.price * oi.quantity) "
            + "FROM OrderItem oi "
            + "WHERE oi.product.id = :productId "
            + "AND oi.order.status <> com.shopsphere.entity.OrderStatus.CANCELLED "
            + "AND oi.order.orderDate BETWEEN :start AND :end "
            + "GROUP BY FUNCTION('DATE_FORMAT', oi.order.orderDate, '%Y-%m')")
    List<Object[]> productMonthlyTrend(@Param("productId") Long productId,
                                       @Param("start") LocalDateTime start,
                                       @Param("end") LocalDateTime end);
}
