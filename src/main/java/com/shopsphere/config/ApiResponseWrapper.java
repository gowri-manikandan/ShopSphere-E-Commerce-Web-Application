package com.shopsphere.config;

import com.shopsphere.dto.ApiResponse;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * Wraps every successful controller response in the {@link ApiResponse} envelope (§8), so
 * controllers keep returning plain DTOs. Scoped to {@code com.shopsphere.controller}. Errors
 * are wrapped separately by {@code GlobalExceptionHandler}.
 *
 * <p>Skips String responses (the {@code text/csv} export) and anything already wrapped or
 * non-JSON.
 */
@RestControllerAdvice(basePackages = "com.shopsphere.controller")
public class ApiResponseWrapper implements ResponseBodyAdvice<Object> {

    @Override
    public boolean supports(MethodParameter returnType,
                            Class<? extends HttpMessageConverter<?>> converterType) {
        // The String converter serves text/csv (and any raw String) — wrapping those into an
        // object would break the converter, so leave them alone.
        return !StringHttpMessageConverter.class.isAssignableFrom(converterType);
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType,
                                  MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> selectedConverterType,
                                  ServerHttpRequest request, ServerHttpResponse response) {
        if (body instanceof ApiResponse) {
            return body; // already wrapped (e.g. an error response)
        }
        if (!MediaType.APPLICATION_JSON.isCompatibleWith(selectedContentType)) {
            return body; // non-JSON payloads pass through untouched
        }
        return ApiResponse.ok(body);
    }
}
