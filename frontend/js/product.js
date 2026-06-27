import { api } from './api.js';
import { auth } from './auth.js';
import { showToast, showLoader, hideLoader } from './ui.js';
import { renderStars } from './catalog.js';
import { refreshCartCount } from './navbar.js';

// Get Product ID from URL
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');

if (!productId) {
    window.location.href = 'index.html';
}

// State variables
let currentProduct = null;
let currentQuantity = 1;
let selectedRating = 0;

// DOM references
const detailsContainer = document.getElementById('product-details-container');
const reviewsList = document.getElementById('reviews-list');
const writeReviewCard = document.getElementById('write-review-card');
const reviewLoginPrompt = document.getElementById('review-login-prompt');
const reviewForm = document.getElementById('review-form');
const ratingSelect = document.getElementById('rating-select');
const commentInput = document.getElementById('review-comment-input');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadProductDetails();
    loadReviews();
    setupReviewForm();
});

// Load Product Info
async function loadProductDetails() {
    try {
        const product = await api.get(`/api/products/${productId}`, true);
        currentProduct = product;
        
        // Update browser tab title
        document.title = `${product.name} — ShopSphere`;
        
        const fallbackImage = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSIjY2JkNWUxIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEiIGQ9Ik0yLjI1IDE1YTQuNSA0LjUgMCAwMDQuNSA0LjVIMThhMy43NSAzLjc1IDAgMDAxLjMzMi03LjI1NyAzIDMgMCAwMC0zLjc1OC0zLjg0OCA1LjI1IDUuMjUgMCAwMC0xMC4yMzMgMi4zM0E0LjUwMiA0LjUwMiAwIDAwMi4yNSAxNXoiIC8+PC9zdmc+`;
        const isOutOfStock = product.stockQuantity <= 0;

        // Gather all images (main imageUrl + additionalImages)
        const images = [];
        if (product.imageUrl) images.push(product.imageUrl);
        if (product.additionalImages && Array.isArray(product.additionalImages)) {
            product.additionalImages.forEach(img => {
                if (img && !images.includes(img)) {
                    images.push(img);
                }
            });
        }
        if (images.length === 0) {
            images.push(fallbackImage);
        }

        // Construct gallery HTML
        let galleryHtml = `
            <div class="product-gallery-container">
                <div class="main-image-wrapper" id="main-image-wrapper">
                    <img src="${images[0]}" class="main-image-preview" id="main-image-preview" alt="${product.name}" onerror="this.src='${fallbackImage}'">
                </div>
        `;

        if (images.length > 1) {
            galleryHtml += `<div class="thumbnail-grid">`;
            images.forEach((img, idx) => {
                galleryHtml += `
                    <div class="thumbnail-item ${idx === 0 ? 'active' : ''}" data-index="${idx}">
                        <img src="${img}" alt="${product.name} Thumbnail" onerror="this.src='${fallbackImage}'">
                    </div>
                `;
            });
            galleryHtml += `</div>`;
        }
        galleryHtml += `</div>`;

        detailsContainer.innerHTML = `
            <!-- Left: Product Gallery with Hover Zoom -->
            ${galleryHtml}
            
            <!-- Right: Product Info details -->
            <div class="details-info">
                <span class="details-category">${product.categoryName || 'General'}</span>
                <h1 class="details-title">${product.name}</h1>
                
                <div class="details-rating-block">
                    ${renderStars(product.averageRating)}
                    <span style="font-weight: 600;">${product.averageRating ? product.averageRating.toFixed(1) : 'No ratings'} / 5.0</span>
                </div>
                
                <div class="details-price">₹${product.price.toFixed(2)}</div>
                
                <p class="details-desc">${product.description || 'No description available for this product.'}</p>
                
                <div class="details-stock-status">
                    <span class="stock-dot ${isOutOfStock ? 'out-of-stock' : 'in-stock'}"></span>
                    <span style="color: ${isOutOfStock ? 'var(--danger)' : 'var(--success)'};">
                        ${isOutOfStock ? 'Out of stock' : `In stock (${product.stockQuantity} available)`}
                    </span>
                </div>
                
                <div class="details-action-block">
                    <div class="quantity-picker">
                        <button class="quantity-btn" id="qty-minus" ${isOutOfStock ? 'disabled' : ''}>-</button>
                        <input type="text" class="quantity-val" id="qty-value" value="1" readonly>
                        <button class="quantity-btn" id="qty-plus" ${isOutOfStock ? 'disabled' : ''}>+</button>
                    </div>
                    
                    <button class="btn btn-primary btn-lg" id="add-cart-btn" style="flex: 1;" ${isOutOfStock ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                        </svg>
                        Add to Shopping Cart
                    </button>
                </div>
            </div>
        `;

        // Wire up event listeners
        setupImageGallery(images);
        setupQuantityPicker();
        setupCartButton();
    } catch (err) {
        showToast('Error loading product details.', 'error');
        detailsContainer.innerHTML = `<div class="empty-state" style="grid-column: span 2;"><h3>Product not found</h3><p>${err.message}</p></div>`;
    }
}

// Set up image gallery thumbnail swapping and hover zoom
function setupImageGallery(images) {
    const mainWrapper = document.getElementById('main-image-wrapper');
    const mainPreview = document.getElementById('main-image-preview');
    const thumbnails = document.querySelectorAll('.thumbnail-item');

    if (!mainWrapper || !mainPreview) return;

    // Hover zoom logic using coordinate-based scaling
    mainWrapper.addEventListener('mousemove', (e) => {
        const rect = mainWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const xPercent = (x / rect.width) * 100;
        const yPercent = (y / rect.height) * 100;
        mainPreview.style.transformOrigin = `${xPercent}% ${yPercent}%`;
        mainPreview.style.transform = 'scale(2.0)';
    });

    mainWrapper.addEventListener('mouseleave', () => {
        mainPreview.style.transform = 'scale(1.0)';
        mainPreview.style.transformOrigin = 'center center';
    });

    // Thumbnail active switching
    thumbnails.forEach(thumb => {
        const selectImage = () => {
            thumbnails.forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            const idx = parseInt(thumb.getAttribute('data-index'));
            if (images[idx]) {
                mainPreview.src = images[idx];
            }
        };
        thumb.addEventListener('click', selectImage);
        thumb.addEventListener('mouseenter', selectImage);
    });
}

// Qty Button bindings
function setupQuantityPicker() {
    const btnMinus = document.getElementById('qty-minus');
    const btnPlus = document.getElementById('qty-plus');
    const qtyVal = document.getElementById('qty-value');

    if (!btnMinus || !btnPlus || !qtyVal) return;

    btnMinus.addEventListener('click', () => {
        if (currentQuantity > 1) {
            currentQuantity--;
            qtyVal.value = currentQuantity;
        }
    });

    btnPlus.addEventListener('click', () => {
        if (currentQuantity < currentProduct.stockQuantity) {
            currentQuantity++;
            qtyVal.value = currentQuantity;
        } else {
            showToast(`Only ${currentProduct.stockQuantity} items in stock.`, 'info');
        }
    });
}

// Add to Cart Logic
function setupCartButton() {
    const addBtn = document.getElementById('add-cart-btn');
    if (!addBtn) return;

    addBtn.addEventListener('click', async () => {
        if (!auth.isAuthenticated()) {
            showToast('Please login to add items to your cart.', 'info');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1000);
            return;
        }

        try {
            addBtn.disabled = true;
            showLoader();
            
            await api.post('/api/cart/add', {
                productId: currentProduct.id,
                quantity: currentQuantity
            });
            
            showToast(`Added ${currentQuantity} of ${currentProduct.name} to cart.`, 'success');
            await refreshCartCount();
        } catch (err) {
            showToast(err.message || 'Failed to add item to cart', 'error');
        } finally {
            hideLoader();
            addBtn.disabled = false;
        }
    });
}

// Fetch and load reviews
async function loadReviews() {
    try {
        const reviews = await api.get(`/api/reviews/product/${productId}`, true);
        reviewsList.innerHTML = '';

        if (!reviews || reviews.length === 0) {
            reviewsList.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--text-muted);">
                    <p style="font-weight: 500; font-size: 15px;">No reviews yet for this product.</p>
                    <p style="font-size: 13px;">Be the first to share your thoughts!</p>
                </div>
            `;
            return;
        }

        reviews.forEach(review => {
            const reviewCard = document.createElement('div');
            reviewCard.className = 'review-card';
            
            // Format dates
            const dateStr = new Date(review.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            reviewCard.innerHTML = `
                <div class="review-card-header">
                    <span class="review-author">${review.userName || 'Anonymous'}</span>
                    <span class="review-date">${dateStr}</span>
                </div>
                <div class="review-rating">
                    ${renderStars(review.rating)}
                </div>
                <p class="review-comment">${review.comment || ''}</p>
            `;
            
            reviewsList.appendChild(reviewCard);
        });
    } catch (err) {
        reviewsList.innerHTML = `<p style="color: var(--danger);">Failed to load reviews: ${err.message}</p>`;
    }
}

// Review panel configuration
function setupReviewForm() {
    if (auth.isAuthenticated()) {
        writeReviewCard.style.display = 'block';
        reviewLoginPrompt.style.display = 'none';
        
        // Star interactive selector click
        const stars = ratingSelect.querySelectorAll('.star-option');
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const val = parseInt(star.getAttribute('data-star-value'));
                selectedRating = val;
                
                // Color matching stars
                stars.forEach(s => {
                    const sVal = parseInt(s.getAttribute('data-star-value'));
                    if (sVal <= val) {
                        s.classList.add('selected');
                        s.style.color = 'var(--accent)';
                    } else {
                        s.classList.remove('selected');
                        s.style.color = '#cbd5e1';
                    }
                });
            });
            
            // Hover styling support
            star.addEventListener('mouseover', () => {
                const val = parseInt(star.getAttribute('data-star-value'));
                stars.forEach(s => {
                    const sVal = parseInt(s.getAttribute('data-star-value'));
                    if (sVal <= val) {
                        s.style.color = 'var(--accent)';
                    } else {
                        s.style.color = '#cbd5e1';
                    }
                });
            });

            star.addEventListener('mouseout', () => {
                // Return to selected rating visual state
                stars.forEach(s => {
                    const sVal = parseInt(s.getAttribute('data-star-value'));
                    if (sVal <= selectedRating) {
                        s.style.color = 'var(--accent)';
                    } else {
                        s.style.color = '#cbd5e1';
                    }
                });
            });
        });
        
        // Form submit
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const comment = commentInput.value.trim();
            
            if (selectedRating === 0) {
                showToast('Please select a star rating.', 'error');
                return;
            }
            
            if (!comment) {
                showToast('Please write a review comment.', 'error');
                return;
            }

            try {
                showLoader();
                await api.post('/api/reviews', {
                    productId: parseInt(productId),
                    rating: selectedRating,
                    comment
                });
                
                showToast('Thank you! Your review has been submitted.', 'success');
                
                // Reset form inputs
                commentInput.value = '';
                selectedRating = 0;
                stars.forEach(s => {
                    s.classList.remove('selected');
                    s.style.color = '#cbd5e1';
                });

                // Reload product info (for average rating update) and review listing
                loadProductDetails();
                loadReviews();
            } catch (err) {
                showToast(err.message || 'Failed to submit review.', 'error');
            } finally {
                hideLoader();
            }
        });
    } else {
        writeReviewCard.style.display = 'none';
        reviewLoginPrompt.style.display = 'block';
    }
}
