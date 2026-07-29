package com.shopsphere.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Standard response envelope for all REST endpoints (§8). Success responses carry
 * {@code data}; error responses carry {@code message} + {@code errorCode}. Applied globally by
 * {@code ApiResponseWrapper} (success) and {@code GlobalExceptionHandler} (errors), so
 * controllers keep returning plain DTOs.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {
    private boolean success;
    private String message;
    private String errorCode; // present only on errors (e.g. PRODUCT_NOT_FOUND, VALIDATION_ERROR)
    private T data;
    private Instant timestamp;

    public static <T> ApiResponse<T> ok(T data) {
        return ApiResponse.<T>builder().success(true).data(data).timestamp(Instant.now()).build();
    }

    public static ApiResponse<Object> fail(String message, String errorCode, Object data) {
        return ApiResponse.builder()
                .success(false).message(message).errorCode(errorCode).data(data)
                .timestamp(Instant.now()).build();
    }
}
