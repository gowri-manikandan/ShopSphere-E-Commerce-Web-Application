import { api } from './api.js';
import { auth } from './auth.js';
import { showToast, showLoader, hideLoader } from './ui.js';
import { renderStars, renderProductCard } from './catalog.js';
import { refreshCartCount } from './navbar.js';
import { subscribeWhenConnected } from './realtime.js';

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
    loadRecommendations();
    setupReviewForm();
    subscribeToLiveStock();
});

// ✨ AI recommendations (§6): nearest products by embedding similarity, out-of-stock excluded.
async function loadRecommendations() {
    const section = document.getElementById('recommendations-section');
    const grid = document.getElementById('recommendations-grid');
    if (!section || !grid) return;
    try {
        const recs = await api.get(`/api/products/${productId}/recommendations?limit=4`, true);
        if (!recs || recs.length === 0) { section.style.display = 'none'; return; }
        grid.innerHTML = '';
        recs.forEach(p => grid.appendChild(renderProductCard(p)));
        section.style.display = 'block';
    } catch (err) {
        section.style.display = 'none'; // recommendations are non-critical
    }
}

// Live stock updates (§5): patch the stock line + action buttons in place, no reload.
function subscribeToLiveStock() {
    subscribeWhenConnected(`/topic/stock/${productId}`, update => {
        if (String(update.productId) !== String(productId)) return;
        if (currentProduct) currentProduct.stockQuantity = update.availableStock;
        applyStockState(update.availableStock, update.status);
    });
}

function applyStockState(availableStock, status) {
    const stockBlock = document.getElementById('stock-status');
    if (!stockBlock) return; // details not rendered yet; initial render uses fresh data anyway

    const isOut = status === 'OUT_OF_STOCK' || availableStock <= 0;
    const lowNote = status === 'LOW_STOCK' ? ' — only a few left!' : '';
    stockBlock.innerHTML = `
        <span class="stock-dot ${isOut ? 'out-of-stock' : 'in-stock'}"></span>
        <span style="color: ${isOut ? 'var(--danger)' : 'var(--success)'};">
            ${isOut ? 'Out of stock' : `In stock (${availableStock} available)${lowNote}`}
        </span>
    `;

    ['qty-minus', 'qty-plus', 'add-cart-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = isOut;
    });

    // Clamp a selected quantity that no longer fits the new stock level
    const qtyEl = document.getElementById('qty-value');
    if (qtyEl && !isOut && currentQuantity > availableStock) {
        currentQuantity = availableStock;
        qtyEl.value = String(currentQuantity);
    }
}

// Load Product Info
async function loadProductDetails() {
    try {
        const product = await api.get(`/api/products/${productId}`, true);
        currentProduct = product;
        
        // Update browser tab title
        document.title = `${product.name} — ShopSphere`;
        
        const fallbackImage = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSIjY2JkNWUxIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEiIGQ9Ik0yLjI1IDE1YTQuNSA0LjUgMCAwMDQuNSA0LjVIMThhMy43NSAzLjc1IDAgMDAxLjMzMi03LjI1NyAzIDMgMCAwMC0zLjc1OC0zLjg0OCA1LjI1IDUuMjUgMCAwMC0xMC4yMzMgMi4zM0E0LjUwMiA0LjUwMiAwIDAwMi4yNSAxNXoiIC8+PC9zdmc+`;
        const isOutOfStock = product.stockQuantity <= 0;

        // Gather all media items (images + videos)
        const mediaItems = [];
        if (product.imageUrl) {
            mediaItems.push({ type: 'image', url: product.imageUrl });
        }
        if (product.additionalImages && Array.isArray(product.additionalImages)) {
            product.additionalImages.forEach(img => {
                if (img && !mediaItems.some(item => item.url === img)) {
                    mediaItems.push({ type: 'image', url: img });
                }
            });
        }
        if (product.videoUrl) {
            mediaItems.push({ type: 'video', url: product.videoUrl });
        }
        if (mediaItems.length === 0) {
            mediaItems.push({ type: 'image', url: fallbackImage });
        }

        // Construct gallery HTML
        let firstMediaHtml = '';
        if (mediaItems[0].type === 'video') {
            firstMediaHtml = getEmbedVideoHtml(mediaItems[0].url);
        } else {
            firstMediaHtml = `<img src="${mediaItems[0].url}" class="main-image-preview" id="main-image-preview" alt="${product.name}" onerror="this.src='${fallbackImage}'">`;
        }

        let galleryHtml = `
            <div class="product-gallery-container">
                <div class="main-image-wrapper" id="main-image-wrapper">
                    ${firstMediaHtml}
                </div>
        `;

        if (mediaItems.length > 1) {
            galleryHtml += `<div class="thumbnail-grid">`;
            mediaItems.forEach((item, idx) => {
                const isVideo = item.type === 'video';
                const thumbSrc = isVideo ? getVideoThumbnail(item.url) : item.url;
                galleryHtml += `
                    <div class="thumbnail-item ${idx === 0 ? 'active' : ''} ${isVideo ? 'video-thumbnail' : ''}" data-index="${idx}">
                        <img src="${thumbSrc}" alt="${product.name} Thumbnail" loading="lazy" onerror="this.src='${fallbackImage}'">
                        ${isVideo ? `
                        <div class="play-overlay">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                                <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        ` : ''}
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
                
                <div class="details-stock-status" id="stock-status">
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
        setupImageGallery(mediaItems);
        setupQuantityPicker();
        setupCartButton();
    } catch (err) {
        showToast('Error loading product details.', 'error');
        detailsContainer.innerHTML = `<div class="empty-state" style="grid-column: span 2;"><h3>Product not found</h3><p>${err.message}</p></div>`;
    }
}

// Helpers for video embeds and thumbnails
function getEmbedVideoHtml(url) {
    if (!url) return '';
    // Check for YouTube
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const ytMatch = url.match(ytRegex);
    if (ytMatch && ytMatch[1]) {
        return `<iframe class="main-video-preview" src="https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%; height:100%; object-fit:cover; border-radius: var(--radius-xl);"></iframe>`;
    }
    // Check for Vimeo
    const vimeoRegex = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/;
    const vimeoMatch = url.match(vimeoRegex);
    if (vimeoMatch && vimeoMatch[1]) {
        return `<iframe class="main-video-preview" src="https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=1" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="width:100%; height:100%; object-fit:cover; border-radius: var(--radius-xl);"></iframe>`;
    }
    // Direct MP4 / other video file
    return `<video src="${url}" class="main-video-preview" controls autoplay muted style="width:100%; height:100%; object-fit:contain; border-radius: var(--radius-xl);"></video>`;
}

function getVideoThumbnail(url) {
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const ytMatch = url.match(ytRegex);
    if (ytMatch && ytMatch[1]) {
        return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`;
    }
    // Generic video icon/thumbnail
    return `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSIjOTRhM2I4IiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuNSIgZD0iTTE1Ljc1IDZIMy43NUExLjc1IDEuNzUgMCAwMC0xLjc1IDEuNzV2OC41YzAgLjk2Ni43ODQgMS43NSAxLjc1IDEuNzVoMTJjLjk2NiAwIDEuNzUtLjc4NCAxLjc1LTEuNzV2LTguNWMwLS45NjYtLjc4NC0xLjc1LTEuNzUtMS43NXoiLz48cGF0aCBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMS41IiBkPSJNMjEuNzUgOC4yNWwtNC41IDIuODQ0djEuOTA2bDQuNSAyLjg0NFY4LjI1eiIvPjwvc3ZnPg==`;
}

// Set up image gallery thumbnail swapping and hover zoom
function setupImageGallery(mediaItems) {
    const mainWrapper = document.getElementById('main-image-wrapper');
    const thumbnails = document.querySelectorAll('.thumbnail-item');

    if (!mainWrapper) return;

    const handleHoverZoom = (e) => {
        const mainPreview = document.getElementById('main-image-preview');
        if (!mainPreview) return;
        const rect = mainWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const xPercent = (x / rect.width) * 100;
        const yPercent = (y / rect.height) * 100;
        mainPreview.style.transformOrigin = `${xPercent}% ${yPercent}%`;
        mainPreview.style.transform = 'scale(2.0)';
    };

    const resetHoverZoom = () => {
        const mainPreview = document.getElementById('main-image-preview');
        if (!mainPreview) return;
        mainPreview.style.transform = 'scale(1.0)';
        mainPreview.style.transformOrigin = 'center center';
    };

    const updateZoomEvents = (isImage) => {
        if (isImage) {
            mainWrapper.addEventListener('mousemove', handleHoverZoom);
            mainWrapper.addEventListener('mouseleave', resetHoverZoom);
            mainWrapper.style.cursor = 'zoom-in';
        } else {
            mainWrapper.removeEventListener('mousemove', handleHoverZoom);
            mainWrapper.removeEventListener('mouseleave', resetHoverZoom);
            mainWrapper.style.cursor = 'default';
        }
    };

    // Initial zoom state
    updateZoomEvents(mediaItems[0] && mediaItems[0].type === 'image');

    // Thumbnail active switching
    thumbnails.forEach(thumb => {
        const selectMedia = () => {
            thumbnails.forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            const idx = parseInt(thumb.getAttribute('data-index'));
            const item = mediaItems[idx];
            if (item) {
                if (item.type === 'video') {
                    mainWrapper.innerHTML = getEmbedVideoHtml(item.url);
                    updateZoomEvents(false);
                } else {
                    mainWrapper.innerHTML = `<img src="${item.url}" class="main-image-preview" id="main-image-preview" alt="${currentProduct.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSIjY2JkNWUxIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEiIGQ9Ik0yLjI1IDE1YTQuNSA0LjUgMCAwMDQuNSA0LjVIMThhMy43NSAzLjc1IDAgMDAxLjMzMi03LjI1NyAzIDMgMCAwMC0zLjc1OC0zLjg0OCA1LjI1IDUuMjUgMCAwMC0xMC4yMzMgMi4zM0E0LjUwMiA0LjUwMiAwIDAwMi4yNSAxNXoiIC8+PC9zdmc+'">`;
                    updateZoomEvents(true);
                }
            }
        };
        thumb.addEventListener('click', selectMedia);
        thumb.addEventListener('mouseenter', selectMedia);
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
