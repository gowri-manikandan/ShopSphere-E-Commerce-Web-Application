package com.shopsphere.mapper;

import com.shopsphere.dto.AddressResponse;
import com.shopsphere.entity.Address;

public class AddressMapper {

    public static AddressResponse toResponse(Address a) {
        return AddressResponse.builder()
                .id(a.getId())
                .line1(a.getLine1())
                .city(a.getCity())
                .state(a.getState())
                .pincode(a.getPincode())
                .phone(a.getPhone())
                .build();
    }
}
