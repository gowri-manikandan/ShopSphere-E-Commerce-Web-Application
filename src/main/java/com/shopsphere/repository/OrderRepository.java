package com.shopsphere.repository;

import com.shopsphere.entity.Order;
import com.shopsphere.entity.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public interface OrderRepository extends JpaRepository<Order, Long> {

    List<Order> findByUserIdOrderByOrderDateDesc(Long userId);

    List<Order> findByStatus(OrderStatus status);

    List<Order> findAllByOrderByOrderDateDesc();

    @Query("SELECT COALESCE(SUM(o.totalAmount), 0) FROM Order o WHERE o.status <> com.shopsphere.entity.OrderStatus.CANCELLED")
    BigDecimal calculateTotalRevenue();

    // ----- Analytics (§ dashboard). Revenue everywhere excludes CANCELLED orders. -----

    @Query("SELECT COALESCE(SUM(o.totalAmount), 0) FROM Order o "
            + "WHERE o.status <> com.shopsphere.entity.OrderStatus.CANCELLED "
            + "AND o.orderDate BETWEEN :start AND :end")
    BigDecimal revenueBetween(LocalDateTime start, LocalDateTime end);

    long countByStatusNotAndOrderDateBetween(OrderStatus status, LocalDateTime start, LocalDateTime end);

    // Row: [java.sql.Date day, BigDecimal revenue, Long orders]
    @Query("SELECT FUNCTION('DATE', o.orderDate), SUM(o.totalAmount), COUNT(o) FROM Order o "
            + "WHERE o.status <> com.shopsphere.entity.OrderStatus.CANCELLED "
            + "AND o.orderDate BETWEEN :start AND :end "
            + "GROUP BY FUNCTION('DATE', o.orderDate)")
    List<Object[]> dailySalesBetween(LocalDateTime start, LocalDateTime end);

    // Recent-orders table (paginated). Sort/newest-first supplied via Pageable.
    Page<Order> findByStatus(OrderStatus status, Pageable pageable);

    Page<Order> findDistinctByItemsProductCategoryId(Long categoryId, Pageable pageable);

    Page<Order> findDistinctByStatusAndItemsProductCategoryId(OrderStatus status, Long categoryId, Pageable pageable);

    // Global search: orders by customer name.
    List<Order> findByUserNameContainingIgnoreCase(String name, Pageable pageable);
}
