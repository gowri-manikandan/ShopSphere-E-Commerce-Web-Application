import { api } from './api.js';
import { auth } from './auth.js';
import { showToast, showConfirm } from './ui.js';
import { getProductSkeleton, showLoader, hideLoader } from './ui.js';
import { refreshCartCount } from './navbar.js';
import { subscribeWhenConnected } from './realtime.js';

// DOM elements
let productGrid = document.getElementById('product-grid');
let categoryList = document.getElementById('category-list');
let searchInput = document.getElementById('search-input');
let emptyCatalogState = document.getElementById('empty-catalog-state');
let resetFiltersBtn = document.getElementById('reset-filters-btn');
let minPriceInput = document.getElementById('min-price-input');
let maxPriceInput = document.getElementById('max-price-input');
let priceSliderTrack = document.getElementById('price-slider-track');
let priceSliderFill = document.getElementById('price-slider-fill');
let sliderThumbMin = document.getElementById('slider-thumb-min');
let sliderThumbMax = document.getElementById('slider-thumb-max');
let ratingFilter = document.getElementById('rating-filter');
let clearFiltersBtn = document.getElementById('clear-filters-btn');
let viewAllLink = document.getElementById('view-all-link');

// ✨ Ask AI (semantic search) elements
let aiInput = document.getElementById('ai-search-input');
let aiBtn = document.getElementById('ai-search-btn');
let aiPanel = document.getElementById('ai-search-panel');
let aiResultsHeader = document.getElementById('ai-results-header');
let aiResultsLabel = document.getElementById('ai-results-label');
let aiClearBtn = document.getElementById('ai-clear-btn');

// Catalog state
let activeCategoryId = null;
let searchQuery = '';
let minPrice = null;          // client-side price filter (₹); null = no bound
let maxPrice = null;
let catalogMinPrice = 0;      // dynamic bounds from loaded catalog
let catalogMaxPrice = 50000;
let minRating = 0;            // client-side minimum-rating filter; 0 = any
let loadedProducts = [];      // server result for current category/search, before price/rating filters
let wishlistIds = new Set();  // product ids in the current user's wishlist (for heart states)
let debounceTimeout = null;
let stockSubscriptions = [];  // live-stock handles for the currently rendered grid
let aiMode = false;           // true while showing AI semantic-search results

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Re-query DOM elements (some may be dynamically injected by navbar.js)
    productGrid = document.getElementById('product-grid');
    categoryList = document.getElementById('category-list');
    searchInput = document.getElementById('search-input');
    emptyCatalogState = document.getElementById('empty-catalog-state');
    resetFiltersBtn = document.getElementById('reset-filters-btn');
    minPriceInput = document.getElementById('min-price-input');
    maxPriceInput = document.getElementById('max-price-input');
    priceSliderTrack = document.getElementById('price-slider-track');
    priceSliderFill = document.getElementById('price-slider-fill');
    sliderThumbMin = document.getElementById('slider-thumb-min');
    sliderThumbMax = document.getElementById('slider-thumb-max');
    ratingFilter = document.getElementById('rating-filter');
    clearFiltersBtn = document.getElementById('clear-filters-btn');
    viewAllLink = document.getElementById('view-all-link');

    aiInput = document.getElementById('ai-search-input');
    aiBtn = document.getElementById('ai-search-btn');
    aiPanel = document.getElementById('ai-search-panel');
    aiResultsHeader = document.getElementById('ai-results-header');
    aiResultsLabel = document.getElementById('ai-results-label');
    aiClearBtn = document.getElementById('ai-clear-btn');

    if (!productGrid) return;

    // Check for query parameters (?search=...)
    const urlParams = new URLSearchParams(window.location.search);
    const initialSearch = urlParams.get('search');
    if (initialSearch && searchInput) {
        searchInput.value = initialSearch;
        searchQuery = initialSearch.trim();
    }

    // Set up interactive price slider
    initPriceSlider();

    loadCategories();
    // Load wishlist heart states first (if logged-in customer) so the initial render is correct.
    loadWishlistIds().finally(loadProducts);
    
    // Search listener on navbar search input (debounced)
    if (searchInput) {
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
    }

    // Price filter text inputs (debounced, client-side — re-filters the loaded list without a refetch)
    [minPriceInput, maxPriceInput].forEach(inp => {
        if (!inp) return;
        inp.addEventListener('input', () => {
            const minVal = (minPriceInput && minPriceInput.value !== '') ? Number(minPriceInput.value) : null;
            const maxVal = (maxPriceInput && maxPriceInput.value !== '') ? Number(maxPriceInput.value) : null;

            minPrice = (minVal !== null && !isNaN(minVal)) ? minVal : null;
            maxPrice = (maxVal !== null && !isNaN(maxVal)) ? maxVal : null;

            updateSliderUI();

            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                applyClientFilters();
            }, 300);
        });
    });

    // Minimum-rating 2x2 grid filter
    if (ratingFilter) {
        ratingFilter.addEventListener('click', (e) => {
            const btn = e.target.closest('.rating-grid-btn');
            if (!btn) return;
            const wasActive = btn.classList.contains('active');
            ratingFilter.querySelectorAll('.rating-grid-btn').forEach(b => b.classList.remove('active'));
            if (!wasActive) {
                btn.classList.add('active');
                minRating = Number(btn.dataset.minRating) || 0;
            } else {
                minRating = 0;
            }
            applyClientFilters();
        });
    }

    // Clear-all-filters button (sidebar) + empty-state reset button + view all link
    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', resetAllFilters);
    if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', resetAllFilters);
    if (viewAllLink) viewAllLink.addEventListener('click', resetAllFilters);

    // ✨ Ask AI semantic search
    if (aiBtn && aiInput) {
        const runAi = () => runAiSearch(aiInput.value.trim());
        aiBtn.addEventListener('click', runAi);
        aiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runAi(); });
    }
    if (aiPanel) {
        aiPanel.querySelectorAll('.ai-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const query = chip.getAttribute('data-q') || chip.textContent.trim();
                if (aiInput) aiInput.value = query;
                runAiSearch(query);
            });
        });
    }
    if (aiClearBtn) aiClearBtn.addEventListener('click', exitAiMode);
});

// Helper to make sure slider DOM references are bound
function ensureSliderElements() {
    if (!priceSliderTrack) priceSliderTrack = document.getElementById('price-slider-track');
    if (!priceSliderFill) priceSliderFill = document.getElementById('price-slider-fill');
    if (!sliderThumbMin) sliderThumbMin = document.getElementById('slider-thumb-min');
    if (!sliderThumbMax) sliderThumbMax = document.getElementById('slider-thumb-max');
    if (!minPriceInput) minPriceInput = document.getElementById('min-price-input');
    if (!maxPriceInput) maxPriceInput = document.getElementById('max-price-input');
}

// Update dynamic price bounds based on loaded products
function updatePriceBounds(products) {
    ensureSliderElements();
    if (!products || products.length === 0) {
        catalogMinPrice = 0;
        catalogMaxPrice = 50000;
    } else {
        const prices = products.map(p => Number(p.price)).filter(p => !isNaN(p) && p >= 0);
        if (prices.length > 0) {
            catalogMinPrice = 0;
            const highest = Math.max(...prices);
            catalogMaxPrice = Math.max(100, Math.ceil(highest / 100) * 100);
        } else {
            catalogMinPrice = 0;
            catalogMaxPrice = 50000;
        }
    }

    if (minPriceInput) {
        minPriceInput.placeholder = `Min ₹${catalogMinPrice}`;
        minPriceInput.min = catalogMinPrice;
        minPriceInput.max = catalogMaxPrice;
    }
    if (maxPriceInput) {
        maxPriceInput.placeholder = `Max ₹${catalogMaxPrice}`;
        maxPriceInput.min = catalogMinPrice;
        maxPriceInput.max = catalogMaxPrice;
    }
    updateSliderUI();
}

// Update visual slider thumbs and colored fill bar
function updateSliderUI() {
    ensureSliderElements();
    if (!priceSliderTrack || !priceSliderFill || !sliderThumbMin || !sliderThumbMax) return;

    const range = Math.max(catalogMaxPrice - catalogMinPrice, 1);
    const curMin = (minPrice !== null && !isNaN(minPrice))
        ? Math.max(catalogMinPrice, Math.min(minPrice, catalogMaxPrice))
        : catalogMinPrice;
    const curMax = (maxPrice !== null && !isNaN(maxPrice))
        ? Math.max(catalogMinPrice, Math.min(maxPrice, catalogMaxPrice))
        : catalogMaxPrice;

    const leftPct = Math.max(0, Math.min(100, ((curMin - catalogMinPrice) / range) * 100));
    const rightPct = Math.max(0, Math.min(100, ((curMax - catalogMinPrice) / range) * 100));

    sliderThumbMin.style.left = `${leftPct}%`;
    sliderThumbMax.style.left = `${rightPct}%`;

    sliderThumbMin.setAttribute('aria-valuenow', curMin);
    sliderThumbMin.setAttribute('aria-valuemin', catalogMinPrice);
    sliderThumbMin.setAttribute('aria-valuemax', catalogMaxPrice);

    sliderThumbMax.setAttribute('aria-valuenow', curMax);
    sliderThumbMax.setAttribute('aria-valuemin', catalogMinPrice);
    sliderThumbMax.setAttribute('aria-valuemax', catalogMaxPrice);

    priceSliderFill.style.left = `${leftPct}%`;
    priceSliderFill.style.right = `${100 - rightPct}%`;
    priceSliderFill.style.width = 'auto';
}

// Initialize interactive drag, touch, and click handling on dual price slider
function initPriceSlider() {
    ensureSliderElements();
    if (!priceSliderTrack || !sliderThumbMin || !sliderThumbMax) return;

    let activeThumb = null;

    function handlePointerDown(e, thumbType) {
        e.preventDefault();
        e.stopPropagation();
        activeThumb = thumbType;
        const target = e.currentTarget;
        target.classList.add('dragging');
        try {
            target.setPointerCapture(e.pointerId);
        } catch (err) {}

        const onPointerMove = (ev) => {
            if (!activeThumb) return;
            const rect = priceSliderTrack.getBoundingClientRect();
            if (rect.width <= 0) return;

            const clampX = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
            const pct = clampX / rect.width;
            const rawVal = catalogMinPrice + pct * (catalogMaxPrice - catalogMinPrice);
            const val = Math.round(rawVal);

            if (activeThumb === 'min') {
                const effectiveMax = (maxPrice !== null) ? maxPrice : catalogMaxPrice;
                const newMin = Math.min(val, effectiveMax);
                minPrice = newMin <= catalogMinPrice ? null : newMin;
                if (minPriceInput) minPriceInput.value = minPrice !== null ? minPrice : '';
            } else if (activeThumb === 'max') {
                const effectiveMin = (minPrice !== null) ? minPrice : catalogMinPrice;
                const newMax = Math.max(val, effectiveMin);
                maxPrice = newMax >= catalogMaxPrice ? null : newMax;
                if (maxPriceInput) maxPriceInput.value = maxPrice !== null ? maxPrice : '';
            }

            updateSliderUI();

            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                applyClientFilters();
            }, 100);
        };

        const onPointerUp = (ev) => {
            activeThumb = null;
            target.classList.remove('dragging');
            try {
                target.releasePointerCapture(ev.pointerId);
            } catch (err) {}
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            applyClientFilters();
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    }

    sliderThumbMin.addEventListener('pointerdown', (e) => handlePointerDown(e, 'min'));
    sliderThumbMax.addEventListener('pointerdown', (e) => handlePointerDown(e, 'max'));

    // Keyboard support (Arrow keys, Home, End)
    [{ el: sliderThumbMin, type: 'min' }, { el: sliderThumbMax, type: 'max' }].forEach(({ el, type }) => {
        el.addEventListener('keydown', (e) => {
            const step = Math.max(1, Math.round((catalogMaxPrice - catalogMinPrice) / 50));
            let handled = false;
            let current = (type === 'min')
                ? ((minPrice !== null) ? minPrice : catalogMinPrice)
                : ((maxPrice !== null) ? maxPrice : catalogMaxPrice);

            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                current = Math.max(catalogMinPrice, current - step);
                handled = true;
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                current = Math.min(catalogMaxPrice, current + step);
                handled = true;
            } else if (e.key === 'Home') {
                current = catalogMinPrice;
                handled = true;
            } else if (e.key === 'End') {
                current = catalogMaxPrice;
                handled = true;
            }

            if (handled) {
                e.preventDefault();
                if (type === 'min') {
                    const effectiveMax = (maxPrice !== null) ? maxPrice : catalogMaxPrice;
                    const newMin = Math.min(current, effectiveMax);
                    minPrice = newMin <= catalogMinPrice ? null : newMin;
                    if (minPriceInput) minPriceInput.value = minPrice !== null ? minPrice : '';
                } else {
                    const effectiveMin = (minPrice !== null) ? minPrice : catalogMinPrice;
                    const newMax = Math.max(current, effectiveMin);
                    maxPrice = newMax >= catalogMaxPrice ? null : newMax;
                    if (maxPriceInput) maxPriceInput.value = maxPrice !== null ? maxPrice : '';
                }
                updateSliderUI();
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(applyClientFilters, 150);
            }
        });
    });

    // Clicking anywhere on track
    priceSliderTrack.addEventListener('click', (e) => {
        if (e.target === sliderThumbMin || e.target === sliderThumbMax) return;
        const rect = priceSliderTrack.getBoundingClientRect();
        if (rect.width <= 0) return;
        const clampX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const pct = clampX / rect.width;
        const clickedVal = Math.round(catalogMinPrice + pct * (catalogMaxPrice - catalogMinPrice));

        const curMin = (minPrice !== null) ? minPrice : catalogMinPrice;
        const curMax = (maxPrice !== null) ? maxPrice : catalogMaxPrice;

        if (Math.abs(clickedVal - curMin) <= Math.abs(clickedVal - curMax)) {
            const newMin = Math.min(clickedVal, curMax);
            minPrice = newMin <= catalogMinPrice ? null : newMin;
            if (minPriceInput) minPriceInput.value = minPrice !== null ? minPrice : '';
        } else {
            const newMax = Math.max(clickedVal, curMin);
            maxPrice = newMax >= catalogMaxPrice ? null : newMax;
            if (maxPriceInput) maxPriceInput.value = maxPrice !== null ? maxPrice : '';
        }

        updateSliderUI();
        applyClientFilters();
    });
}

// Reset search and categories
function resetAllFilters() {
    if (searchInput) searchInput.value = '';
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
        ratingFilter.querySelectorAll('.rating-grid-btn').forEach(b => b.classList.remove('active'));
    }
    updateSliderUI();

    loadProducts();
}

function clearCategoryHighlight() {
    if (!categoryList) return;
    const chips = categoryList.querySelectorAll('.category-chip');
    chips.forEach(chip => chip.classList.remove('active'));
}

// Fetch categories
async function loadCategories() {
    if (!categoryList) return;
    try {
        const categories = await api.get('/api/categories', true);
        
        // Add "All Products" option
        let html = `<button type="button" class="category-chip active" data-category-id="all">
            <span>All Products</span>
        </button>`;
        
        const filteredCategories = (categories || []).filter(
            cat => cat && cat.name && cat.name.trim().toLowerCase() !== 'uncategorized'
        );

        filteredCategories.forEach(cat => {
            const isNew = cat.name.toLowerCase().includes('new');
            html += `<button type="button" class="category-chip" data-category-id="${cat.id}">
                <span>${cat.name}</span>
                ${isNew ? '<span class="cat-new-badge">NEW</span>' : ''}
            </button>`;
        });

        // Add "New Arrivals" badge chip if not already present
        const hasNew = filteredCategories.some(c => c.name.toLowerCase().includes('new'));
        if (!hasNew) {
            html += `<button type="button" class="category-chip" data-category-id="new-arrivals">
                <span>New Arrivals</span>
                <span class="cat-new-badge">NEW</span>
            </button>`;
        }
        
        categoryList.innerHTML = html;

        // Set click listeners on category chips
        categoryList.querySelectorAll('.category-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const target = e.currentTarget;
                clearCategoryHighlight();
                target.classList.add('active');
                
                const catId = target.getAttribute('data-category-id');
                if (catId === 'all' || catId === 'new-arrivals') {
                    activeCategoryId = null;
                } else {
                    activeCategoryId = catId;
                }
                
                // When selecting category, clear search input
                if (searchInput) searchInput.value = '';
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
    if (productGrid) productGrid.innerHTML = getProductSkeleton(4);
    if (emptyCatalogState) emptyCatalogState.style.display = 'none';

    try {
        let path = '/api/products';
        if (searchQuery) {
            path += `?search=${encodeURIComponent(searchQuery)}`;
        } else if (activeCategoryId) {
            path += `?categoryId=${activeCategoryId}`;
        }

        loadedProducts = await api.get(path, true) || [];
        updatePriceBounds(loadedProducts);
        applyClientFilters();
    } catch (err) {
        if (productGrid) productGrid.innerHTML = '';
        loadedProducts = [];
        showToast(err.message || 'Failed to load products', 'error');
        console.error(err);
    }
}

// ✨ AI semantic search: free-text query → semantically nearest products (§6)
async function runAiSearch(q) {
    if (!q || q.length < 2) { showToast('Type what you\'re looking for.', 'info'); return; }

    // Reset the keyword/category controls so the two modes don't visually conflict.
    aiMode = true;
    if (searchInput) searchInput.value = '';
    searchQuery = '';
    clearCategoryHighlight();
    activeCategoryId = null;

    if (productGrid) productGrid.innerHTML = getProductSkeleton(4);
    if (emptyCatalogState) emptyCatalogState.style.display = 'none';
    if (aiResultsHeader) aiResultsHeader.style.display = 'flex';
    if (aiResultsLabel) aiResultsLabel.textContent = `Finding the best matches for “${q}”…`;

    try {
        const results = await api.get(`/api/search/semantic?q=${encodeURIComponent(q)}&limit=12`, true) || [];
        loadedProducts = results || [];
        updatePriceBounds(loadedProducts);
        if (aiResultsLabel) {
            aiResultsLabel.innerHTML = results.length
                ? `✨ AI picks for “<strong>${escapeHtml(q)}</strong>” — ${results.length} result${results.length === 1 ? '' : 's'}`
                : `No AI matches for “<strong>${escapeHtml(q)}</strong>”. Try describing it differently.`;
        }
        if (results.length === 0) {
            if (productGrid) productGrid.innerHTML = '';
            if (emptyCatalogState) emptyCatalogState.style.display = 'none';
            subscribeToLiveStock([]);
            return;
        }
        applyClientFilters();
    } catch (err) {
        if (productGrid) productGrid.innerHTML = '';
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
            if (p.averageRating == null || p.averageRating < minRating) return false;
        }
        return true;
    });
    renderProductList(filtered);
}

function renderProductList(products) {
    if (!productGrid) return;
    productGrid.innerHTML = '';
    if (!products || products.length === 0) {
        if (emptyCatalogState) emptyCatalogState.style.display = 'flex';
        subscribeToLiveStock([]); // release any stale live-stock subscriptions
        return;
    }
    if (emptyCatalogState) emptyCatalogState.style.display = 'none';
    products.forEach(product => {
        const card = renderProductCard(product);
        productGrid.appendChild(card);
    });
    subscribeToLiveStock(products);
}

// Live stock (§5): one topic per rendered product
function subscribeToLiveStock(products) {
    stockSubscriptions.forEach(sub => sub.unsubscribe());
    stockSubscriptions = products.map(product =>
        subscribeWhenConnected(`/topic/stock/${product.id}`, applyLiveStockToCard));
}

function applyLiveStockToCard(update) {
    if (!productGrid) return;
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
            starsHtml += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
        } else if (i === fullStars + 1 && hasHalfStar) {
            starsHtml += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03z" fill-rule="evenodd" clip-rule="evenodd"/><rect x="12" y="2" width="10" height="20" fill="transparent" /></svg>`;
        } else {
            starsHtml += `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="15" height="15"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499c.176-.427.772-.427.948 0l3.07 6.183 6.795.774c.48.055.67.64.322.98l-4.916 4.8 1.166 6.779c.082.48-.42.876-.843.629L12 17.657l-6.07 3.197c-.423.247-.925-.149-.843-.629l1.166-6.779-4.916-4.8c-.347-.34-.157-.924.322-.98l6.795-.774 3.07-6.183z" /></svg>`;
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

// Generate single product card DOM element matching the exact image specification
export function renderProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.productId = product.id; // hook for live stock updates

    const isOutOfStock = product.stockQuantity <= 0;
    const isAdmin = auth.isAdmin();

    // Discount percentage
    const discountPercent = product.discountPercent || (product.id % 3 === 1 ? 10 : (product.id % 3 === 2 ? 5 : 8));
    const originalPrice = product.originalPrice || Math.round(product.price * (1 + discountPercent / 100));

    // Fallback image
    const fallbackImage = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%23cbd5e1" width="100%" height="100%"%3E%3Crect width="100%" height="100%" fill="%23f1f5f9"/%3E%3Cpath stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"/%3E%3C/svg%3E';
    const imgUrl = product.imageUrl || fallbackImage;

    card.innerHTML = `
        <div class="product-card-img-wrapper">
            <img src="${imgUrl}" class="product-card-img" alt="${escapeHtml(product.name)}" loading="lazy" onerror="this.onerror=null; this.src='${fallbackImage}'">
            <span class="product-discount-tag">${discountPercent}% OFF</span>
            ${(!isAdmin) ? `
                <button type="button" class="wishlist-btn ${wishlistIds.has(product.id) ? 'active' : ''}" data-product-id="${product.id}" aria-label="Toggle wishlist" title="Wishlist">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
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
            <span class="product-card-category">${escapeHtml((product.categoryName || 'General').toUpperCase())}</span>
            <a href="product.html?id=${product.id}" class="product-card-title-link">
                <h3 class="product-card-title">${escapeHtml(product.name)}</h3>
            </a>
            <div class="product-card-rating">
                ${renderStars(product.averageRating)}
                <span class="rating-count">(${product.reviewCount || 0} reviews)</span>
            </div>
            <div class="product-card-price-row">
                <span class="product-card-price">₹${product.price.toFixed(2)}</span>
                <span class="product-card-orig-price">₹${originalPrice.toFixed(2)}</span>
            </div>
            <div class="product-card-action-row">
                ${isAdmin ? `
                    <div class="admin-actions-cell" style="width:100%; display:flex; gap:8px;">
                        <a href="admin.html?edit=${product.id}" class="btn btn-secondary btn-sm" style="flex:1;">Edit</a>
                        <button type="button" class="btn btn-danger btn-sm admin-delete-btn" data-product-id="${product.id}" style="flex:1;">Delete</button>
                    </div>
                ` : `
                    <button type="button" class="btn-card-add-cart add-to-cart-btn" data-product-id="${product.id}" ${isOutOfStock ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                        </svg>
                        Add to Cart
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

    // Wishlist heart toggle
    const wishBtn = card.querySelector('.wishlist-btn');
    if (wishBtn) {
        wishBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!auth.isAuthenticated()) {
                showToast('Please login to use wishlist.', 'info');
                return;
            }
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

    // Admin: delete product directly from catalog
    const deleteBtn = card.querySelector('.admin-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showConfirm(
                'Delete Product',
                `Are you sure you want to delete "${product.name}"? Products on past orders will retain history, but new orders will not be allowed.`,
                async () => {
                    try {
                        showLoader();
                        await api.delete(`/api/products/${product.id}`);
                        showToast('Product deleted successfully.', 'success');
                        loadProducts();
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
