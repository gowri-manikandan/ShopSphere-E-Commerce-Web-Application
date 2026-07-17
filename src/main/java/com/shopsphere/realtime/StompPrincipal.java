package com.shopsphere.realtime;

import java.security.Principal;

/**
 * Principal attached to a STOMP session on authenticated CONNECT. Carries the numeric
 * userId so subscription authorization for /topic/orders/{userId} needs no DB lookup.
 */
public record StompPrincipal(String name, Long userId, String role) implements Principal {

    @Override
    public String getName() {
        return name;
    }

    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }
}
