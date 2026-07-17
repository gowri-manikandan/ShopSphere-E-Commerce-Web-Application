package com.shopsphere.realtime;

import com.shopsphere.entity.Product;
import com.shopsphere.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RealtimeBroadcasterTest {

    @Mock SimpMessagingTemplate messagingTemplate;
    @Mock ProductRepository productRepository;

    RealtimeBroadcaster broadcaster;

    @BeforeEach
    void setUp() {
        broadcaster = new RealtimeBroadcaster(messagingTemplate, productRepository);
        ReflectionTestUtils.setField(broadcaster, "lowStockThreshold", 5);
    }

    private Product productWithStock(long id, int stock) {
        return Product.builder().id(id).name("P" + id)
                .price(new BigDecimal("10.00")).stockQuantity(stock).build();
    }

    @Test
    void onStockChanged_sendsSpecCompliantDestinationAndPayload() {
        when(productRepository.findById(7L)).thenReturn(Optional.of(productWithStock(7L, 42)));

        broadcaster.onStockChanged(new StockChangedEvent(7L));

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(org.mockito.ArgumentMatchers.eq("/topic/stock/7"), payload.capture());
        assertThat(payload.getValue()).isEqualTo(new StockUpdateMessage(7L, 42, "IN_STOCK"));
    }

    @Test
    void onStockChanged_statusBoundaries() {
        // 0 -> OUT_OF_STOCK
        when(productRepository.findById(1L)).thenReturn(Optional.of(productWithStock(1L, 0)));
        broadcaster.onStockChanged(new StockChangedEvent(1L));
        verify(messagingTemplate).convertAndSend(org.mockito.ArgumentMatchers.eq("/topic/stock/1"),
                org.mockito.ArgumentMatchers.<Object>eq(new StockUpdateMessage(1L, 0, "OUT_OF_STOCK")));

        // exactly at threshold (5) -> LOW_STOCK
        when(productRepository.findById(2L)).thenReturn(Optional.of(productWithStock(2L, 5)));
        broadcaster.onStockChanged(new StockChangedEvent(2L));
        verify(messagingTemplate).convertAndSend(org.mockito.ArgumentMatchers.eq("/topic/stock/2"),
                org.mockito.ArgumentMatchers.<Object>eq(new StockUpdateMessage(2L, 5, "LOW_STOCK")));

        // just above threshold -> IN_STOCK
        when(productRepository.findById(3L)).thenReturn(Optional.of(productWithStock(3L, 6)));
        broadcaster.onStockChanged(new StockChangedEvent(3L));
        verify(messagingTemplate).convertAndSend(org.mockito.ArgumentMatchers.eq("/topic/stock/3"),
                org.mockito.ArgumentMatchers.<Object>eq(new StockUpdateMessage(3L, 6, "IN_STOCK")));
    }

    @Test
    void onStockChanged_deletedProduct_sendsNothing() {
        when(productRepository.findById(99L)).thenReturn(Optional.empty());

        broadcaster.onStockChanged(new StockChangedEvent(99L));

        verify(messagingTemplate, never()).convertAndSend(anyString(), any(Object.class));
    }

    @Test
    void onOrderStatusChanged_sendsToUserTopic() {
        LocalDateTime now = LocalDateTime.now();

        broadcaster.onOrderStatusChanged(new OrderStatusChangedEvent(100L, 42L, "SHIPPED", now));

        verify(messagingTemplate).convertAndSend(org.mockito.ArgumentMatchers.eq("/topic/orders/42"),
                org.mockito.ArgumentMatchers.<Object>eq(new OrderStatusMessage(100L, "SHIPPED", now)));
    }
}
