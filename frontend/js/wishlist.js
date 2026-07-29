import { api } from './api.js';
import { showToast, showLoader, hideLoader } from './ui.js';
import { refreshCartCount } from './navbar.js';
import './navbar.js'; // renders navbar + runs the auth guard

const grid = document.getElementById('wishlist-grid');
const emptyState = document.getElementById('wishlist-empty');

const FALLBACK_IMG = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSIjY2JkNWUxIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEiIGQ9Ik0yLjI1IDE1YTQuNSA0LjUgMCAwMDQuNSA0LjVIMThhMy43NSAzLjc1IDAgMDAxLjMzMi03LjI1NyAzIDMgMCAwMC0zLjc1OC0zLjg0OCA1LjI1IDUuMjUgMCAwMC0xMC4yMzMgMi4zM0E0LjUwMiA0LjUwMiAwIDAwMi4yNSAxNXoiIC8+PC9zdmc+`;

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function inr(n) {
    return '₹' + Number(n || 0).toFixed(2);
}

document.addEventListener('DOMContentLoaded', loadWishlist);

async function loadWishlist() {
    try {
        const items = await api.get('/api/wishlist');
        grid.innerHTML = '';
        if (!items || items.length === 0) {
            grid.style.display = 'none';
            emptyState.style.display = 'flex';
            return;
        }
        emptyState.style.display = 'none';
        grid.style.display = '';
        items.forEach(item => grid.appendChild(renderCard(item)));
    } catch (err) {
        grid.innerHTML = '';
        showToast(err.message || 'Failed to load wishlist.', 'error');
    }
}

function renderCard(item) {
    const card = document.createElement('div');
    card.className = 'product-card';
    const outOfStock = (item.stockQuantity ?? 0) <= 0;
    const img = item.imageUrl || FALLBACK_IMG;

    card.innerHTML = `
        <div class="product-card-img-wrapper">
            <img src="${img}" class="product-card-img" alt="${esc(item.name)}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
            ${outOfStock ? `<div class="out-of-stock-overlay"><span class="out-of-stock-badge">Out of Stock</span></div>` : ''}
        </div>
        <div class="product-card-body">
            <a href="product.html?id=${item.productId}" class="product-card-title-link">
                <h3 class="product-card-title">${esc(item.name)}</h3>
            </a>
            <div class="product-card-footer" style="margin-top:auto;">
                <span class="product-card-price">${inr(item.price)}</span>
            </div>
            <div style="display:flex; gap:8px; margin-top:12px;">
                <button class="btn btn-primary btn-sm add-btn" ${outOfStock ? 'disabled' : ''} style="flex:1;">Add to Cart</button>
                <button class="btn btn-secondary btn-sm remove-btn">Remove</button>
            </div>
        </div>
    `;

    card.querySelector('.remove-btn').addEventListener('click', async () => {
        try {
            showLoader();
            await api.delete(`/api/wishlist/${item.productId}`);
            card.remove();
            showToast('Removed from wishlist', 'info');
            if (!grid.querySelector('.product-card')) {
                grid.style.display = 'none';
                emptyState.style.display = 'flex';
            }
        } catch (err) {
            showToast(err.message || 'Could not remove item', 'error');
        } finally {
            hideLoader();
        }
    });

    const addBtn = card.querySelector('.add-btn');
    if (addBtn && !outOfStock) {
        addBtn.addEventListener('click', async () => {
            try {
                addBtn.disabled = true;
                showLoader();
                await api.post('/api/cart/add', { productId: item.productId, quantity: 1 });
                showToast(`Added ${item.name} to cart!`, 'success');
                await refreshCartCount();
            } catch (err) {
                showToast(err.message || 'Could not add to cart', 'error');
            } finally {
                hideLoader();
                addBtn.disabled = false;
            }
        });
    }

    return card;
}
