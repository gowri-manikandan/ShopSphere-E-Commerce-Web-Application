import { api } from './api.js';
import { auth } from './auth.js';
import { showToast } from './ui.js';
import { getProductSkeleton, showLoader, hideLoader } from './ui.js';
import { refreshCartCount } from './navbar.js';

// DOM elements
const productGrid = document.getElementById('product-grid');
const categoryList = document.getElementById('category-list');
const searchInput = document.getElementById('search-input');
const emptyCatalogState = document.getElementById('empty-catalog-state');
const resetFiltersBtn = document.getElementById('reset-filters-btn');

// Catalog state
let activeCategoryId = null;
let searchQuery = '';
let debounceTimeout = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // This module is also imported by other pages (e.g. orders.js) just for
    // renderStars(). Only run the catalog bootstrap on pages that actually
    // have the catalog DOM, otherwise we'd hit null elements.
    if (!productGrid || !searchInput) return;

    loadCategories();
    loadProducts();
    
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

    // Reset button listener
    resetFiltersBtn.addEventListener('click', resetAllFilters);
});

// Reset search and categories
function resetAllFilters() {
    searchInput.value = '';
    searchQuery = '';
    activeCategoryId = null;
    clearCategoryHighlight();
    const allChip = document.querySelector('[data-category-id="all"]');
    if (allChip) allChip.classList.add('active');
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

// Fetch products based on state
async function loadProducts() {
    productGrid.innerHTML = getProductSkeleton(4);
    emptyCatalogState.style.display = 'none';
    
    try {
        let path = '/api/products';
        if (searchQuery) {
            path += `?search=${encodeURIComponent(searchQuery)}`;
        } else if (activeCategoryId) {
            path += `?categoryId=${activeCategoryId}`;
        }
        
        const products = await api.get(path, true);
        productGrid.innerHTML = '';
        
        if (!products || products.length === 0) {
            emptyCatalogState.style.display = 'flex';
            return;
        }

        products.forEach(product => {
            const card = renderProductCard(product);
            productGrid.appendChild(card);
        });
    } catch (err) {
        productGrid.innerHTML = '';
        showToast(err.message || 'Failed to load products', 'error');
        console.error(err);
    }
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

// Generate single product card DOM element
function renderProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    
    const isOutOfStock = product.stockQuantity <= 0;
    
    // Default image if null
    const fallbackImage = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSIjY2JkNWUxIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEiIGQ9Ik0yLjI1IDE1YTQuNSA0LjUgMCAwMDQuNSA0LjVIMThhMy43NSAzLjc1IDAgMDAxLjMzMi03LjI1NyAzIDMgMCAwMC0zLjc1OC0zLjg0OCA1LjI1IDUuMjUgMCAwMC0xMC4yMzMgMi4zM0E0LjUwMiA0LjUwMiAwIDAwMi4yNSAxNXoiIC8+PC9zdmc+`;
    const imgUrl = product.imageUrl || fallbackImage;

    card.innerHTML = `
        <div class="product-card-img-wrapper">
            <img src="${imgUrl}" class="product-card-img" alt="${product.name}" onerror="this.src='${fallbackImage}'">
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
                <button class="btn btn-primary btn-sm add-to-cart-btn" data-product-id="${product.id}" ${isOutOfStock ? 'disabled' : ''}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add
                </button>
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

    return card;
}
