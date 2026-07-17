package com.shopsphere.realtime;

import com.shopsphere.entity.User;
import com.shopsphere.repository.UserRepository;
import com.shopsphere.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * STOMP-level security. The HTTP JwtAuthenticationFilter never sees STOMP frames, so:
 *  - CONNECT: an Authorization: Bearer header is validated via JwtService and the
 *    resulting {@link StompPrincipal} (with numeric userId) is attached to the session.
 *    A missing header is allowed — stock topics are public. An invalid token is rejected.
 *  - SUBSCRIBE: /topic/orders/{userId} requires a principal whose userId matches the
 *    path segment (or ADMIN). Everything else under /topic is public.
 */
@Component
@RequiredArgsConstructor
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private static final Pattern ORDER_TOPIC = Pattern.compile("^/topic/orders/(\\d+)$");

    private final JwtService jwtService;
    private final UserRepository userRepository;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            authenticateConnect(accessor);
        } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            authorizeSubscribe(accessor);
        }
        return message;
    }

    private void authenticateConnect(StompHeaderAccessor accessor) {
        String authHeader = accessor.getFirstNativeHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return; // anonymous session: may subscribe to public stock topics only
        }
        String token = authHeader.substring(7);
        try {
            String email = jwtService.extractEmail(token);
            if (email == null || !jwtService.isTokenValid(token, email)) {
                throw new AccessDeniedException("Invalid or expired token");
            }
            User user = userRepository.findByEmail(email)
                    .orElseThrow(() -> new AccessDeniedException("Unknown user: " + email));
            accessor.setUser(new StompPrincipal(user.getEmail(), user.getId(), user.getRole().name()));
        } catch (AccessDeniedException e) {
            throw e;
        } catch (Exception e) {
            // Malformed/expired JWT parsing errors -> reject the CONNECT frame
            throw new AccessDeniedException("Invalid or expired token");
        }
    }

    private void authorizeSubscribe(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null) {
            return;
        }
        Matcher m = ORDER_TOPIC.matcher(destination);
        if (!m.matches()) {
            return; // /topic/stock/** and anything else broadcast-public
        }
        long requestedUserId = Long.parseLong(m.group(1));
        if (!(accessor.getUser() instanceof StompPrincipal principal)) {
            throw new AccessDeniedException("Authentication required for " + destination);
        }
        if (!principal.isAdmin() && !principal.userId().equals(requestedUserId)) {
            throw new AccessDeniedException("Cannot subscribe to another user's order topic");
        }
    }
}
