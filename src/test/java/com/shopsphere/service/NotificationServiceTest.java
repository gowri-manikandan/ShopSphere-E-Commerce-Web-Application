package com.shopsphere.service;

import com.shopsphere.entity.Notification;
import com.shopsphere.entity.User;
import com.shopsphere.realtime.NotificationCreatedEvent;
import com.shopsphere.repository.NotificationRepository;
import com.shopsphere.repository.UserRepository;
import com.shopsphere.security.SecurityUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock NotificationRepository notificationRepository;
    @Mock UserRepository userRepository;
    @Mock SecurityUtils securityUtils;
    @Mock ApplicationEventPublisher eventPublisher;

    NotificationService notificationService;

    private final User user = User.builder().id(7L).email("u@x.com").name("U").build();

    @BeforeEach
    void setUp() {
        notificationService = new NotificationService(
                notificationRepository, userRepository, securityUtils, eventPublisher);
    }

    @Test
    void create_persistsAndPublishesEvent() {
        when(userRepository.getReferenceById(7L)).thenReturn(user);
        when(notificationRepository.save(any())).thenAnswer(i -> {
            Notification n = i.getArgument(0);
            n.setId(100L);
            n.setCreatedAt(java.time.LocalDateTime.now());
            return n;
        });

        notificationService.create(7L, "ORDER", "Order #5 SHIPPED", "Your order #5 is now SHIPPED.", "orders.html");

        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(saved.capture());
        assertThat(saved.getValue().getType()).isEqualTo("ORDER");
        assertThat(saved.getValue().isRead()).isFalse();

        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(event.capture());
        assertThat(event.getValue()).isInstanceOfSatisfying(NotificationCreatedEvent.class, e -> {
            assertThat(e.userId()).isEqualTo(7L);
            assertThat(e.payload().title()).isEqualTo("Order #5 SHIPPED");
            assertThat(e.payload().id()).isEqualTo(100L);
        });
    }

    @Test
    void unreadCount_delegatesToRepositoryForCurrentUser() {
        when(securityUtils.getCurrentUser()).thenReturn(user);
        when(notificationRepository.countByUserIdAndReadFalse(7L)).thenReturn(3L);

        assertThat(notificationService.unreadCount()).isEqualTo(3L);
    }

    @Test
    void markAllRead_marksForCurrentUser() {
        when(securityUtils.getCurrentUser()).thenReturn(user);

        notificationService.markAllRead();

        verify(notificationRepository).markAllRead(7L);
    }
}
