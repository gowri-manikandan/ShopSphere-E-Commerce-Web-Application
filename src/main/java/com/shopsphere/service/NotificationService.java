package com.shopsphere.service;

import com.shopsphere.dto.NotificationResponse;
import com.shopsphere.entity.Notification;
import com.shopsphere.entity.User;
import com.shopsphere.realtime.NotificationCreatedEvent;
import com.shopsphere.realtime.NotificationMessage;
import com.shopsphere.repository.NotificationRepository;
import com.shopsphere.repository.UserRepository;
import com.shopsphere.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final SecurityUtils securityUtils;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * Persist a notification for a user and publish a {@link NotificationCreatedEvent} so the
     * AFTER_COMMIT broadcaster pushes it live.
     *
     * <p>REQUIRES_NEW is essential: this is called from AFTER_COMMIT event listeners, where the
     * original (already-committed) transaction is still bound to the thread. Plain REQUIRED would
     * JOIN that completed transaction and the INSERT would never commit (silently lost). A new
     * transaction commits independently, which also lets the {@link NotificationCreatedEvent}'s
     * own AFTER_COMMIT broadcast fire.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void create(Long userId, String type, String title, String message, String link) {
        User userRef = userRepository.getReferenceById(userId); // FK proxy, no extra query
        Notification saved = notificationRepository.save(Notification.builder()
                .user(userRef).type(type).title(title).message(message).link(link).read(false)
                .build());
        eventPublisher.publishEvent(new NotificationCreatedEvent(userId,
                new NotificationMessage(saved.getId(), saved.getType(), saved.getTitle(),
                        saved.getMessage(), saved.getLink(), saved.isRead(), saved.getCreatedAt())));
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getMyNotifications() {
        User user = securityUtils.getCurrentUser();
        return notificationRepository.findTop20ByUserIdOrderByCreatedAtDesc(user.getId()).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public long unreadCount() {
        User user = securityUtils.getCurrentUser();
        return notificationRepository.countByUserIdAndReadFalse(user.getId());
    }

    @Transactional
    public void markAllRead() {
        User user = securityUtils.getCurrentUser();
        notificationRepository.markAllRead(user.getId());
    }

    private NotificationResponse toResponse(Notification n) {
        return NotificationResponse.builder()
                .id(n.getId()).type(n.getType()).title(n.getTitle()).message(n.getMessage())
                .link(n.getLink()).read(n.isRead()).createdAt(n.getCreatedAt())
                .build();
    }
}
