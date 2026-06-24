package com.shopsphere.config;

import com.shopsphere.entity.Category;
import com.shopsphere.entity.Product;
import com.shopsphere.entity.Role;
import com.shopsphere.entity.User;
import com.shopsphere.repository.CategoryRepository;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Seeds an admin user + a few categories/products the first time the app runs,
 * so you have data to test with immediately.
 *
 *  Admin login ->  email: admin@shopsphere.com   password: admin123
 */
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        seedAdmin();
        seedCatalog();
    }

    private void seedAdmin() {
        if (!userRepository.existsByEmail("admin@shopsphere.com")) {
            User admin = User.builder()
                    .name("Admin")
                    .email("admin@shopsphere.com")
                    .password(passwordEncoder.encode("admin123"))
                    .role(Role.ADMIN)
                    .build();
            userRepository.save(admin);
        }
    }

    private void seedCatalog() {
        if (categoryRepository.count() > 0) {
            return; // already seeded
        }

        Category electronics = categoryRepository.save(Category.builder()
                .name("Electronics").description("Phones, laptops and gadgets").build());
        Category fashion = categoryRepository.save(Category.builder()
                .name("Fashion").description("Clothing and accessories").build());
        Category books = categoryRepository.save(Category.builder()
                .name("Books").description("Fiction and non-fiction").build());

        productRepository.save(Product.builder()
                .name("Wireless Headphones")
                .description("Noise-cancelling over-ear headphones")
                .price(new BigDecimal("2499.00"))
                .stockQuantity(50)
                .imageUrl("https://via.placeholder.com/300?text=Headphones")
                .category(electronics)
                .build());

        productRepository.save(Product.builder()
                .name("Smartphone X")
                .description("6.5 inch display, 128GB storage")
                .price(new BigDecimal("18999.00"))
                .stockQuantity(30)
                .imageUrl("https://via.placeholder.com/300?text=Smartphone")
                .category(electronics)
                .build());

        productRepository.save(Product.builder()
                .name("Cotton T-Shirt")
                .description("100% cotton, regular fit")
                .price(new BigDecimal("499.00"))
                .stockQuantity(100)
                .imageUrl("https://via.placeholder.com/300?text=T-Shirt")
                .category(fashion)
                .build());

        productRepository.save(Product.builder()
                .name("The Pragmatic Programmer")
                .description("Classic software engineering book")
                .price(new BigDecimal("799.00"))
                .stockQuantity(40)
                .imageUrl("https://via.placeholder.com/300?text=Book")
                .category(books)
                .build());
    }
}
