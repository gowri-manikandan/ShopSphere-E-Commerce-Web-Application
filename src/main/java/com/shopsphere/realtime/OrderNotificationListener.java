package com.shopsphere.realtime;

import com.shopsphere.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Turns every committed order-status change into an in-app notification for the customer (§16).
 * Runs AFTER_COMMIT (a rolled-back status change produces no notification); NotificationService
 * opens its own transaction to persist + broadcast. One hook covers admin updates, cancellation,
 * and payment confirm/fail (all publish {@link OrderStatusChangedEvent}).
 */
@Component
@RequiredArgsConstructor
public class OrderNotificationListener {

    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onOrderStatusChanged(OrderStatusChangedEvent event) {
        notificationService.create(
                event.userId(),
                "ORDER",
                "Order #" + event.orderId() + " " + event.status(),
                "Your order #" + event.orderId() + " is now " + event.status() + ".",
                "orders.html");
    }
}
