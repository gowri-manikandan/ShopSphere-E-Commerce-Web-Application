package com.shopsphere.repository;

import com.shopsphere.entity.Role;
import com.shopsphere.entity.User;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    // ----- Analytics (§ dashboard) -----

    long countByRole(Role role);

    // Global search: customers by name or email.
    List<User> findByNameContainingIgnoreCaseOrEmailContainingIgnoreCase(
            String name, String email, Pageable pageable);
}
