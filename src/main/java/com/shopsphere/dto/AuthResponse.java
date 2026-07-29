package com.shopsphere.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL) // never serialize the (now cookie-only) refreshToken
public class AuthResponse {
    private String token;          // short-lived access JWT
    private String refreshToken;   // carried internally only; moved to an httpOnly cookie, nulled before response
    private Long userId;           // needed client-side for /topic/orders/{userId} (§5)
    private String name;
    private String email;
    private String role;
}
