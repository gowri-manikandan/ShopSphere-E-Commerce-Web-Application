package com.shopsphere.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShippingInfoRequest {
    private String line1;
    private String city;
    private String state;
    private String pincode;
    private String phone;
    private String courierPartner;
    private String trackingNumber;
    private String estimatedDeliveryDate;
}
