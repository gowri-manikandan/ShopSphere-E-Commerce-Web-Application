import { api } from './api.js';
import { showToast, showConfirm, showLoader, hideLoader } from './ui.js';
import { refreshCartCount } from './navbar.js';

// DOM Elements
const cartContentWrapper = document.getElementById('cart-content-wrapper');
const emptyCartState = document.getElementById('empty-cart-state');
const cartItemsContainer = document.getElementById('cart-items-container');
const clearCartBtn = document.getElementById('clear-cart-btn');

const summaryItemsCount = document.getElementById('summary-items-count');
const summarySubtotalVal = document.getElementById('summary-subtotal-val');
const summaryGrandTotalVal = document.getElementById('summary-grand-total-val');
const proceedCheckoutBtn = document.getElementById('proceed-checkout-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadCart();
    
    // Clear Cart listener
    clearCartBtn.addEventListener('click', () => {
        showConfirm(
            'Clear Shopping Cart',
            'Are you sure you want to remove all items from your shopping cart?',
            async () => {
                try {
                    showLoader();
                    await api.delete('/api/cart/clear');
                    showToast('Shopping cart cleared.', 'success');
                    await loadCart();
                } catch (err) {
                    showToast(err.message || 'Failed to clear cart.', 'error');
                } finally {
                    hideLoader();
                }
            }
        );
    });

    // Checkout redirect
    proceedCheckoutBtn.addEventListener('click', () => {
        window.location.href = 'checkout.html';
    });
});

// Load and render cart
async function loadCart() {
    try {
        showLoader();
        const cartData = await api.get('/api/cart');
        
        // Refresh navbar badge count too
        window.updateCartBadge(cartData?.totalItems || 0);

        if (!cartData || !cartData.items || cartData.items.length === 0) {
            cartContentWrapper.style.display = 'none';
            emptyCartState.style.display = 'flex';
            return;
        }

        // Show cart layout and hide empty state
        cartContentWrapper.style.display = 'grid';
        emptyCartState.style.display = 'none';

        // Render summary totals
        summaryItemsCount.textContent = `Subtotal (${cartData.totalItems} ${cartData.totalItems === 1 ? 'item' : 'items'})`;
        summarySubtotalVal.textContent = `₹${cartData.grandTotal.toFixed(2)}`;
        summaryGrandTotalVal.textContent = `₹${cartData.grandTotal.toFixed(2)}`;

        // Render item rows
        cartItemsContainer.innerHTML = '';
        cartData.items.forEach(item => {
            const row = renderCartRow(item);
            cartItemsContainer.appendChild(row);
        });

    } catch (err) {
        showToast(err.message || 'Failed to load shopping cart.', 'error');
        cartContentWrapper.style.display = 'none';
        emptyCartState.style.display = 'flex';
    } finally {
        hideLoader();
    }
}

// Generate DOM node for cart item row
function renderCartRow(item) {
    const row = document.createElement('div');
    row.className = 'cart-item-row';

    const fallbackImage = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%23cbd5e1" width="100%" height="100%"><rect width="100%" height="100%" fill="%23f1f5f9"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" /></svg>`;
    const imgUrl = item.imageUrl || fallbackImage;

    row.innerHTML = `
        <div class="cart-item-details">
            <img src="${imgUrl}" class="cart-item-img" alt="${item.productName}" onerror="this.src='${fallbackImage}'">
            <div>
                <a href="product.html?id=${item.productId}" class="cart-item-title">${item.productName}</a>
            </div>
        </div>
        <div class="cart-item-price">₹${item.price.toFixed(2)}</div>
        <div>
            <div class="quantity-picker" style="height: 36px;">
                <button class="quantity-btn qty-minus-btn" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
                <input type="text" class="quantity-val" value="${item.quantity}" readonly style="width: 36px;">
                <button class="quantity-btn qty-plus-btn">+</button>
            </div>
        </div>
        <div class="cart-item-subtotal">₹${item.subtotal.toFixed(2)}</div>
        <div>
            <button class="cart-remove-btn" aria-label="Remove Item">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
            </button>
        </div>
    `;

    // Quantity click listeners
    const minusBtn = row.querySelector('.qty-minus-btn');
    const plusBtn = row.querySelector('.qty-plus-btn');
    const removeBtn = row.querySelector('.cart-remove-btn');

    minusBtn.addEventListener('click', () => updateQuantity(item.productId, item.quantity - 1));
    plusBtn.addEventListener('click', () => updateQuantity(item.productId, item.quantity + 1));
    
    // Remove Item click listener
    removeBtn.addEventListener('click', () => {
        showConfirm(
            'Remove Item',
            `Are you sure you want to remove ${item.productName} from your cart?`,
            async () => {
                try {
                    showLoader();
                    await api.delete(`/api/cart/remove/${item.productId}`);
                    showToast(`${item.productName} removed from cart.`, 'success');
                    await loadCart();
                } catch (err) {
                    showToast(err.message || 'Failed to remove item.', 'error');
                } finally {
                    hideLoader();
                }
            }
        );
    });

    return row;
}

// Update cart quantity handler
async function updateQuantity(productId, newQty) {
    if (newQty < 1) return;
    try {
        showLoader();
        await api.put('/api/cart/update', {
            productId,
            quantity: newQty
        });
        await loadCart();
    } catch (err) {
        showToast(err.message || 'Failed to update quantity. Out of stock limit.', 'error');
        // Reload to revert state visually
        await loadCart();
    } finally {
        hideLoader();
    }
}
