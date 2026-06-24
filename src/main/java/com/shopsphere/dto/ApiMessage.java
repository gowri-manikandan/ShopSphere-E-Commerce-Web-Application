package com.shopsphere.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Simple wrapper for plain success messages, e.g. {"message": "Product deleted"}.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ApiMessage {
    private String message;
}
