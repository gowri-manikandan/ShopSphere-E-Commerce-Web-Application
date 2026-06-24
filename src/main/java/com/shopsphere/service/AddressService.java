package com.shopsphere.service;

import com.shopsphere.dto.AddressRequest;
import com.shopsphere.dto.AddressResponse;
import com.shopsphere.entity.Address;
import com.shopsphere.entity.User;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.mapper.AddressMapper;
import com.shopsphere.repository.AddressRepository;
import com.shopsphere.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AddressService {

    private final AddressRepository addressRepository;
    private final SecurityUtils securityUtils;

    public List<AddressResponse> getMyAddresses() {
        User user = securityUtils.getCurrentUser();
        return addressRepository.findByUserId(user.getId()).stream()
                .map(AddressMapper::toResponse)
                .toList();
    }

    public AddressResponse add(AddressRequest request) {
        User user = securityUtils.getCurrentUser();
        Address address = Address.builder()
                .user(user)
                .line1(request.getLine1())
                .city(request.getCity())
                .state(request.getState())
                .pincode(request.getPincode())
                .phone(request.getPhone())
                .build();
        return AddressMapper.toResponse(addressRepository.save(address));
    }

    public void delete(Long addressId) {
        User user = securityUtils.getCurrentUser();
        Address address = addressRepository.findById(addressId)
                .orElseThrow(() -> new ResourceNotFoundException("Address not found with id: " + addressId));

        if (!address.getUser().getId().equals(user.getId())) {
            throw new BadRequestException("You can only delete your own addresses");
        }
        addressRepository.delete(address);
    }
}
