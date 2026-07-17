package com.shopsphere.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class GoogleSignInRequest {

    /** The ID token (JWT) issued by Google Identity Services on the client. */
    @NotBlank(message = "Google ID token is required")
    private String idToken;
}
