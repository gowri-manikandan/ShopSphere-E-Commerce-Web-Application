package com.shopsphere.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "store_settings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StoreSettings {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "store_name", length = 150)
    private String storeName;

    @Column(columnDefinition = "TEXT")
    private String address;

    @Column(name = "gst_number", length = 50)
    private String gstNumber;

    @Column(name = "pan", length = 50)
    private String pan;

    @Column(name = "bank_name", length = 100)
    private String bankName;

    @Column(name = "bank_account_number", length = 100)
    private String bankAccountNumber;

    @Column(name = "bank_ifsc", length = 50)
    private String bankIfsc;
}
