import { api } from './api.js';
import { showToast, showLoader, hideLoader } from './ui.js';
import { renderStars } from './catalog.js';

// DOM elements
const ordersList = document.getElementById('orders-list');
const emptyOrdersState = document.getElementById('empty-orders-state');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadOrders();
});

// Load user orders
async function loadOrders() {
    try {
        showLoader();
        const orders = await api.get('/api/orders');
        ordersList.innerHTML = '';

        if (!orders || orders.length === 0) {
            ordersList.style.display = 'none';
            emptyOrdersState.style.display = 'flex';
            return;
        }

        ordersList.style.display = 'flex';
        emptyOrdersState.style.display = 'none';

        orders.forEach(order => {
            const card = renderOrderCard(order);
            ordersList.appendChild(card);
        });

    } catch (err) {
        showToast(err.message || 'Failed to load order history.', 'error');
        ordersList.innerHTML = `<p style="color: var(--danger); text-align: center;">Error loading orders: ${err.message}</p>`;
    } finally {
        hideLoader();
    }
}

// Map status to badge theme
function getStatusBadgeClass(status) {
    switch (status?.toUpperCase()) {
        case 'DELIVERED':
            return 'badge-success';
        case 'SHIPPED':
            return 'badge-info';
        case 'CANCELLED':
            return 'badge-danger';
        case 'PLACED':
        default:
            return 'badge-warning';
    }
}

// Generate DOM node for collapsible order card
function renderOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-accordion-card';

    // Format order date
    const dateObj = new Date(order.orderDate);
    const dateStr = dateObj.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    const badgeClass = getStatusBadgeClass(order.status);
    
    // Count items
    const itemsCount = order.items ? order.items.reduce((acc, item) => acc + item.quantity, 0) : 0;

    card.innerHTML = `
        <!-- Accordion Header -->
        <div class="order-header-summary">
            <div>
                <span class="order-header-label" style="display:block;">Order ID</span>
                <span class="order-header-val order-id-val">#${order.orderId}</span>
            </div>
            <div>
                <span class="order-header-label" style="display:block;">Date Placed</span>
                <span class="order-header-val">${dateStr}</span>
            </div>
            <div>
                <span class="order-header-label" style="display:block;">Total Amount</span>
                <span class="order-header-val" style="font-family: var(--font-heading); font-weight:700;">₹${order.totalAmount.toFixed(2)}</span>
            </div>
            <div>
                <span class="order-header-label" style="display:block; margin-bottom: 2px;">Status</span>
                <span class="badge ${badgeClass}">${order.status}</span>
            </div>
            <div style="text-align: right; font-size:13px; color: var(--text-muted); font-weight:600;">
                ${itemsCount} ${itemsCount === 1 ? 'item' : 'items'}
            </div>
            <div class="accordion-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="18" height="18">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
            </div>
        </div>
        
        <!-- Accordion Details Drawer -->
        <div class="order-details-drawer">
            <div class="order-drawer-grid">
                
                <!-- Left: Products List -->
                <div class="order-items-list">
                    <h4 class="receipt-title" style="margin-bottom: 8px;">Order Items</h4>
                    ${order.items.map(item => {
                        const fallbackImage = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%23cbd5e1" width="100%" height="100%"><rect width="100%" height="100%" fill="%23f1f5f9"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" /></svg>`;
                        const imgUrl = item.imageUrl || fallbackImage;
                        return `
                            <div class="order-item-row-simple">
                                <img src="${imgUrl}" class="order-item-img-simple" alt="${item.productName}" onerror="this.src='${fallbackImage}'">
                                <div class="order-item-info-simple">
                                    <a href="product.html?id=${item.productId}" class="order-item-name-simple" style="display:block; font-weight:600;">${item.productName}</a>
                                    <span class="order-item-meta-simple">Qty: ${item.quantity} × ₹${item.price.toFixed(2)}</span>
                                </div>
                                <div class="order-item-subtotal-simple">₹${item.subtotal.toFixed(2)}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <!-- Right: Billing details receipt -->
                <div class="order-delivery-receipt">
                    <h4 class="receipt-title">Transaction Receipt</h4>
                    
                    <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px; margin-top: 10px;">
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color: var(--text-muted);">Payment Method:</span>
                            <span style="font-weight:600;">${order.paymentMethod || 'N/A'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color: var(--text-muted);">Payment Status:</span>
                            <span style="font-weight:600; color: ${order.paymentStatus === 'SUCCESS' ? 'var(--success)' : (order.paymentStatus === 'FAILED' ? 'var(--danger)' : 'var(--warning)')};">${order.paymentStatus || 'PENDING'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom: 1px dashed var(--border-color); padding-bottom: 8px; margin-bottom: 4px;">
                            <span style="color: var(--text-muted);">Transaction Ref:</span>
                            <span style="font-family:monospace; font-size:12px;">${order.transactionRef || 'N/A'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size: 15px; font-weight: 800; padding-top: 4px;">
                            <span>Grand Total:</span>
                            <span style="font-family:var(--font-heading);">₹${order.totalAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                
            </div>
        </div>
    `;

    // Click handler to toggle open
    const summaryHeader = card.querySelector('.order-header-summary');
    summaryHeader.addEventListener('click', () => {
        card.classList.toggle('open');
    });

    return card;
}
