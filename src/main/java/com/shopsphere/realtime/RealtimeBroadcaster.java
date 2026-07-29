package com.shopsphere.realtime;

import com.shopsphere.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Turns committed domain events into STOMP broadcasts. AFTER_COMMIT + @Async mirrors the
 * embeddings pipeline: a rolled-back (e.g. optimistic-lock-retried) checkout attempt never
 * broadcasts, and pushes never run on the request thread. Stock is re-read post-commit so
 * the payload always reflects durable truth, not the event publisher's in-flight state.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RealtimeBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;
    private final ProductRepository productRepository;

    @Value("${app.stock.low-threshold:5}")
    private int lowStockThreshold;

    @Async("realtimeExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onStockChanged(StockChangedEvent event) {
        productRepository.findById(event.productId()).ifPresent(product -> {
            int stock = product.getStockQuantity() != null ? product.getStockQuantity() : 0;
            StockUpdateMessage message =
                    new StockUpdateMessage(product.getId(), stock, stockStatus(stock));
            messagingTemplate.convertAndSend("/topic/stock/" + product.getId(), message);
            log.debug("Broadcast stock update {} -> {}", product.getId(), message.status());
        });
    }

    @Async("realtimeExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onOrderStatusChanged(OrderStatusChangedEvent event) {
        OrderStatusMessage message =
                new OrderStatusMessage(event.orderId(), event.status(), event.updatedAt());
        messagingTemplate.convertAndSend("/topic/orders/" + event.userId(), message);
        log.debug("Broadcast order status {} -> {}", event.orderId(), event.status());
    }

    @Async("realtimeExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onNotificationCreated(NotificationCreatedEvent event) {
        messagingTemplate.convertAndSend("/topic/notifications/" + event.userId(), event.payload());
        log.debug("Broadcast notification to user {}", event.userId());
    }

    private String stockStatus(int stock) {
        if (stock <= 0) {
            return StockUpdateMessage.OUT_OF_STOCK;
        }
        return stock <= lowStockThreshold ? StockUpdateMessage.LOW_STOCK : StockUpdateMessage.IN_STOCK;
    }
}
