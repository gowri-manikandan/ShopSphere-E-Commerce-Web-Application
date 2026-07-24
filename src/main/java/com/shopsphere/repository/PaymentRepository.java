package com.shopsphere.repository;

import com.shopsphere.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByOrderId(Long orderId);

    // Correlate a Razorpay callback/webhook (carries the Razorpay order id) back to a payment.
    Optional<Payment> findByRazorpayOrderId(String razorpayOrderId);
}
