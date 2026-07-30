import { api } from './api.js';
import { auth } from './auth.js';
import { showToast, showLoader, hideLoader } from './ui.js';
import { subscribeWhenConnected } from './realtime.js';
import './navbar.js';

// DOM
const ordersList = document.getElementById('orders-list');
const emptyOrdersState = document.getElementById('empty-orders-state');
const noMatchState = document.getElementById('orders-no-match');
const searchInput = document.getElementById('order-search');
const filterBtn = document.getElementById('orders-filter-btn');
const filterMenu = document.getElementById('orders-filter-menu');

// State
let allOrders = [];
let currentSearch = '';
let currentStatus = '';

document.addEventListener('DOMContentLoaded', () => {
    loadOrders();
    subscribeToLiveOrderStatus();
    setupControls();
});

function setupControls() {
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.trim();
            applyFilters();
        });
    }
    if (filterBtn && filterMenu) {
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filterMenu.classList.toggle('hidden');
        });
        filterMenu.querySelectorAll('.orders-filter-option').forEach(opt => {
            opt.addEventListener('click', () => {
                filterMenu.querySelectorAll('.orders-filter-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                currentStatus = opt.dataset.status || '';
                filterBtn.classList.toggle('has-filter', !!currentStatus);
                filterMenu.classList.add('hidden');
                applyFilters();
            });
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.orders-filter-wrap')) filterMenu.classList.add('hidden');
        });
    }
}

// Live order status (§5): patch the badge in place so the open drawer survives the update.
async function subscribeToLiveOrderStatus() {
    const userId = await auth.getUserId();
    if (!userId) return;
    subscribeWhenConnected(`/topic/orders/${userId}`, update => {
        // keep the in-memory copy fresh so filters stay correct
        const cached = allOrders.find(o => o.orderId === update.orderId);
        if (cached) cached.status = update.status;

        const badge = ordersList.querySelector(
            `.order-accordion-card[data-order-id="${update.orderId}"] .order-status-badge`);
        if (!badge) { loadOrders(); return; }
        badge.className = `badge order-status-badge ${getStatusBadgeClass(update.status)}`;
        badge.innerHTML = statusBadgeInner(update.status);
    });
}

async function loadOrders() {
    try {
        showLoader();
        allOrders = await api.get('/api/orders') || [];
        applyFilters();
    } catch (err) {
        showToast(err.message || 'Failed to load order history.', 'error');
        ordersList.innerHTML = `<p style="color: var(--danger); text-align: center;">Error loading orders: ${err.message}</p>`;
    } finally {
        hideLoader();
    }
}

// Client-side search (by order id) + status filter over the loaded orders.
function applyFilters() {
    if (!allOrders.length) {
        ordersList.style.display = 'none';
        noMatchState.style.display = 'none';
        emptyOrdersState.style.display = 'flex';
        return;
    }
    emptyOrdersState.style.display = 'none';

    const filtered = allOrders.filter(o => {
        const matchesSearch = !currentSearch || String(o.orderId).includes(currentSearch.replace('#', ''));
        const matchesStatus = !currentStatus || o.status === currentStatus;
        return matchesSearch && matchesStatus;
    });

    if (!filtered.length) {
        ordersList.style.display = 'none';
        noMatchState.style.display = 'flex';
        return;
    }
    noMatchState.style.display = 'none';
    ordersList.style.display = 'flex';
    ordersList.innerHTML = '';
    filtered.forEach(order => ordersList.appendChild(renderOrderCard(order)));
}

// ---- status badge (colour + icon) ----
function getStatusBadgeClass(status) {
    switch (status?.toUpperCase()) {
        case 'DELIVERED': return 'badge-success';
        case 'CONFIRMED':
        case 'PACKED':
        case 'SHIPPED': return 'badge-info';
        case 'CANCELLED': return 'badge-danger';
        case 'PLACED':
        default: return 'badge-warning';
    }
}

function statusIcon(status) {
    const s = (status || '').toUpperCase();
    const p = {
        DELIVERED: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        SHIPPED: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
        CANCELLED: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        PLACED: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    };
    const d = p[s] || (s === 'CONFIRMED' || s === 'PACKED' ? p.DELIVERED : p.PLACED);
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="${d}" /></svg>`;
}

function statusBadgeInner(status) {
    return `${statusIcon(status)}<span>${status}</span>`;
}

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const FALLBACK_IMG = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSIjY2JkNWUxIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEiIGQ9Ik0yLjI1IDE1YTQuNSA0LjUgMCAwMDQuNSA0LjVIMThhMy43NSAzLjc1IDAgMDAxLjMzMi03LjI1NyAzIDMgMCAwMC0zLjc1OC0zLjg0OCA1LjI1IDUuMjUgMCAwMC0xMC4yMzMgMi4zM0E0LjUwMiA0LjUwMiAwIDAwMi4yNSAxNXoiIC8+PC9zdmc+`;

function renderOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-accordion-card';
    card.dataset.orderId = order.orderId;

    const dateStr = new Date(order.orderDate).toLocaleDateString(undefined,
        { year: 'numeric', month: 'short', day: 'numeric' });
    const itemsCount = order.items ? order.items.reduce((a, i) => a + i.quantity, 0) : 0;
    const addr = order.shippingAddress;
    const payColor = order.paymentStatus === 'SUCCESS' ? 'var(--success)'
        : (order.paymentStatus === 'FAILED' ? 'var(--danger)' : 'var(--warning)');

    const canCancel = order.status === 'PLACED'
        && (new Date(order.orderDate).getTime() + 86400000 - Date.now()) > 0;

    card.innerHTML = `
        <div class="order-header-summary">
            <div>
                <span class="order-header-label">Order ID</span>
                <span class="order-header-val order-id-val">#${order.orderId}</span>
            </div>
            <div>
                <span class="order-header-label">Date Placed</span>
                <span class="order-header-val">${dateStr}</span>
            </div>
            <div>
                <span class="order-header-label">Total Amount</span>
                <span class="order-header-val order-total-val">₹${Number(order.totalAmount).toFixed(2)}</span>
            </div>
            <div>
                <span class="order-header-label">Status</span>
                <span class="badge order-status-badge ${getStatusBadgeClass(order.status)}">${statusBadgeInner(order.status)}</span>
            </div>
            <div class="order-header-right">
                <span class="order-items-count">${itemsCount} ${itemsCount === 1 ? 'item' : 'items'}</span>
                <button type="button" class="btn btn-outline btn-sm view-details-btn">View Details</button>
                <span class="accordion-arrow">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="18" height="18">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                </span>
            </div>
        </div>

        <div class="order-details-drawer">
            <div class="order-drawer-grid">
                <div class="order-drawer-panel">
                    <h4 class="receipt-title">Order Items <span class="receipt-subcount">(${itemsCount} ${itemsCount === 1 ? 'item' : 'items'})</span></h4>
                    <div class="order-items-list">
                        ${order.items.map(item => `
                            <div class="order-item-row-simple">
                                <img src="${item.imageUrl || FALLBACK_IMG}" class="order-item-img-simple" alt="${esc(item.productName)}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
                                <div class="order-item-info-simple">
                                    <a href="product.html?id=${item.productId}" class="order-item-name-simple">${esc(item.productName)}</a>
                                    <span class="order-item-meta-simple">Qty: ${item.quantity} • ₹${Number(item.price).toFixed(2)}</span>
                                </div>
                                <div class="order-item-subtotal-simple">₹${Number(item.subtotal).toFixed(2)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="order-drawer-panel order-address-panel">
                    <h4 class="receipt-title">Delivery Address</h4>
                    ${addr ? `
                        <p class="addr-name">${esc(addr.name)}</p>
                        <p class="addr-line">${esc(addr.line1)}</p>
                        <p class="addr-line">${esc(addr.city)}${addr.state ? ', ' + esc(addr.state) : ''} - ${esc(addr.pincode)}</p>
                        <p class="addr-line">India</p>
                        ${addr.phone ? `<p class="addr-line addr-phone">Phone: ${esc(addr.phone)}</p>` : ''}
                    ` : `<p class="addr-line" style="color:var(--text-muted);">No address on file.</p>`}
                </div>

                <div class="order-drawer-panel order-delivery-receipt">
                    <h4 class="receipt-title">Transaction Receipt</h4>
                    <div class="receipt-rows">
                        <div class="receipt-row"><span>Payment Method:</span><span class="receipt-val">${order.paymentMethod || 'N/A'}</span></div>
                        <div class="receipt-row"><span>Payment Status:</span><span class="receipt-val" style="color:${payColor};">${order.paymentStatus || 'PENDING'}</span></div>
                        <div class="receipt-row receipt-ref"><span>Transaction Ref:</span><span class="receipt-mono">${esc(order.transactionRef) || 'N/A'}</span></div>
                        <div class="receipt-row receipt-total"><span>Grand Total:</span><span>₹${Number(order.totalAmount).toFixed(2)}</span></div>
                    </div>
                    ${canCancel ? `
                        <button class="btn btn-outline-danger btn-sm cancel-order-btn" data-id="${order.orderId}">
                            Cancel Order (<span id="countdown-${order.orderId}">--:--:--</span>)
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    wireCancelCountdown(card, order, canCancel);

    // Header click toggles the inline accordion; the explicit "View Details" button opens the
    // full order-detail page (and must not also toggle the accordion).
    const header = card.querySelector('.order-header-summary');
    header.addEventListener('click', () => card.classList.toggle('open'));
    const viewBtn = card.querySelector('.view-details-btn');
    if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = `order-detail.html?id=${order.orderId}`;
        });
    }

    return card;
}

function wireCancelCountdown(card, order, canCancel) {
    if (!canCancel) return;
    const deadline = new Date(order.orderDate).getTime() + 86400000;
    const pad = n => String(n).padStart(2, '0');
    let intervalId;
    const tick = () => {
        const remaining = deadline - Date.now();
        const span = card.querySelector(`#countdown-${order.orderId}`);
        const btn = card.querySelector('.cancel-order-btn');
        if (remaining <= 0) {
            clearInterval(intervalId);
            if (btn) btn.disabled = true;
            if (span) span.textContent = '00:00:00';
            return;
        }
        if (span) {
            const h = Math.floor(remaining / 3600000);
            const m = Math.floor((remaining % 3600000) / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            span.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
        }
    };
    setTimeout(tick, 0);
    intervalId = setInterval(tick, 1000);

    const cancelBtn = card.querySelector('.cancel-order-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Cancel this order? This restores product inventory.')) return;
            try {
                showLoader();
                await api.post(`/api/orders/${order.orderId}/cancel`);
                showToast('Order cancelled successfully!', 'success');
                clearInterval(intervalId);
                await loadOrders();
            } catch (err) {
                showToast(err.message || 'Failed to cancel order.', 'error');
            } finally {
                hideLoader();
            }
        });
    }
}
