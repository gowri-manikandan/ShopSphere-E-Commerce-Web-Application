package com.shopsphere.realtime;

import com.shopsphere.entity.Role;
import com.shopsphere.entity.User;
import com.shopsphere.repository.UserRepository;
import com.shopsphere.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.access.AccessDeniedException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StompAuthChannelInterceptorTest {

    @Mock JwtService jwtService;
    @Mock UserRepository userRepository;
    @Mock MessageChannel channel;

    StompAuthChannelInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new StompAuthChannelInterceptor(jwtService, userRepository);
    }

    private Message<byte[]> connectMessage(String authHeader) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        if (authHeader != null) {
            accessor.setNativeHeader("Authorization", authHeader);
        }
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private Message<byte[]> subscribeMessage(String destination, StompPrincipal principal) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination(destination);
        if (principal != null) {
            accessor.setUser(principal);
        }
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private User user(long id, String email, Role role) {
        return User.builder().id(id).email(email).name("U" + id).role(role).build();
    }

    // ----- CONNECT -----

    @Test
    void connect_validToken_attachesPrincipalWithUserId() {
        when(jwtService.extractEmail("good")).thenReturn("a@b.com");
        when(jwtService.isTokenValid("good", "a@b.com")).thenReturn(true);
        when(userRepository.findByEmail("a@b.com")).thenReturn(Optional.of(user(42L, "a@b.com", Role.CUSTOMER)));

        Message<?> out = interceptor.preSend(connectMessage("Bearer good"), channel);

        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(out);
        assertThat(accessor.getUser()).isInstanceOfSatisfying(StompPrincipal.class, p -> {
            assertThat(p.userId()).isEqualTo(42L);
            assertThat(p.getName()).isEqualTo("a@b.com");
            assertThat(p.isAdmin()).isFalse();
        });
    }

    @Test
    void connect_invalidToken_rejected() {
        when(jwtService.extractEmail("bad")).thenReturn("a@b.com");
        when(jwtService.isTokenValid("bad", "a@b.com")).thenReturn(false);

        assertThatThrownBy(() -> interceptor.preSend(connectMessage("Bearer bad"), channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void connect_malformedToken_rejected() {
        when(jwtService.extractEmail("garbage")).thenThrow(new RuntimeException("parse error"));

        assertThatThrownBy(() -> interceptor.preSend(connectMessage("Bearer garbage"), channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void connect_noToken_allowedAsAnonymous() {
        Message<?> out = interceptor.preSend(connectMessage(null), channel);

        assertThat(StompHeaderAccessor.wrap(out).getUser()).isNull();
    }

    // ----- SUBSCRIBE -----

    @Test
    void subscribe_ownOrdersTopic_allowed() {
        StompPrincipal me = new StompPrincipal("a@b.com", 42L, "CUSTOMER");

        assertThatCode(() -> interceptor.preSend(subscribeMessage("/topic/orders/42", me), channel))
                .doesNotThrowAnyException();
    }

    @Test
    void subscribe_otherUsersOrdersTopic_denied() {
        StompPrincipal me = new StompPrincipal("a@b.com", 42L, "CUSTOMER");

        assertThatThrownBy(() -> interceptor.preSend(subscribeMessage("/topic/orders/43", me), channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void subscribe_adminToAnyOrdersTopic_allowed() {
        StompPrincipal admin = new StompPrincipal("admin@shopsphere.com", 1L, "ADMIN");

        assertThatCode(() -> interceptor.preSend(subscribeMessage("/topic/orders/43", admin), channel))
                .doesNotThrowAnyException();
    }

    @Test
    void subscribe_anonymousToOrdersTopic_denied() {
        assertThatThrownBy(() -> interceptor.preSend(subscribeMessage("/topic/orders/42", null), channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void subscribe_anonymousToStockTopic_allowed() {
        assertThatCode(() -> interceptor.preSend(subscribeMessage("/topic/stock/7", null), channel))
                .doesNotThrowAnyException();
    }

    // ----- notifications topic (same owner/admin rule as orders) -----

    @Test
    void subscribe_ownNotificationsTopic_allowed() {
        StompPrincipal me = new StompPrincipal("a@b.com", 42L, "CUSTOMER");

        assertThatCode(() -> interceptor.preSend(subscribeMessage("/topic/notifications/42", me), channel))
                .doesNotThrowAnyException();
    }

    @Test
    void subscribe_otherUsersNotificationsTopic_denied() {
        StompPrincipal me = new StompPrincipal("a@b.com", 42L, "CUSTOMER");

        assertThatThrownBy(() -> interceptor.preSend(subscribeMessage("/topic/notifications/43", me), channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void subscribe_anonymousToNotificationsTopic_denied() {
        assertThatThrownBy(() -> interceptor.preSend(subscribeMessage("/topic/notifications/42", null), channel))
                .isInstanceOf(AccessDeniedException.class);
    }
}
