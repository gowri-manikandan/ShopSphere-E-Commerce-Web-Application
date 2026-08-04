import { api } from './api.js';
import { auth } from './auth.js';
import { showToast, showConfirm } from './ui.js';
import { getProductSkeleton, showLoader, hideLoader } from './ui.js';
import { refreshCartCount } from './navbar.js';
import { subscribeWhenConnected } from './realtime.js';

// DOM elements
const productGrid = document.getElementById('product-grid');
const categoryList = document.getElementById('category-list');
const searchInput = document.getElementById('search-input');
const emptyCatalogState = document.getElementById('empty-catalog-state');
const resetFiltersBtn = document.getElementById('reset-filters-btn');
const minPriceInput = document.getElementById('min-price-input');
const maxPriceInput = document.getElementById('max-price-input');
const ratingFilter = document.getElementById('rating-filter');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
// ✨ Ask AI (semantic search) elements
const aiInput = document.getElementById('ai-search-input');
const aiBtn = document.getElementById('ai-search-btn');
const aiPanel = document.getElementById('ai-search-panel');
const aiResultsHeader = document.getElementById('ai-results-header');
const aiResultsLabel = document.getElementById('ai-results-label');
const aiClearBtn = document.getElementById('ai-clear-btn');

// Catalog state
let activeCategoryId = null;
let searchQuery = '';
let minPrice = null;       // client-side price filter (₹); null = no bound
let maxPrice = null;
let minRating = 0;         // client-side minimum-rating filter; 0 = any
let loadedProducts = [];   // server result for current category/search, before price/rating filters
let wishlistIds = new Set(); // product ids in the current user's wishlist (for heart states)
let debounceTimeout = null;
let stockSubscriptions = []; // live-stock handles for the currently rendered grid
let aiMode = false;          // true while showing AI semantic-search results

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // This module is also imported by other pages (e.g. orders.js) just for
    // renderStars(). Only run the catalog bootstrap on pages that actually
    // have the catalog DOM, otherwise we'd hit null elements.
    if (!productGrid || !searchInput) return;

    loadCategories();
    // Load wishlist heart states first (if logged-in customer) so the initial render is correct.
    loadWishlistIds().finally(loadProducts);
    
    // Search listener (debounced)
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            // When searching, clear category selection (mutually exclusive in backend)
            if (searchQuery) {
                clearCategoryHighlight();
                activeCategoryId = null;
            }
            loadProducts();
        }, 300);
    });

    // Price filter (debounced, client-side — re-filters the loaded list without a refetch)
    [minPriceInput, maxPriceInput].forEach(inp => {
        if (!inp) return;
        inp.addEventListener('input', () => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                minPrice = minPriceInput.value !== '' ? Number(minPriceInput.value) : null;
                maxPrice = maxPriceInput.value !== '' ? Number(maxPriceInput.value) : null;
                applyClientFilters();
            }, 300);
        });
    });

    // Minimum-rating filter (client-side)
    if (ratingFilter) {
        ratingFilter.addEventListener('click', (e) => {
            const btn = e.target.closest('.rating-option');
            if (!btn) return;
            ratingFilter.querySelectorAll('.rating-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            minRating = Number(btn.dataset.minRating) || 0;
            applyClientFilters();
        });
    }

    // Clear-all-filters button (sidebar) + empty-state reset button
    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', resetAllFilters);
    resetFiltersBtn.addEventListener('click', resetAllFilters);

    // ✨ Ask AI semantic search
    if (aiBtn && aiInput) {
        const runAi = () => runAiSearch(aiInput.value.trim());
        aiBtn.addEventListener('click', runAi);
        aiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runAi(); });
    }
    if (aiPanel) {
        aiPanel.querySelectorAll('.ai-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                if (aiInput) aiInput.value = chip.dataset.q;
                runAiSearch(chip.dataset.q);
            });
        });
    }
    if (aiClearBtn) aiClearBtn.addEventListener('click', exitAiMode);
});

// Reset search and categories
function resetAllFilters() {
    searchInput.value = '';
    searchQuery = '';
    activeCategoryId = null;
    clearCategoryHighlight();
    const allChip = document.querySelector('[data-category-id="all"]');
    if (allChip) allChip.classList.add('active');

    // Clear client-side price/rating filters + their UI
    minPrice = null;
    maxPrice = null;
    minRating = 0;
    if (minPriceInput) minPriceInput.value = '';
    if (maxPriceInput) maxPriceInput.value = '';
    if (ratingFilter) {
        ratingFilter.querySelectorAll('.rating-option').forEach(b => b.classList.remove('active'));
        const anyBtn = ratingFilter.querySelector('[data-min-rating="0"]');
        if (anyBtn) anyBtn.classList.add('active');
    }

    loadProducts();
}

function clearCategoryHighlight() {
    const chips = categoryList.querySelectorAll('.category-chip');
    chips.forEach(chip => chip.classList.remove('active'));
}

// Fetch categories
async function loadCategories() {
    try {
        const categories = await api.get('/api/categories', true);
        
        // Add "All" option
        let html = `<button class="category-chip active" data-category-id="all">All Products</button>`;
        
        categories.forEach(cat => {
            html += `<button class="category-chip" data-category-id="${cat.id}">${cat.name}</button>`;
        });
        
        categoryList.innerHTML = html;

        // Set click listeners on category chips
        categoryList.querySelectorAll('.category-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const target = e.currentTarget;
                clearCategoryHighlight();
                target.classList.add('active');
                
                const catId = target.getAttribute('data-category-id');
                if (catId === 'all') {
                    activeCategoryId = null;
                } else {
                    activeCategoryId = catId;
                }
                
                // When selecting category, clear search input
                searchInput.value = '';
                searchQuery = '';
                
                loadProducts();
            });
        });
    } catch (err) {
        showToast('Failed to load categories', 'error');
        console.error(err);
    }
}

// Fetch products for the active category/search (server-side), then apply the client-side
// price + rating filters on top of that result.
async function loadProducts() {
    // Any normal catalog action (search / category / filter / reset) leaves AI mode.
    aiMode = false;
    if (aiResultsHeader) aiResultsHeader.style.display = 'none';
    productGrid.innerHTML = getProductSkeleton(4);
    emptyCatalogState.style.display = 'none';

    try {
        let path = '/api/products';
        if (searchQuery) {
            path += `?search=${encodeURIComponent(searchQuery)}`;
        } else if (activeCategoryId) {
            path += `?categoryId=${activeCategoryId}`;
        }

        loadedProducts = await api.get(path, true) || [];
        applyClientFilters();
    } catch (err) {
        productGrid.innerHTML = '';
        loadedProducts = [];
        showToast(err.message || 'Failed to load products', 'error');
        console.error(err);
    }
}

// ✨ AI semantic search: free-text query → semantically nearest products (§6). Results bypass
// the keyword/category/price/rating filters (it's a ranked AI list, not a browse filter).
async function runAiSearch(q) {
    if (!q || q.length < 2) { showToast('Type what you\'re looking for.', 'info'); return; }

    // Reset the keyword/category controls so the two modes don't visually conflict.
    aiMode = true;
    searchInput.value = '';
    searchQuery = '';
    clearCategoryHighlight();
    activeCategoryId = null;

    productGrid.innerHTML = getProductSkeleton(4);
    emptyCatalogState.style.display = 'none';
    if (aiResultsHeader) aiResultsHeader.style.display = 'flex';
    if (aiResultsLabel) aiResultsLabel.textContent = `Finding the best matches for “${q}”…`;

    try {
        const results = await api.get(`/api/search/semantic?q=${encodeURIComponent(q)}&limit=12`, true) || [];
        if (aiResultsLabel) {
            aiResultsLabel.innerHTML = results.length
                ? `✨ AI picks for “<strong>${escapeHtml(q)}</strong>” — ${results.length} result${results.length === 1 ? '' : 's'}`
                : `No AI matches for “<strong>${escapeHtml(q)}</strong>”. Try describing it differently.`;
        }
        if (results.length === 0) {
            productGrid.innerHTML = '';
            emptyCatalogState.style.display = 'none'; // the AI header already explains the empty result
            subscribeToLiveStock([]);
            return;
        }
        renderProductList(results);
    } catch (err) {
        productGrid.innerHTML = '';
        if (aiResultsLabel) aiResultsLabel.textContent = 'AI search is unavailable right now.';
        showToast(err.message || 'AI search failed.', 'error');
    }
}

function exitAiMode() {
    aiMode = false;
    if (aiResultsHeader) aiResultsHeader.style.display = 'none';
    if (aiInput) aiInput.value = '';
    loadProducts();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Filter the already-loaded products by price + minimum rating (no refetch), then render.
function applyClientFilters() {
    const filtered = loadedProducts.filter(p => {
        const price = Number(p.price);
        if (minPrice != null && price < minPrice) return false;
        if (maxPrice != null && price > maxPrice) return false;
        if (minRating > 0) {
            // Products with no reviews (null rating) don't satisfy a minimum-rating filter.
            if (p.averageRating == null || p.averageRating < minRating) return false;
        }
        return true;
    });
    renderProductList(filtered);
}

function renderProductList(products) {
    productGrid.innerHTML = '';
    if (!products || products.length === 0) {
        emptyCatalogState.style.display = 'flex';
        subscribeToLiveStock([]); // release any stale live-stock subscriptions
        return;
    }
    emptyCatalogState.style.display = 'none';
    products.forEach(product => {
        const card = renderProductCard(product);
        productGrid.appendChild(card);
    });
    subscribeToLiveStock(products);
}

// Live stock (§5): one topic per rendered product; old handles are released on every
// re-render so grid rebuilds (search/filter) never leak subscriptions (§13).
function subscribeToLiveStock(products) {
    stockSubscriptions.forEach(sub => sub.unsubscribe());
    stockSubscriptions = products.map(product =>
        subscribeWhenConnected(`/topic/stock/${product.id}`, applyLiveStockToCard));
}

function applyLiveStockToCard(update) {
    const card = productGrid.querySelector(`.product-card[data-product-id="${update.productId}"]`);
    if (!card) return;

    const isOut = update.status === 'OUT_OF_STOCK' || update.availableStock <= 0;
    const imgWrapper = card.querySelector('.product-card-img-wrapper');
    let overlay = card.querySelector('.out-of-stock-overlay');

    if (isOut && !overlay && imgWrapper) {
        overlay = document.createElement('div');
        overlay.className = 'out-of-stock-overlay';
        overlay.innerHTML = '<span class="out-of-stock-badge">Out of Stock</span>';
        imgWrapper.appendChild(overlay);
    } else if (!isOut && overlay) {
        overlay.remove();
    }

    const cartBtn = card.querySelector('.add-to-cart-btn');
    if (cartBtn) cartBtn.disabled = isOut;
}

// Render rating stars SVG
export function renderStars(rating) {
    const val = rating || 0;
    let starsHtml = '';
    const fullStars = Math.floor(val);
    const hasHalfStar = val % 1 >= 0.5;

    for (let i = 1; i <= 5; i++) {
        if (i <= fullStars) {
            starsHtml += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
        } else if (i === fullStars + 1 && hasHalfStar) {
            starsHtml += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03z" fill-rule="evenodd" clip-rule="evenodd"/><rect x="12" y="2" width="10" height="20" fill="transparent" /></svg>`;
        } else {
            starsHtml += `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499c.176-.427.772-.427.948 0l3.07 6.183 6.795.774c.48.055.67.64.322.98l-4.916 4.8 1.166 6.779c.082.48-.42.876-.843.629L12 17.657l-6.07 3.197c-.423.247-.925-.149-.843-.629l1.166-6.779-4.916-4.8c-.347-.34-.157-.924.322-.98l6.795-.774 3.07-6.183z" /></svg>`;
        }
    }
    return `<div class="rating-stars">${starsHtml}</div>`;
}

// Fetch the current user's wishlisted product ids (logged-in customers only) for heart states.
async function loadWishlistIds() {
    wishlistIds = new Set();
    if (!auth.isAuthenticated() || auth.isAdmin()) return;
    try {
        const ids = await api.get('/api/wishlist/ids');
        wishlistIds = new Set(ids || []);
    } catch (err) {
        /* non-fatal: hearts just start empty */
    }
}

// Generate single product card DOM element (exported so the product page's AI
// recommendations row can reuse the exact same card + cart/wishlist wiring).
export function renderProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.productId = product.id; // hook for live stock updates

    const isOutOfStock = product.stockQuantity <= 0;
    const isAdmin = auth.isAdmin();

    // Default image if null
    const fallbackImage = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%23cbd5e1" width="100%" height="100%"%3E%3Crect width="100%" height="100%" fill="%23f1f5f9"/%3E%3Cpath stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"/%3E%3C/svg%3E';
    const imgUrl = product.imageUrl || fallbackImage;

    card.innerHTML = `
        <div class="product-card-img-wrapper">
            <img src="${imgUrl}" class="product-card-img" alt="${product.name}" loading="lazy" onerror="this.onerror=null; this.src='${fallbackImage}'">
            ${(!isAdmin && auth.isAuthenticated()) ? `
                <button class="wishlist-btn ${wishlistIds.has(product.id) ? 'active' : ''}" data-product-id="${product.id}" aria-label="Toggle wishlist" title="Wishlist">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                </button>
            ` : ''}
            ${isOutOfStock ? `
                <div class="out-of-stock-overlay">
                    <span class="out-of-stock-badge">Out of Stock</span>
                </div>
            ` : ''}
        </div>
        <div class="product-card-body">
            <span class="product-card-category">${product.categoryName || 'General'}</span>
            <a href="product.html?id=${product.id}" class="product-card-title-link">
                <h3 class="product-card-title">${product.name}</h3>
            </a>
            <div class="product-card-rating">
                ${renderStars(product.averageRating)}
                <span>(${product.averageRating ? product.averageRating.toFixed(1) : 'No reviews'})</span>
            </div>
            <div class="product-card-footer">
                <span class="product-card-price">₹${product.price.toFixed(2)}</span>
                ${isAdmin ? `
                    <div class="admin-actions-cell">
                        <a href="admin.html?edit=${product.id}" class="btn btn-secondary btn-sm">Edit</a>
                        <button class="btn btn-danger btn-sm admin-delete-btn" data-product-id="${product.id}">Delete</button>
                    </div>
                ` : `
                    <button class="btn btn-primary btn-sm add-to-cart-btn" data-product-id="${product.id}" ${isOutOfStock ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Add
                    </button>
                `}
            </div>
        </div>
    `;

    // Cart button listener
    const cartBtn = card.querySelector('.add-to-cart-btn');
    if (cartBtn) {
        cartBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!auth.isAuthenticated()) {
                showToast('Please login to add items to your cart.', 'info');
                // Redirect to login after a brief pause
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1000);
                return;
            }

            try {
                cartBtn.disabled = true;
                showLoader();
                
                await api.post('/api/cart/add', {
                    productId: product.id,
                    quantity: 1
                });
                
                showToast(`Added ${product.name} to cart!`, 'success');
                await refreshCartCount();
            } catch (err) {
                showToast(err.message || 'Could not add product to cart', 'error');
            } finally {
                hideLoader();
                if (!isOutOfStock) {
                    cartBtn.disabled = false;
                }
            }
        });
    }

    // Wishlist heart toggle (logged-in customers).
    const wishBtn = card.querySelector('.wishlist-btn');
    if (wishBtn) {
        wishBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const inList = wishlistIds.has(product.id);
            wishBtn.disabled = true;
            try {
                if (inList) {
                    await api.delete(`/api/wishlist/${product.id}`);
                    wishlistIds.delete(product.id);
                    wishBtn.classList.remove('active');
                    showToast('Removed from wishlist', 'info');
                } else {
                    await api.post(`/api/wishlist/${product.id}`);
                    wishlistIds.add(product.id);
                    wishBtn.classList.add('active');
                    showToast('Added to wishlist', 'success');
                }
            } catch (err) {
                showToast(err.message || 'Could not update wishlist', 'error');
            } finally {
                wishBtn.disabled = false;
            }
        });
    }

    // Admin: delete this product directly from the catalog (Edit deep-links to the Manage page).
    const deleteBtn = card.querySelector('.admin-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showConfirm(
                'Delete Product',
                `Delete "${product.name}"? This cannot be undone.`,
                async () => {
                    try {
                        showLoader();
                        await api.delete(`/api/products/${product.id}`);
                        showToast(`"${product.name}" deleted.`, 'success');
                        card.remove();
                    } catch (err) {
                        showToast(err.message || 'Failed to delete product.', 'error');
                    } finally {
                        hideLoader();
                    }
                }
            );
        });
    }

    return card;
}
