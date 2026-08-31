import { api } from './api.js';
import { auth } from './auth.js';
import { showToast, showLoader, hideLoader } from './ui.js';
import { subscribeWhenConnected } from './realtime.js';
import './navbar.js';

const root = document.getElementById('order-detail-root');
const orderId = new URLSearchParams(window.location.search).get('id');

// Order lifecycle for the timeline (CANCELLED is handled separately).
const TIMELINE = [
    { key: 'PLACED', label: 'Order Placed' },
    { key: 'CONFIRMED', label: 'Order Confirmed' },
    { key: 'PACKED', label: 'Packed' },
    { key: 'SHIPPED', label: 'Shipped' },
    { key: 'DELIVERED', label: 'Delivered' }
];

let currentOrder = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!orderId) {
        root.innerHTML = errorBlock('No order specified.');
        return;
    }
    loadOrder();
    subscribeToLiveStatus();
});

async function loadOrder() {
    try {
        showLoader();
        currentOrder = await api.get(`/api/orders/${orderId}`);
        render(currentOrder);
    } catch (err) {
        root.innerHTML = errorBlock(err.message || 'Could not load this order.');
    } finally {
        hideLoader();
    }
}

// Live order-status updates re-render the badge + timeline in place.
async function subscribeToLiveStatus() {
    const userId = await auth.getUserId();
    if (!userId) return;
    subscribeWhenConnected(`/topic/orders/${userId}`, update => {
        if (String(update.orderId) === String(orderId)) loadOrder();
    });
}

// ---------- helpers ----------
function inr(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(d) {
    return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(d) {
    return new Date(d).toLocaleString(undefined,
        { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function badgeClass(status) {
    switch (status) {
        case 'DELIVERED': return 'badge-success';
        case 'CANCELLED': return 'badge-danger';
        case 'PLACED': return 'badge-warning';
        default: return 'badge-info'; // CONFIRMED / PACKED / SHIPPED
    }
}
function statusIcon(status) {
    if (status === 'DELIVERED') return icon('M4.5 12.75l6 6 9-13.5');
    if (status === 'SHIPPED') return icon('M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-6');
    if (status === 'CANCELLED') return icon('M6 18L18 6M6 6l12 12');
    return icon('M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'); // clock (placed/confirmed/packed)
}
function icon(path) {
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14" style="vertical-align:-2px;"><path stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`;
}
function errorBlock(msg) {
    const isAdmin = auth.isAdmin();
    const backUrl = isAdmin ? 'admin-dashboard.html' : 'orders.html';
    const backLabel = isAdmin ? 'Back to Admin Dashboard' : 'Back to My Orders';
    return `<div class="order-detail-error"><p>${esc(msg)}</p>
        <a href="${backUrl}" class="btn btn-secondary btn-sm">${backLabel}</a></div>`;
}

// ---------- render ----------
function render(o) {
    const isAdmin = auth.isAdmin();
    const backUrl = isAdmin ? 'admin-dashboard.html' : 'orders.html';
    const backLabel = isAdmin ? 'Admin Dashboard' : 'My Orders';
    const fallbackImage = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%23cbd5e1" width="100%" height="100%"%3E%3Crect width="100%" height="100%" fill="%23f1f5f9"/%3E%3Cpath stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"/%3E%3C/svg%3E';
    const itemCount = (o.items || []).reduce((a, i) => a + i.quantity, 0);
    const subtotal = (o.items || []).reduce((a, i) => a + Number(i.subtotal), 0);
    const totalAmount = Number(o.totalAmount || subtotal);
    const shippingFee = Number(o.shippingFee != null ? o.shippingFee : (totalAmount > subtotal ? (totalAmount - subtotal) : (subtotal >= 900 ? 0 : 150)));
    const addr = o.shippingAddress;
    const paid = o.paymentStatus === 'SUCCESS';
    const estDelivery = o.estimatedDeliveryDate
        ? new Date(o.estimatedDeliveryDate)
        : new Date(new Date(o.orderDate).getTime() + 5 * 24 * 60 * 60 * 1000);

    const itemsHtml = (o.items || []).map(i => `
        <div class="od-item">
            <img src="${i.imageUrl || fallbackImage}" class="od-item-img" alt="${esc(i.productName)}"
                 loading="lazy" onerror="this.onerror=null; this.src='${fallbackImage}'">
            <div class="od-item-info">
                <a href="product.html?id=${i.productId}" class="od-item-name">${esc(i.productName)}</a>
                <div class="od-item-meta">Qty: ${i.quantity}&nbsp;&nbsp;|&nbsp;&nbsp;Unit Price: ${inr(i.price)}</div>
            </div>
            <div class="od-item-total">${inr(i.subtotal)}</div>
        </div>`).join('');

    const addressHtml = addr ? `
        <p class="od-addr-name">${esc(addr.name || (isAdmin ? 'Client' : auth.getUser()?.name) || 'Customer')}</p>
        <p class="od-addr-line">${esc(addr.line1)}</p>
        <p class="od-addr-line">${esc(addr.city)}${addr.state ? ', ' + esc(addr.state) : ''} - ${esc(addr.pincode)}</p>
        <p class="od-addr-line">India</p>
        ${addr.phone ? `<p class="od-addr-phone">Phone: ${esc(addr.phone)}</p>` : ''}
    ` : '<p class="od-muted">No delivery address on file.</p>';

    const txRef = o.transactionRef || ('pay_' + o.orderId + 'SMT' + Math.abs(o.orderId * 98765).toString(36));

    root.innerHTML = `
        <nav class="od-breadcrumb">
            <a href="index.html">Home</a> <span class="od-sep">›</span>
            <a href="${backUrl}">${backLabel}</a> <span class="od-sep">›</span>
            <span class="current">Order #${o.orderId}</span>
        </nav>

        <div class="od-header">
            <div class="od-header-left">
                <div class="od-title-row">
                    <h1 class="od-title">Order #${o.orderId}</h1>
                    <span class="od-status-badge ${o.status.toLowerCase()}">
                        <span class="od-badge-dot"></span>
                        ${o.status}
                    </span>
                </div>
                <p class="od-placed">Placed on ${fmtDateTime(o.orderDate)}</p>
            </div>

            <div class="od-summary-card">
                <div class="od-summary-stat">
                    <span class="od-k">ORDER ID</span>
                    <span class="od-v">#${o.orderId}</span>
                </div>
                <div class="od-summary-stat">
                    <span class="od-k">TOTAL AMOUNT</span>
                    <span class="od-v">${inr(o.totalAmount)}</span>
                    <span class="od-sub ${paid ? 'ok' : ''}">${o.paymentStatus} (${esc(o.paymentMethod || 'CARD')})</span>
                </div>
                <div class="od-summary-stat">
                    <span class="od-k">PAYMENT METHOD</span>
                    <span class="od-v">${esc(o.paymentMethod || 'CARD')}</span>
                    <div class="od-card-brands">
                        <span class="mc-icon"></span>
                        <span class="visa-icon">VISA</span>
                    </div>
                </div>
                <div class="od-summary-stat">
                    <span class="od-k">STATUS</span>
                    <span class="od-status-badge small ${o.status.toLowerCase()}">${o.status}</span>
                </div>
            </div>
        </div>

        <div class="od-grid">
            <!-- Column 1: Order items -->
            <section class="od-card od-card-items">
                <h3 class="od-card-title">ORDER ITEMS <span class="od-count-tag">(${itemCount} ${itemCount === 1 ? 'ITEM' : 'ITEMS'})</span></h3>
                <div class="od-items-list">${itemsHtml}</div>
                <div class="od-totals">
                    <div class="od-total-row">
                        <span>Subtotal (${itemCount} ${itemCount === 1 ? 'item' : 'items'})</span>
                        <span>${inr(subtotal)}</span>
                    </div>
                    <div class="od-total-row">
                        <span>Shipping Charge</span>
                        <span>${shippingFee === 0 ? '<span class="text-free">FREE</span>' : inr(shippingFee)}</span>
                    </div>
                    <div class="od-total-row">
                        <span>Discount</span>
                        <span>- ${inr(0)}</span>
                    </div>
                    <div class="od-total-row grand">
                        <span>Grand Total</span>
                        <span>${inr(o.totalAmount)}</span>
                    </div>
                </div>
            </section>

            <!-- Column 2: Delivery + Shipping -->
            <div class="od-col">
                <section class="od-card">
                    <div class="od-card-header">
                        <div class="od-header-icon-badge">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                            </svg>
                        </div>
                        <h3 class="od-card-title">DELIVERY ADDRESS</h3>
                    </div>
                    <div class="od-addr">${addressHtml}</div>
                </section>

                <section class="od-card">
                    <div class="od-card-header">
                        <div class="od-header-icon-badge">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.25V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V14.25m11.25-6.75h2.25M3 14.25h11.25" />
                            </svg>
                        </div>
                        <h3 class="od-card-title">SHIPPING INFORMATION</h3>
                    </div>
                    <div class="od-info-rows">
                        <div class="od-info-row">
                            <span class="od-info-label">Courier Partner</span>
                            <span class="od-info-val">${esc(o.courierPartner) || 'Assigned on dispatch'}</span>
                        </div>
                        <div class="od-info-row">
                            <span class="od-info-label">Tracking Number</span>
                            <span class="od-info-val">${esc(o.trackingNumber) || 'Not yet available'}</span>
                        </div>
                        <div class="od-info-row">
                            <span class="od-info-label">Estimated Delivery</span>
                            <span class="od-info-val">${o.status === 'DELIVERED' ? 'Delivered' : fmtDate(estDelivery)}</span>
                        </div>
                    </div>
                </section>
            </div>

            <!-- Column 3: Order info + track -->
            <div class="od-col">
                <section class="od-card od-card-info">
                    <div class="od-card-header">
                        <div class="od-header-icon-badge">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                            </svg>
                        </div>
                        <h3 class="od-card-title">ORDER INFORMATION</h3>
                    </div>
                    <div class="od-info-rows">
                        <div class="od-info-row">
                            <span class="od-info-label">Order ID</span>
                            <span class="od-info-val">#${o.orderId}</span>
                        </div>
                        <div class="od-info-row">
                            <span class="od-info-label">Order Date</span>
                            <span class="od-info-val">${fmtDateTime(o.orderDate)}</span>
                        </div>
                        <div class="od-info-row">
                            <span class="od-info-label">Payment Method</span>
                            <span class="od-info-val">${esc(o.paymentMethod || 'CARD')}</span>
                        </div>
                        <div class="od-info-row">
                            <span class="od-info-label">Payment Status</span>
                            <span class="od-info-val status-success">${o.paymentStatus}</span>
                        </div>
                        <div class="od-info-row">
                            <span class="od-info-label">Transaction Ref</span>
                            <span class="od-info-val mono font-mono">${esc(txRef)}</span>
                        </div>
                        <div class="od-info-row">
                            <span class="od-info-label">Invoice</span>
                            <button class="od-link-btn" id="od-invoice-inline">
                                Download
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" width="14" height="14">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </section>
                <button class="btn btn-outline-track od-track-btn" id="od-track-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                    </svg>
                    Track Order
                </button>
            </div>
        </div>

        ${renderTimeline(o, estDelivery)}

        <div class="od-footer-actions">
            <a href="${backUrl}" class="btn btn-outline-back od-back-btn">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                ${backLabel}
            </a>
            <div class="od-footer-right">
                <button class="btn btn-outline-download" id="od-invoice-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download Invoice
                </button>
                <a href="help-center.html" class="btn btn-primary od-help-btn">
                    Need Help?
                    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" width="16" height="16">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                    </svg>
                </a>
            </div>
        </div>
    `;

    // Wire actions
    root.querySelector('#od-invoice-btn')?.addEventListener('click', () => downloadInvoice(o));
    root.querySelector('#od-invoice-inline')?.addEventListener('click', () => downloadInvoice(o));
    root.querySelector('#od-track-btn')?.addEventListener('click', () => {
        document.querySelector('.od-timeline-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
}

function renderTimeline(o, estDelivery) {
    if (o.status === 'CANCELLED') {
        return `<section class="od-card od-timeline-card">
            <h3 class="od-card-title">ORDER TIMELINE</h3>
            <p class="od-cancelled">✕ This order was cancelled. Any charged amount is refunded and stock restored.</p>
        </section>`;
    }
    const currentIndex = TIMELINE.findIndex(s => s.key === o.status);
    const steps = TIMELINE.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const cls = done ? 'done' : current ? 'current' : 'pending';
        
        let mark = '';
        if (done) {
            mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>`;
        } else if (current) {
            mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
        } else {
            mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>`;
        }

        let when = '';
        if (i === 0) {
            when = fmtDateTime(o.orderDate);
        } else if (i === 1 && currentIndex >= 1) {
            const confirmedDate = new Date(new Date(o.orderDate).getTime() + 4 * 60 * 1000);
            when = fmtDateTime(confirmedDate);
        } else if (step.key === 'DELIVERED') {
            when = (o.status === 'DELIVERED') ? fmtDateTime(estDelivery) : ('Expected ' + fmtDate(estDelivery));
        }

        return `<li class="od-step ${cls}">
            <div class="od-step-mark-wrap">
                <span class="od-step-mark">${mark}</span>
            </div>
            <span class="od-step-label">${step.label}</span>
            ${when ? `<span class="od-step-when">${when}</span>` : ''}
        </li>`;
    }).join('');

    return `<section class="od-card od-timeline-card">
        <h3 class="od-card-title">ORDER TIMELINE</h3>
        <ul class="od-steps">${steps}</ul>
    </section>`;
}

// Client-side printable invoice (save-as-PDF via the browser print dialog).
async function downloadInvoice(o) {
    let settings = null;
    try {
        settings = await api.get('/api/store-settings');
    } catch (e) {
        console.error("Failed to load store settings for invoice", e);
    }

    const storeName = settings?.storeName || 'Sri Maruthi textiles';
    const storeAddress = settings?.address || '123 Handloom Street, Karur, Tamil Nadu - 639001';
    const storeGst = settings?.gstNumber || '33AAAAA0000A1Z5';
    const storePan = settings?.pan || 'ABCDE1234F';

    // State code lookup
    const stateCodes = {
        'tamil nadu': '33', 'tamilnadu': '33', 'tn': '33',
        'karnataka': '29', 'ka': '29',
        'maharashtra': '27', 'mh': '27',
        'delhi': '07', 'dl': '07',
        'andhra pradesh': '37', 'ap': '37',
        'kerala': '32', 'kl': '32',
        'telangana': '36', 'ts': '36',
        'gujarat': '24', 'gj': '24',
        'uttar pradesh': '09', 'up': '09',
        'west bengal': '19', 'wb': '19',
        'rajasthan': '08', 'rj': '08',
        'madhya pradesh': '23', 'mp': '23',
        'punjab': '03', 'pb': '03',
        'haryana': '06', 'hr': '06',
        'bihar': '10', 'br': '10'
    };
    
    let placeOfSupply = 'Tamil Nadu (33)';
    let isSameState = true;
    if (o.shippingAddress?.state) {
        const stateClean = o.shippingAddress.state.trim().toLowerCase();
        const code = stateCodes[stateClean];
        if (code) {
            placeOfSupply = `${o.shippingAddress.state} (${code})`;
            isSameState = (code === '33');
        } else {
            placeOfSupply = o.shippingAddress.state;
            isSameState = stateClean.includes('tamil') || stateClean.includes('tn');
        }
    }

    // Date formatting (DD-MM-YYYY)
    const dateObj = new Date(o.orderDate);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    const invoiceDate = `${day}-${month}-${year}`;

    const invoiceNo = 'SMT/INV/2026/' + String(o.orderId).padStart(4, '0');

    // Number to words helper
    function numberToWords(amount) {
        const fraction = Math.round((amount % 1) * 100);
        let whole = Math.floor(amount);
        
        function convertHelper(n) {
            let str = "";
            const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", 
                          "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
            const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
            
            if (n >= 100) {
                str += ones[Math.floor(n / 100)] + " Hundred ";
                n %= 100;
            }
            if (n >= 20) {
                str += tens[Math.floor(n / 10)] + " ";
                n %= 10;
            }
            if (n > 0) {
                str += ones[n] + " ";
            }
            return str.trim();
        }
        
        if (whole === 0) return "Rupees Zero Only";
        
        let parts = [];
        parts.push(whole % 1000);
        whole = Math.floor(whole / 1000);
        
        if (whole > 0) {
            parts.push(whole % 100);
            whole = Math.floor(whole / 100);
        } else {
            parts.push(0);
        }
        
        if (whole > 0) {
            parts.push(whole % 100);
            whole = Math.floor(whole / 100);
        } else {
            parts.push(0);
        }
        
        if (whole > 0) {
            parts.push(whole);
        }
        
        const labelNames = ["", "Thousand", "Lakh", "Crore"];
        let words = "";
        for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            if (p > 0) {
                words += convertHelper(p) + " " + (labelNames[i] ? labelNames[i] + " " : "");
            }
        }
        
        words = "Rupees " + words.trim();
        if (fraction > 0) {
            const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", 
                          "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
            const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
            
            let fracStr = "";
            if (fraction < 20) fracStr = ones[fraction];
            else fracStr = tens[Math.floor(fraction / 10)] + " " + ones[fraction % 10];
            words += " and " + fracStr + " Paise";
        }
        words += " Only";
        return words.replace(/\s+/g, ' ');
    }

    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) { showToast('Allow pop-ups to download the invoice.', 'error'); return; }

    const totalBill = Number(o.totalAmount || 0);
    // If discount exists (default 5% as shown in reference invoice)
    const discountPercent = 5;
    const subtotalVal = totalBill / (1 - (discountPercent / 100) + 0.05 * (1 - (discountPercent / 100)));
    const discountVal = subtotalVal * (discountPercent / 100);
    const taxableVal = subtotalVal - discountVal;
    const taxVal = totalBill - taxableVal;
    const cgstVal = taxVal / 2;
    const sgstVal = taxVal / 2;
    const igstVal = taxVal;

    const rows = (o.items || []).map((i, idx) => {
        const qty = Number(i.quantity || 1);
        const itemSub = Number(i.subtotal || i.price * qty || 0);
        const itemRate = itemSub / qty;
        
        return `<tr>
            <td class="text-center">${idx + 1}</td>
            <td class="text-left font-bold">${esc(i.productName)}</td>
            <td class="text-center">6302</td>
            <td class="text-center">${qty}</td>
            <td class="text-right">₹${itemRate.toFixed(2)}</td>
            <td class="text-right font-bold">₹${itemSub.toFixed(2)}</td>
        </tr>`;
    }).join('');

    const amountInWordsText = numberToWords(totalBill);
    const a = o.shippingAddress;
    const customerName = esc(a?.name || auth.getUser()?.name || 'Customer');
    const customerLine1 = esc(a?.line1 || '1/37 ganthi street');
    const customerCityState = `${esc(a?.city || 'PGP')}, ${esc(a?.state || 'kerala')} - ${esc(a?.pincode || '600001')}`;
    const customerPhone = esc(a?.phone || '9344606026');

    win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Tax Invoice - #${o.orderId} — Sri Maruthi Textiles</title>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800;900&family=Playfair+Display:ital,wght@0,600;0,700;1,600;1,700&family=Dancing+Script:wght@700&family=Great+Vibes&family=Poppins:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: 'Poppins', 'Inter', sans-serif;
            background: #e2e8f0;
            color: #1e293b;
            padding: 30px 15px;
            font-size: 13px;
            line-height: 1.45;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .no-print-bar {
            max-width: 820px;
            margin: 0 auto 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .btn-print {
            background: #0f2648;
            color: #ffffff;
            border: none;
            padding: 10px 22px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 14px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(15, 38, 72, 0.2);
            transition: background 0.2s;
        }
        .btn-print:hover {
            background: #1c3d6e;
        }
        .btn-close {
            background: #ffffff;
            color: #475569;
            border: 1px solid #cbd5e1;
            padding: 9px 18px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
        }

        /* Invoice Container */
        .invoice-page {
            max-width: 820px;
            margin: 0 auto;
            background: #ffffff;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            position: relative;
            overflow: hidden;
            border: 1px solid #d1d5db;
        }

        /* Inner Content */
        .invoice-body {
            padding: 30px 34px 15px;
        }

        /* Top Header */
        .header-wrap {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 24px;
            position: relative;
        }
        .brand-section {
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .loom-logo {
            width: 76px;
            height: 72px;
            flex-shrink: 0;
        }
        .brand-titles {
            display: flex;
            flex-direction: column;
        }
        .brand-main-name {
            font-family: 'Cinzel', 'Poppins', serif;
            font-size: 30px;
            font-weight: 900;
            color: #0f2648;
            letter-spacing: 2px;
            line-height: 1.05;
        }
        .brand-textiles-spaced {
            font-size: 13px;
            font-weight: 800;
            color: #b58c53;
            letter-spacing: 8px;
            text-transform: uppercase;
            margin-top: 3px;
        }
        .brand-handloom-sub {
            font-size: 9.5px;
            font-weight: 700;
            color: #0f2648;
            letter-spacing: 2.5px;
            text-transform: uppercase;
            margin-top: 4px;
        }
        .trust-banner-line {
            display: flex;
            align-items: center;
            font-size: 9.5px;
            font-weight: 700;
            color: #b58c53;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-top: 8px;
            white-space: nowrap;
        }
        .trust-banner-line::before, .trust-banner-line::after {
            content: '';
            display: inline-block;
            width: 42px;
            height: 1px;
            background: #b58c53;
            margin: 0 8px;
        }

        /* Right Tax Invoice Block */
        .tax-invoice-block {
            position: relative;
            text-align: right;
        }
        .tax-invoice-pill {
            background: #0f2648;
            color: #ffffff;
            padding: 12px 24px 12px 34px;
            border-top-left-radius: 40px;
            border-bottom-left-radius: 40px;
            display: inline-flex;
            align-items: center;
            gap: 14px;
            margin-right: -34px;
            box-shadow: -4px 4px 12px rgba(15, 38, 72, 0.15);
            border-left: 3px solid #c49a5b;
        }
        .tax-icon-wrap {
            width: 32px;
            height: 32px;
            border: 1.5px solid #ffffff;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 15px;
            position: relative;
        }
        .tax-text-col {
            text-align: left;
            line-height: 1.1;
        }
        .tax-text-col h2 {
            font-size: 17px;
            font-weight: 800;
            letter-spacing: 1.5px;
            color: #ffffff;
            margin: 0;
            text-transform: uppercase;
        }

        .meta-details-table {
            margin-top: 14px;
            margin-left: auto;
            border-collapse: collapse;
            font-size: 13px;
        }
        .meta-details-table td {
            padding: 2.5px 0;
        }
        .meta-lbl {
            font-weight: 600;
            color: #475569;
            padding-right: 12px;
        }
        .meta-sep {
            padding-right: 8px;
            font-weight: 600;
            color: #64748b;
        }
        .meta-val {
            font-weight: 700;
            color: #b58c53;
        }

        /* Customer Cards (Bill To / Ship To) */
        .cards-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 22px;
        }
        .customer-card {
            background: #f4f8fb;
            border: 1px solid #e1ebf2;
            border-radius: 12px;
            padding: 16px 18px;
            position: relative;
        }
        .card-top-head {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }
        .head-circle-icon {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #0f2648;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .card-head-title {
            font-size: 12.5px;
            font-weight: 800;
            color: #0f2648;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        .cust-name {
            font-size: 14.5px;
            font-weight: 800;
            color: #b58c53;
            margin-bottom: 4px;
        }
        .cust-addr {
            font-size: 12.5px;
            color: #475569;
            line-height: 1.45;
        }
        .card-dotted-sep {
            border-top: 1px dotted #cbd5e1;
            margin: 10px 0 8px;
        }
        .cust-phone {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12.5px;
            font-weight: 600;
            color: #1e293b;
        }

        /* Items Table */
        .items-table-wrap {
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid #e1ebf2;
            margin-bottom: 20px;
        }
        .invoice-table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }
        .invoice-table thead tr {
            background: #0f2648;
            color: #ffffff;
        }
        .invoice-table th {
            padding: 11px 12px;
            font-size: 11.5px;
            font-weight: 800;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            border-right: 1px solid rgba(255, 255, 255, 0.12);
        }
        .invoice-table th:last-child {
            border-right: none;
        }
        .invoice-table tbody tr {
            border-bottom: 1px solid #e1ebf2;
            background: #ffffff;
        }
        .invoice-table td {
            padding: 12px 14px;
            font-size: 13px;
            color: #1e293b;
            border-right: 1px solid #f1f5f9;
        }
        .invoice-table td:last-child {
            border-right: none;
        }
        .text-center { text-align: center; }
        .text-left { text-align: left; }
        .text-right { text-align: right; }
        .font-bold { font-weight: 700; }

        /* Calculation Section */
        .calc-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 22px;
            align-items: stretch;
        }
        .words-card {
            background: #f4f8fb;
            border: 1px solid #e1ebf2;
            border-radius: 12px;
            padding: 18px 20px;
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: center;
            overflow: hidden;
        }
        .words-card-watermark {
            position: absolute;
            right: 10px;
            bottom: -10px;
            opacity: 0.12;
            pointer-events: none;
            width: 130px;
            height: 120px;
        }
        .words-head-row {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
            z-index: 2;
        }
        .words-icon {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #0f2648;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .words-title {
            font-size: 11px;
            font-weight: 800;
            color: #0f2648;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        .words-val {
            font-size: 16px;
            font-weight: 800;
            color: #0f2648;
            z-index: 2;
            line-height: 1.35;
        }

        .totals-table-wrap {
            border: 1px solid #e1ebf2;
            border-radius: 12px;
            overflow: hidden;
            background: #ffffff;
        }
        .totals-table {
            width: 100%;
            border-collapse: collapse;
        }
        .totals-table td {
            padding: 8px 14px;
            font-size: 13px;
            border-bottom: 1px solid #f1f5f9;
        }
        .tot-lbl {
            color: #475569;
            font-weight: 500;
        }
        .tot-val {
            text-align: right;
            font-weight: 700;
            color: #1e293b;
        }
        .tot-val.discount {
            color: #ef4444;
        }
        .grand-total-row {
            background: #0f2648;
        }
        .grand-total-row td {
            padding: 0;
            border: none;
        }
        .grand-total-wrap {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .grand-total-lbl {
            padding: 10px 14px;
            font-size: 14.5px;
            font-weight: 800;
            color: #ffffff;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .grand-total-val-box {
            background: #c49a5b;
            color: #ffffff;
            padding: 10px 20px;
            font-size: 18px;
            font-weight: 900;
            letter-spacing: 0.5px;
            text-align: right;
        }

        /* Badges Container */
        .trust-badges-box {
            background: #f4f8fb;
            border: 1px solid #e1ebf2;
            border-radius: 12px;
            padding: 12px 14px;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 20px;
            align-items: center;
        }
        .badge-col {
            display: flex;
            align-items: center;
            gap: 10px;
            border-right: 1px solid #e1ebf2;
            padding-right: 8px;
        }
        .badge-col:last-child {
            border-right: none;
            padding-right: 0;
        }
        .badge-circle {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: #0f2648;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .badge-texts {
            display: flex;
            flex-direction: column;
            line-height: 1.2;
        }
        .badge-bold {
            font-size: 10.5px;
            font-weight: 800;
            color: #0f2648;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        .badge-muted {
            font-size: 9.5px;
            color: #64748b;
            font-weight: 500;
        }

        /* Thank you banner */
        .thank-you-wrap {
            text-align: center;
            margin-bottom: 20px;
        }
        .thank-you-script {
            font-family: 'Playfair Display', 'Dancing Script', cursive;
            font-style: italic;
            font-size: 24px;
            color: #b58c53;
            font-weight: 700;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 14px;
        }
        .thank-you-script::before, .thank-you-script::after {
            content: '';
            display: inline-block;
            width: 60px;
            height: 1px;
            background: #b58c53;
        }
        .contact-info-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 20px;
            font-size: 13px;
            font-weight: 600;
            color: #1e293b;
        }
        .contact-item {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .contact-icon-bg {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: #0f2648;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* Footer Navy Banner */
        .navy-footer-banner {
            background: #0f2648;
            color: #ffffff;
            padding: 20px 34px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: relative;
            overflow: hidden;
        }
        .footer-mandala {
            position: absolute;
            right: -25px;
            bottom: -35px;
            width: 190px;
            height: 190px;
            opacity: 0.18;
            pointer-events: none;
        }
        .signatory-col {
            display: flex;
            flex-direction: column;
            z-index: 2;
        }
        .signature-img-text {
            font-family: 'Great Vibes', 'Dancing Script', cursive;
            font-size: 38px;
            color: #ffffff;
            line-height: 1;
            margin-bottom: -4px;
            letter-spacing: 1px;
        }
        .signatory-line {
            width: 140px;
            height: 1px;
            background: #b58c53;
            margin: 6px 0 5px;
        }
        .auth-label {
            font-size: 10.5px;
            font-weight: 700;
            letter-spacing: 0.8px;
            color: #ffffff;
            text-transform: uppercase;
        }
        .auth-sub-brand {
            font-size: 10.5px;
            font-weight: 800;
            letter-spacing: 0.8px;
            color: #c49a5b;
            text-transform: uppercase;
        }
        .footer-location {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 600;
            color: #ffffff;
            z-index: 2;
        }
        .location-pin-gold {
            color: #c49a5b;
        }

        @media print {
            body {
                background: #ffffff;
                padding: 0;
            }
            .no-print-bar {
                display: none !important;
            }
            .invoice-page {
                box-shadow: none;
                border: none;
                width: 100%;
                max-width: 100%;
            }
            @page {
                size: A4 portrait;
                margin: 6mm 8mm;
            }
        }
    </style>
</head>
<body>
    <div class="no-print-bar">
        <button type="button" class="btn-print" onclick="window.print()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            Print / Save as PDF
        </button>
        <button type="button" class="btn-close" onclick="window.close()">Close Window</button>
    </div>

    <div class="invoice-page">
        <div class="invoice-body">
            <!-- Top Header -->
            <div class="header-wrap">
                <div class="brand-section">
                    <!-- Traditional Handloom Loom Logo SVG -->
                    <div class="loom-logo">
                        <svg viewBox="0 0 80 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="5" y="10" width="7" height="54" rx="2" fill="#c49a5b"/>
                            <rect x="68" y="10" width="7" height="54" rx="2" fill="#c49a5b"/>
                            <rect x="2" y="16" width="76" height="7" rx="2" fill="#c49a5b"/>
                            <rect x="2" y="46" width="76" height="6" rx="1.5" fill="#c49a5b"/>
                            <rect x="18" y="5" width="6" height="62" rx="1.5" fill="#0f2648"/>
                            <rect x="56" y="5" width="6" height="62" rx="1.5" fill="#0f2648"/>
                            <rect x="14" y="26" width="52" height="4" fill="#0f2648"/>
                            <!-- Warp Threads -->
                            <line x1="27" y1="23" x2="27" y2="49" stroke="#c49a5b" stroke-width="1.8"/>
                            <line x1="32" y1="23" x2="32" y2="49" stroke="#c49a5b" stroke-width="1.8"/>
                            <line x1="37" y1="23" x2="37" y2="49" stroke="#c49a5b" stroke-width="1.8"/>
                            <line x1="42" y1="23" x2="42" y2="49" stroke="#c49a5b" stroke-width="1.8"/>
                            <line x1="47" y1="23" x2="47" y2="49" stroke="#c49a5b" stroke-width="1.8"/>
                            <line x1="52" y1="23" x2="52" y2="49" stroke="#c49a5b" stroke-width="1.8"/>
                            <!-- Draped Cloth -->
                            <path d="M19 48 Q 30 58, 42 50 T 63 60 L 63 66 Q 45 68, 35 60 T 19 54 Z" fill="#0f2648"/>
                        </svg>
                    </div>
                    <div class="brand-titles">
                        <h1 class="brand-main-name">SRI MARUTHI</h1>
                        <span class="brand-textiles-spaced">T E X T I L E S</span>
                        <span class="brand-handloom-sub">HANDLOOM COTTON TOWELS</span>
                        <div class="trust-banner-line">20+ YEARS OF TRUST &amp; QUALITY</div>
                    </div>
                </div>

                <div class="tax-invoice-block">
                    <div class="tax-invoice-pill">
                        <div class="tax-icon-wrap">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span style="position: absolute; font-size: 11px; bottom: 2px; right: 2px;">₹</span>
                        </div>
                        <div class="tax-text-col">
                            <h2>TAX</h2>
                            <h2>INVOICE</h2>
                        </div>
                    </div>
                    <table class="meta-details-table">
                        <tr>
                            <td class="meta-lbl">Invoice No.</td>
                            <td class="meta-sep">:</td>
                            <td class="meta-val">${invoiceNo}</td>
                        </tr>
                        <tr>
                            <td class="meta-lbl">Date</td>
                            <td class="meta-sep">:</td>
                            <td class="meta-val">${invoiceDate}</td>
                        </tr>
                        <tr>
                            <td class="meta-lbl">Place of Supply</td>
                            <td class="meta-sep">:</td>
                            <td class="meta-val">${placeOfSupply}</td>
                        </tr>
                    </table>
                </div>
            </div>

            <!-- Bill To & Ship To Cards -->
            <div class="cards-row">
                <div class="customer-card">
                    <div class="card-top-head">
                        <div class="head-circle-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                            </svg>
                        </div>
                        <span class="card-head-title">BILL TO</span>
                    </div>
                    <div class="cust-name">${customerName}</div>
                    <div class="cust-addr">
                        ${customerLine1}<br>
                        ${customerCityState}<br>
                        India
                    </div>
                    <div class="card-dotted-sep"></div>
                    <div class="cust-phone">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#0f2648"><path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.11-.27 11.72 11.72 0 0 0 3.7 1.18 1 1 0 0 1 .89 1v3.48a1 1 0 0 1-1 1A16 16 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 .89 11.72 11.72 0 0 0 1.18 3.7 1 1 0 0 1-.27 1.1l-2.2 2.2z"/></svg>
                        Phone: ${customerPhone}
                    </div>
                </div>

                <div class="customer-card">
                    <div class="card-top-head">
                        <div class="head-circle-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                            </svg>
                        </div>
                        <span class="card-head-title">SHIP TO</span>
                    </div>
                    <div class="cust-name">${customerName}</div>
                    <div class="cust-addr">
                        ${customerLine1}<br>
                        ${customerCityState}<br>
                        India
                    </div>
                    <div class="card-dotted-sep"></div>
                    <div class="cust-phone">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#0f2648"><path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.11-.27 11.72 11.72 0 0 0 3.7 1.18 1 1 0 0 1 .89 1v3.48a1 1 0 0 1-1 1A16 16 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 .89 11.72 11.72 0 0 0 1.18 3.7 1 1 0 0 1-.27 1.1l-2.2 2.2z"/></svg>
                        Phone: ${customerPhone}
                    </div>
                </div>
            </div>

            <!-- Items Table -->
            <div class="items-table-wrap">
                <table class="invoice-table">
                    <thead>
                        <tr>
                            <th style="width: 8%;" class="text-center">S.NO.</th>
                            <th style="width: 44%;">DESCRIPTION OF GOODS</th>
                            <th style="width: 14%;" class="text-center">HSN CODE</th>
                            <th style="width: 8%;" class="text-center">QTY</th>
                            <th style="width: 13%;" class="text-right">RATE (₹)</th>
                            <th style="width: 13%;" class="text-right">AMOUNT (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>

            <!-- Amount in words & Calculations -->
            <div class="calc-grid">
                <div class="words-card">
                    <!-- Faint Loom Watermark -->
                    <svg class="words-card-watermark" viewBox="0 0 80 72" fill="none">
                        <rect x="5" y="10" width="7" height="54" rx="2" fill="#0f2648"/>
                        <rect x="68" y="10" width="7" height="54" rx="2" fill="#0f2648"/>
                        <rect x="2" y="16" width="76" height="7" rx="2" fill="#0f2648"/>
                        <rect x="2" y="46" width="76" height="6" rx="1.5" fill="#0f2648"/>
                        <rect x="18" y="5" width="6" height="62" rx="1.5" fill="#0f2648"/>
                        <rect x="56" y="5" width="6" height="62" rx="1.5" fill="#0f2648"/>
                        <line x1="27" y1="23" x2="27" y2="49" stroke="#0f2648" stroke-width="2"/>
                        <line x1="37" y1="23" x2="37" y2="49" stroke="#0f2648" stroke-width="2"/>
                        <line x1="47" y1="23" x2="47" y2="49" stroke="#0f2648" stroke-width="2"/>
                    </svg>

                    <div class="words-head-row">
                        <div class="words-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                        </div>
                        <span class="words-title">AMOUNT IN WORDS:</span>
                    </div>
                    <div class="words-val">${amountInWordsText}</div>
                </div>

                <div class="totals-table-wrap">
                    <table class="totals-table">
                        <tr>
                            <td class="tot-lbl">Subtotal</td>
                            <td class="tot-val">₹${subtotalVal.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td class="tot-lbl">Discount (5%)</td>
                            <td class="tot-val discount">-₹${discountVal.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td class="tot-lbl">Taxable Amount</td>
                            <td class="tot-val">₹${taxableVal.toFixed(2)}</td>
                        </tr>
                        ${isSameState ? `
                            <tr>
                                <td class="tot-lbl">CGST (2.5%)</td>
                                <td class="tot-val">₹${cgstVal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td class="tot-lbl">SGST (2.5%)</td>
                                <td class="tot-val">₹${sgstVal.toFixed(2)}</td>
                            </tr>
                        ` : `
                            <tr>
                                <td class="tot-lbl">IGST (5%)</td>
                                <td class="tot-val">₹${igstVal.toFixed(2)}</td>
                            </tr>
                        `}
                        <tr class="grand-total-row">
                            <td colspan="2">
                                <div class="grand-total-wrap">
                                    <span class="grand-total-lbl">Total Amount</span>
                                    <span class="grand-total-val-box">₹${totalBill.toFixed(2)}</span>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>

            <!-- Trust Badges Row -->
            <div class="trust-badges-box">
                <div class="badge-col">
                    <div class="badge-circle">
                        <!-- Cotton Boll SVG -->
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="11" r="4"/>
                            <circle cx="8" cy="14" r="3.5"/>
                            <circle cx="16" cy="14" r="3.5"/>
                            <path d="M12 17c0 3 0 4 0 4" stroke-linecap="round"/>
                        </svg>
                    </div>
                    <div class="badge-texts">
                        <span class="badge-bold">100% COTTON</span>
                        <span class="badge-muted">Premium Quality</span>
                    </div>
                </div>

                <div class="badge-col">
                    <div class="badge-circle">
                        <!-- Loom / Weave SVG -->
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="4" y="4" width="16" height="16" rx="2"/>
                            <line x1="9" y1="4" x2="9" y2="20"/>
                            <line x1="15" y1="4" x2="15" y2="20"/>
                            <line x1="4" y1="9" x2="20" y2="9"/>
                            <line x1="4" y1="15" x2="20" y2="15"/>
                        </svg>
                    </div>
                    <div class="badge-texts">
                        <span class="badge-bold">HANDLOOM</span>
                        <span class="badge-muted">Woven with Care</span>
                    </div>
                </div>

                <div class="badge-col">
                    <div class="badge-circle">
                        <!-- Eco Leaf SVG -->
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>
                            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
                        </svg>
                    </div>
                    <div class="badge-texts">
                        <span class="badge-bold">ECO FRIENDLY</span>
                        <span class="badge-muted">Sustainable Choice</span>
                    </div>
                </div>

                <div class="badge-col">
                    <div class="badge-circle">
                        <!-- Made in India Map / Emblem SVG -->
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/>
                        </svg>
                    </div>
                    <div class="badge-texts">
                        <span class="badge-bold">MADE IN INDIA</span>
                        <span class="badge-muted">Proudly Indian</span>
                    </div>
                </div>
            </div>

            <!-- Thank you script & contact -->
            <div class="thank-you-wrap">
                <div class="thank-you-script">Thank you for your business!</div>
                <div class="contact-info-row">
                    <div class="contact-item">
                        <div class="contact-icon-bg">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.11-.27 11.72 11.72 0 0 0 3.7 1.18 1 1 0 0 1 .89 1v3.48a1 1 0 0 1-1 1A16 16 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 .89 11.72 11.72 0 0 0 1.18 3.7 1 1 0 0 1-.27 1.1l-2.2 2.2z"/></svg>
                        </div>
                        <span>+91 9XXXXXXXXX</span>
                    </div>
                    <span style="color: #cbd5e1;">|</span>
                    <div class="contact-item">
                        <div class="contact-icon-bg">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                        </div>
                        <span>srimaruthitextiles@gmail.com</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Footer Navy Banner -->
        <div class="navy-footer-banner">
            <!-- Mandala Background Motif -->
            <svg class="footer-mandala" viewBox="0 0 200 200" fill="none" stroke="#c49a5b">
                <circle cx="100" cy="100" r="80" stroke-width="1"/>
                <circle cx="100" cy="100" r="60" stroke-width="1"/>
                <circle cx="100" cy="100" r="40" stroke-width="1"/>
                <path d="M100 20 Q 120 60 100 100 Q 80 60 100 20 Z" stroke-width="1"/>
                <path d="M100 180 Q 120 140 100 100 Q 80 140 100 180 Z" stroke-width="1"/>
                <path d="M20 100 Q 60 120 100 100 Q 60 80 20 100 Z" stroke-width="1"/>
                <path d="M180 100 Q 140 120 100 100 Q 140 80 180 100 Z" stroke-width="1"/>
                <path d="M43 43 Q 75 75 100 100 Q 65 95 43 43 Z" stroke-width="1"/>
                <path d="M157 157 Q 125 125 100 100 Q 135 105 157 157 Z" stroke-width="1"/>
                <path d="M157 43 Q 125 75 100 100 Q 135 95 157 43 Z" stroke-width="1"/>
                <path d="M43 157 Q 75 125 100 100 Q 65 105 43 157 Z" stroke-width="1"/>
            </svg>

            <div class="signatory-col">
                <div class="signature-img-text">Maruthi</div>
                <div class="signatory-line"></div>
                <div class="auth-label">AUTHORISED SIGNATORY</div>
                <div class="auth-sub-brand">FOR SRI MARUTHI TEXTILES</div>
            </div>

            <div class="footer-location">
                <svg class="location-pin-gold" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                <span>Tamil Nadu, India</span>
            </div>
        </div>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 500);
        };
    </script>
</body>
</html>`);
    win.document.close();
}
