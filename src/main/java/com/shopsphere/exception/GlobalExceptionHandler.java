package com.shopsphere.exception;

import com.shopsphere.dto.ApiResponse;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.util.HashMap;
import java.util.Map;

/**
 * Central error handling (§8). Every error returns the {@link ApiResponse} envelope with
 * {@code success=false}, a human message, and a machine-readable {@code errorCode}.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponse<Object>> handleNotFound(ResourceNotFoundException ex) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), "RESOURCE_NOT_FOUND", null);
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiResponse<Object>> handleBadRequest(BadRequestException ex) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), "BAD_REQUEST", null);
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiResponse<Object>> handleBadCredentials(BadCredentialsException ex) {
        return build(HttpStatus.UNAUTHORIZED, "Invalid email or password", "INVALID_CREDENTIALS", null);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Object>> handleAccessDenied(AccessDeniedException ex) {
        return build(HttpStatus.FORBIDDEN,
                "You do not have permission to access this resource", "ACCESS_DENIED", null);
    }

    // Validation errors from @Valid — field-by-field messages under data.fieldErrors.
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = new HashMap<>();
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.put(error.getField(), error.getDefaultMessage());
        }
        Map<String, Object> data = new HashMap<>();
        data.put("fieldErrors", fieldErrors);
        return build(HttpStatus.BAD_REQUEST, "Validation failed", "VALIDATION_ERROR", data);
    }

    // Concurrency conflict that survived the service-layer retries (optimistic-lock version
    // mismatch or InnoDB deadlock) when two requests race on the same product's stock.
    @ExceptionHandler(ConcurrencyFailureException.class)
    public ResponseEntity<ApiResponse<Object>> handleConcurrencyConflict(ConcurrencyFailureException ex) {
        return build(HttpStatus.CONFLICT,
                "This item was updated by another request at the same moment. Please try again.",
                "CONFLICT", null);
    }

    // Payment processing failure (gateway misconfig, bad signature, refund error) (§9).
    @ExceptionHandler(PaymentException.class)
    public ResponseEntity<ApiResponse<Object>> handlePayment(PaymentException ex) {
        return build(HttpStatus.PAYMENT_REQUIRED, ex.getMessage(), "PAYMENT_ERROR", null);
    }

    // Uploaded file exceeds the configured multipart limit (§15).
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Object>> handleMaxUploadSize(MaxUploadSizeExceededException ex) {
        return build(HttpStatus.BAD_REQUEST,
                "File is too large. Maximum upload size is 2MB.", "FILE_TOO_LARGE", null);
    }

    // Wrong HTTP method (e.g. opening a POST-only endpoint in the browser address bar).
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Object>> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex) {
        String msg = "HTTP method '" + ex.getMethod() + "' is not supported for this endpoint. "
                + "Supported: " + ex.getSupportedHttpMethods();
        return build(HttpStatus.METHOD_NOT_ALLOWED, msg, "METHOD_NOT_ALLOWED", null);
    }

    // Fallback for any other unexpected error.
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Object>> handleGeneric(Exception ex) {
        return build(HttpStatus.INTERNAL_SERVER_ERROR,
                "Something went wrong: " + ex.getMessage(), "INTERNAL_ERROR", null);
    }

    private ResponseEntity<ApiResponse<Object>> build(HttpStatus status, String message,
                                                      String errorCode, Object data) {
        return ResponseEntity.status(status).body(ApiResponse.fail(message, errorCode, data));
    }
}
