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
    return `<div class="order-detail-error"><p>${esc(msg)}</p>
        <a href="orders.html" class="btn btn-secondary btn-sm">Back to My Orders</a></div>`;
}

// ---------- render ----------
function render(o) {
    const fallbackImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSIjY2JkNWUxIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEiIGQ9Ik0yLjI1IDE1YTQuNSA0LjUgMCAwMDQuNSA0LjVIMThhMy43NSAzLjc1IDAgMDAxLjMzMi03LjI1NyAzIDMgMCAwMC0zLjc1OC0zLjg0OCA1LjI1IDUuMjUgMCAwMC0xMC4yMzMgMi4zM0E0LjUwMiA0LjUwMiAwIDAwMi4yNSAxNXoiIC8+PC9zdmc+';
    const itemCount = o.items.reduce((a, i) => a + i.quantity, 0);
    const subtotal = o.items.reduce((a, i) => a + Number(i.subtotal), 0);
    const addr = o.shippingAddress;
    const paid = o.paymentStatus === 'SUCCESS';
    const estDelivery = new Date(new Date(o.orderDate).getTime() + 5 * 24 * 60 * 60 * 1000);

    const itemsHtml = o.items.map(i => `
        <div class="od-item">
            <img src="${i.imageUrl || fallbackImage}" class="od-item-img" alt="${esc(i.productName)}"
                 loading="lazy" onerror="this.src='${fallbackImage}'">
            <div class="od-item-info">
                <a href="product.html?id=${i.productId}" class="od-item-name">${esc(i.productName)}</a>
                <div class="od-item-meta">Qty: ${i.quantity}&nbsp;&nbsp;|&nbsp;&nbsp;Unit Price: ${inr(i.price)}</div>
            </div>
            <div class="od-item-total">${inr(i.subtotal)}</div>
        </div>`).join('');

    const addressHtml = addr ? `
        <p class="od-addr-name">${esc(addr.name || auth.getUser()?.name || '')}</p>
        <p>${esc(addr.line1)}</p>
        <p>${esc(addr.city)}${addr.state ? ', ' + esc(addr.state) : ''} - ${esc(addr.pincode)}</p>
        <p>India</p>
        ${addr.phone ? `<p class="od-addr-phone">Phone: ${esc(addr.phone)}</p>` : ''}
    ` : '<p class="od-muted">No delivery address on file.</p>';

    root.innerHTML = `
        <nav class="od-breadcrumb">
            <a href="index.html">Home</a> <span>›</span>
            <a href="orders.html">My Orders</a> <span>›</span>
            <span class="current">Order #${o.orderId}</span>
        </nav>

        <div class="od-header">
            <div>
                <h1 class="od-title">Order #${o.orderId}</h1>
                <span class="badge od-badge ${badgeClass(o.status)}">${statusIcon(o.status)} ${o.status}</span>
                <p class="od-placed">Placed on ${fmtDateTime(o.orderDate)}</p>
            </div>
            <div class="od-summary-card">
                <div><span class="od-k">ORDER ID</span><span class="od-v">#${o.orderId}</span></div>
                <div><span class="od-k">TOTAL AMOUNT</span><span class="od-v">${inr(o.totalAmount)}</span>
                    <span class="od-sub ${paid ? 'ok' : ''}">${o.paymentStatus} (${o.paymentMethod || '—'})</span></div>
                <div><span class="od-k">PAYMENT METHOD</span><span class="od-v">${esc(o.paymentMethod || '—')}</span></div>
                <div><span class="od-k">STATUS</span><span class="badge od-badge ${badgeClass(o.status)}">${o.status}</span></div>
            </div>
        </div>

        <div class="od-grid">
            <!-- Order items -->
            <section class="od-card od-items">
                <h3 class="od-card-title">Order Items <span class="od-muted">(${itemCount} ${itemCount === 1 ? 'item' : 'items'})</span></h3>
                <div class="od-items-list">${itemsHtml}</div>
                <div class="od-totals">
                    <div class="od-total-row"><span>Subtotal (${itemCount} ${itemCount === 1 ? 'item' : 'items'})</span><span>${inr(subtotal)}</span></div>
                    <div class="od-total-row"><span>Shipping Charge</span><span class="ok">FREE</span></div>
                    <div class="od-total-row"><span>Discount</span><span>- ${inr(0)}</span></div>
                    <div class="od-total-row grand"><span>Grand Total</span><span>${inr(o.totalAmount)}</span></div>
                </div>
            </section>

            <!-- Middle column: delivery + shipping -->
            <div class="od-col">
                <section class="od-card">
                    <h3 class="od-card-title">Delivery Address</h3>
                    <div class="od-addr">${addressHtml}</div>
                </section>
                <section class="od-card">
                    <h3 class="od-card-title">Shipping Information</h3>
                    <div class="od-info-rows">
                        <div><span>Courier Partner</span><span>${esc(o.courierPartner) || '<span class="od-muted">Assigned on dispatch</span>'}</span></div>
                        <div><span>Tracking Number</span><span>${esc(o.trackingNumber) || '<span class="od-muted">Not yet available</span>'}</span></div>
                        <div><span>Estimated Delivery</span><span>${o.status === 'DELIVERED' ? 'Delivered' : fmtDate(estDelivery)}</span></div>
                    </div>
                </section>
            </div>

            <!-- Right column: order info + track -->
            <div class="od-col">
                <section class="od-card">
                    <h3 class="od-card-title">Order Information</h3>
                    <div class="od-info-rows">
                        <div><span>Order ID</span><span>#${o.orderId}</span></div>
                        <div><span>Order Date</span><span>${fmtDateTime(o.orderDate)}</span></div>
                        <div><span>Payment Method</span><span>${esc(o.paymentMethod || '—')}</span></div>
                        <div><span>Payment Status</span><span class="${paid ? 'ok' : 'pending'}">${o.paymentStatus}</span></div>
                        <div><span>Transaction Ref</span><span class="mono">${esc(o.transactionRef || '—')}</span></div>
                        <div><span>Invoice</span><button class="od-link-btn" id="od-invoice-inline">Download ↓</button></div>
                    </div>
                </section>
                <button class="btn btn-outline btn-sm od-track-btn" id="od-track-btn">↗ Track Order</button>
            </div>
        </div>

        ${renderTimeline(o, estDelivery)}

        <div class="od-footer-actions">
            <a href="orders.html" class="btn btn-secondary">← Back to My Orders</a>
            <div class="od-footer-right">
                <button class="btn btn-outline" id="od-invoice-btn">⬇ Download Invoice</button>
                <a href="help-center.html" class="btn btn-primary">Need Help?</a>
            </div>
        </div>
    `;

    // Wire actions
    root.querySelector('#od-invoice-btn')?.addEventListener('click', () => downloadInvoice(o));
    root.querySelector('#od-invoice-inline')?.addEventListener('click', () => downloadInvoice(o));
    root.querySelector('#od-track-btn')?.addEventListener('click', () => {
        document.querySelector('.od-timeline')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
}

function renderTimeline(o, estDelivery) {
    if (o.status === 'CANCELLED') {
        return `<section class="od-card od-timeline">
            <h3 class="od-card-title">Order Timeline</h3>
            <p class="od-cancelled">✕ This order was cancelled. Any charged amount is refunded and stock restored.</p>
        </section>`;
    }
    const currentIndex = TIMELINE.findIndex(s => s.key === o.status);
    const steps = TIMELINE.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const cls = done ? 'done' : current ? 'current' : 'pending';
        const mark = done ? icon('M4.5 12.75l6 6 9-13.5')
            : current ? statusIcon(o.status)
            : '<span class="od-dot"></span>';
        let when = '';
        if (i === 0) when = fmtDateTime(o.orderDate);              // real placed timestamp
        else if (step.key === 'DELIVERED' && !done) when = 'Expected ' + fmtDate(estDelivery);
        return `<li class="od-step ${cls}">
            <span class="od-step-mark">${mark}</span>
            <span class="od-step-label">${step.label}</span>
            ${when ? `<span class="od-step-when">${when}</span>` : ''}
        </li>`;
    }).join('');
    return `<section class="od-card od-timeline">
        <h3 class="od-card-title">Order Timeline</h3>
        <ul class="od-steps" style="--current-index:${currentIndex}">${steps}</ul>
    </section>`;
}

// Client-side printable invoice (save-as-PDF via the browser print dialog).
function downloadInvoice(o) {
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) { showToast('Allow pop-ups to download the invoice.', 'error'); return; }
    const rows = o.items.map(i => `<tr>
        <td>${esc(i.productName)}</td><td style="text-align:center;">${i.quantity}</td>
        <td style="text-align:right;">${inr(i.price)}</td><td style="text-align:right;">${inr(i.subtotal)}</td></tr>`).join('');
    const a = o.shippingAddress;
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice #${o.orderId}</title>
        <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{margin:0 0 4px}
        table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #ddd;padding:8px}
        th{text-align:left;background:#f5f5f5}.tot{text-align:right;font-weight:700;font-size:16px;margin-top:12px}
        .muted{color:#666;font-size:13px}</style></head><body>
        <h1>ShopSphere</h1><p class="muted">Tax Invoice — Order #${o.orderId}</p>
        <p class="muted">Date: ${fmtDateTime(o.orderDate)} · Status: ${o.status} · Payment: ${o.paymentStatus} (${o.paymentMethod || '—'})</p>
        ${a ? `<p class="muted">Ship to: ${esc(a.name || '')}, ${esc(a.line1)}, ${esc(a.city)}${a.state ? ', ' + esc(a.state) : ''} - ${esc(a.pincode)}</p>` : ''}
        <table><thead><tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit</th><th style="text-align:right;">Total</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <p class="tot">Grand Total: ${inr(o.totalAmount)}</p>
        <p class="muted">Transaction Ref: ${esc(o.transactionRef || '—')}</p>
        <script>window.onload=function(){window.print();}<\/script></body></html>`);
    win.document.close();
}
