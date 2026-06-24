package com.shopsphere.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class OrderRequest {

    @NotNull(message = "Address id is required")
    private Long addressId;

    @NotNull(message = "Payment method is required")
    private String paymentMethod; // CARD, UPI, COD, NETBANKING
}
