package com.shopsphere.service;

import com.shopsphere.dto.ReviewRequest;
import com.shopsphere.dto.ReviewResponse;
import com.shopsphere.entity.Product;
import com.shopsphere.entity.Review;
import com.shopsphere.entity.User;
import com.shopsphere.exception.BadRequestException;
import com.shopsphere.exception.ResourceNotFoundException;
import com.shopsphere.mapper.ReviewMapper;
import com.shopsphere.repository.ProductRepository;
import com.shopsphere.repository.ReviewRepository;
import com.shopsphere.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final ProductRepository productRepository;
    private final SecurityUtils securityUtils;

    @Transactional(readOnly = true)
    public List<ReviewResponse> getByProduct(Long productId) {
        return reviewRepository.findByProductId(productId).stream()
                .map(ReviewMapper::toResponse)
                .toList();
    }

    @Transactional
    public ReviewResponse addOrUpdate(ReviewRequest request) {
        User user = securityUtils.getCurrentUser();
        Product product = productRepository.findById(request.getProductId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Product not found with id: " + request.getProductId()));

        if (request.getRating() < 1 || request.getRating() > 5) {
            throw new BadRequestException("Rating must be between 1 and 5");
        }

        // One review per user per product -> update if it already exists
        Review review = reviewRepository
                .findByUserIdAndProductId(user.getId(), product.getId())
                .orElse(Review.builder()
                        .user(user)
                        .product(product)
                        .build());

        review.setRating(request.getRating());
        review.setComment(request.getComment());

        return ReviewMapper.toResponse(reviewRepository.save(review));
    }
}
