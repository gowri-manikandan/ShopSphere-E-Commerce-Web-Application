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
    const fallbackImage = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%23cbd5e1" width="100%" height="100%"%3E%3Crect width="100%" height="100%" fill="%23f1f5f9"/%3E%3Cpath stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"/%3E%3C/svg%3E';
    const itemCount = o.items.reduce((a, i) => a + i.quantity, 0);
    const subtotal = o.items.reduce((a, i) => a + Number(i.subtotal), 0);
    const addr = o.shippingAddress;
    const paid = o.paymentStatus === 'SUCCESS';
    const estDelivery = o.estimatedDeliveryDate ? new Date(o.estimatedDeliveryDate) : new Date(new Date(o.orderDate).getTime() + 5 * 24 * 60 * 60 * 1000);

    const itemsHtml = o.items.map(i => `
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

    const win = window.open('', '_blank', 'width=850,height=950');
    if (!win) { showToast('Allow pop-ups to download the invoice.', 'error'); return; }

    const rows = o.items.map((i, idx) => {
        const price = Number(i.price || 0);
        const subtotal = Number(i.subtotal || 0);
        const qty = Number(i.quantity || 0);
        
        // Adjust rate and subtotal so the table sum matches the subtotal line
        const adjustedRate = price / 0.9975;
        const adjustedSubtotal = subtotal / 0.9975;
        
        return `<tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td><strong>${esc(i.productName)}</strong></td>
            <td style="text-align:center;">6302</td>
            <td style="text-align:center;">${qty}</td>
            <td style="text-align:right;">${inr(adjustedRate)}</td>
            <td style="text-align:right; font-weight: 600;">${inr(adjustedSubtotal)}</td>
        </tr>`;
    }).join('');

    const totalBill = Number(o.totalAmount || 0);
    const subtotalVal = totalBill / 0.9975;
    const discountVal = subtotalVal * 0.05;
    const taxableVal = totalBill / 1.05;
    const cgstVal = taxableVal * 0.025;
    const sgstVal = taxableVal * 0.025;
    const igstVal = taxableVal * 0.05;

    const amountInWordsText = numberToWords(totalBill);
    const a = o.shippingAddress;

    win.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Tax Invoice - #${o.orderId}</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Poppins', 'Inter', sans-serif;
            margin: 0;
            padding: 25px 30px;
            color: #222222;
            background: #FFFFFF;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            line-height: 1.4;
            font-size: 14px;
        }
        .invoice-box {
            max-width: 800px;
            margin: auto;
        }
        .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px;
        }
        .header-left {
            width: 65%;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .logo-container {
            width: 85px;
            height: 85px;
            flex-shrink: 0;
        }
        .brand-details {
            display: flex;
            flex-direction: column;
            justify-content: center;
            border-bottom: 1.5px solid #B08D57;
            padding-bottom: 6px;
            flex-grow: 1;
        }
        .brand-name {
            font-family: 'Poppins', sans-serif;
            font-size: 42px;
            font-weight: 800;
            color: #324824;
            margin: 0;
            letter-spacing: 4px;
            line-height: 1.1;
        }
        .brand-sub {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            color: #B08D57;
            letter-spacing: 5px;
            text-transform: uppercase;
            margin: 4px 0;
            width: 100%;
        }
        .brand-sub::before, .brand-sub::after {
            content: '';
            flex: 1;
            border-bottom: 1px solid #B08D57;
            margin: 0 8px;
        }
        .brand-desc {
            font-size: 8px;
            font-weight: 700;
            color: #324824;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            text-align: center;
        }
        .brand-tag {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 7px;
            font-weight: 600;
            color: #B08D57;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin-top: 4px;
            width: 100%;
        }
        .brand-tag::before, .brand-tag::after {
            content: '';
            flex: 1;
            border-bottom: 0.75px solid #B08D57;
            margin: 0 6px;
        }
        .header-right {
            width: 35%;
            text-align: right;
        }
        .invoice-title {
            font-size: 34px;
            font-weight: 800;
            color: #324824;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 0 0 6px 0;
        }
        .invoice-title-divider {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            margin-bottom: 15px;
            height: 6px;
        }
        .invoice-title-divider-line {
            width: 100%;
            border-bottom: 2px solid #B08D57;
            position: relative;
        }
        .invoice-title-divider-line::after {
            content: '◆';
            color: #B08D57;
            font-size: 8px;
            position: absolute;
            right: 0;
            transform: translate(0, -50%);
            background: #FFFFFF;
            padding-left: 6px;
        }
        .meta-table {
            margin-left: auto;
            border-collapse: collapse;
        }
        .meta-table td {
            padding: 3px 0;
            font-size: 14px;
            color: #222222;
        }
        .meta-table td.meta-label {
            font-weight: 700;
            padding-right: 15px;
            color: #666666;
        }
        .meta-table td.meta-colon {
            padding-right: 8px;
        }
        .meta-table td.meta-value {
            font-weight: 500;
        }
        .address-section {
            display: flex;
            justify-content: space-between;
            margin: 30px 0;
            gap: 30px;
        }
        .address-box {
            flex: 1;
            border: 1px solid #D8D8D8;
            border-radius: 8px;
            padding: 15px;
            background: #FFFFFF;
            min-height: 120px;
        }
        .address-title {
            font-size: 18px;
            font-weight: 800;
            color: #324824;
            border-bottom: 1.5px solid #324824;
            padding-bottom: 5px;
            margin-bottom: 10px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        .address-text {
            font-size: 14px;
            line-height: 1.5;
            color: #666666;
        }
        .address-text strong {
            color: #222222;
            font-size: 15px;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
            border: 1px solid #D8D8D8;
            border-radius: 6px;
            overflow: hidden;
        }
        .items-table th {
            background-color: #324824;
            color: #FFFFFF;
            font-size: 15px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 10px 12px;
            border: 1px solid #324824;
            letter-spacing: 0.5px;
        }
        .items-table td {
            padding: 12px;
            border: 1px solid #D8D8D8;
            font-size: 14px;
            color: #222222;
        }
        .items-table tbody tr:nth-child(even) {
            background-color: #f7f9f5;
        }
        .col-center {
            text-align: center;
        }
        .col-right {
            text-align: right;
        }
        .summary-container {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            gap: 40px;
            align-items: flex-start;
        }
        .summary-left {
            flex: 1.2;
            display: flex;
            flex-direction: column;
            gap: 25px;
        }
        .words-box {
            font-size: 14px;
            line-height: 1.6;
        }
        .words-title {
            font-weight: 800;
            color: #324824;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .words-text {
            color: #666666;
            font-weight: 600;
        }
        .summary-right {
            flex: 0.8;
            min-width: 280px;
        }
        .totals-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #D8D8D8;
            border-radius: 4px;
            overflow: hidden;
        }
        .totals-table td {
            padding: 8px 10px;
            font-size: 14px;
            color: #222222;
            border-bottom: 1px solid #D8D8D8;
        }
        .totals-table td.label {
            font-weight: 500;
            color: #666666;
        }
        .totals-table td.val {
            text-align: right;
            font-weight: 600;
        }
        .totals-table tr.total-amount-row td {
            background-color: #324824;
            color: #FFFFFF;
            font-weight: 800;
            font-size: 16px;
            border: 1px solid #324824;
            padding: 10px 12px;
        }
        .totals-table tr.total-amount-row td.val {
            font-size: 18px;
        }
        .badges-container {
            display: flex;
            justify-content: space-around;
            border-top: 1px solid #D8D8D8;
            border-bottom: 1px solid #D8D8D8;
            padding: 15px 0;
            margin: 30px 0;
        }
        .badge-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 6px;
        }
        .badge-icon {
            width: 28px;
            height: 28px;
            color: #324824;
        }
        .badge-title {
            font-size: 13px;
            font-weight: 800;
            color: #324824;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        .badge-desc {
            font-size: 11px;
            color: #666666;
            font-weight: 500;
        }
        .footer-banner {
            background-color: #324824;
            color: #FFFFFF;
            padding: 20px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 4px;
            position: relative;
            overflow: hidden;
            font-size: 13px;
        }
        .footer-left {
            display: flex;
            flex-direction: column;
            gap: 8px;
            z-index: 2;
        }
        .footer-thank-you {
            font-size: 14px;
            font-weight: 800;
            letter-spacing: 0.5px;
            margin: 0 0 4px 0;
        }
        .footer-contact-row {
            display: flex;
            align-items: center;
            font-size: 13px;
            gap: 10px;
            opacity: 0.9;
        }
        .footer-contact-row svg {
            width: 13px;
            height: 13px;
            fill: #FFFFFF;
        }
        .footer-right {
            z-index: 1;
            position: absolute;
            right: 15px;
            bottom: -15px;
            opacity: 0.25;
        }
        .signature-divider {
            border-top: 1px solid #D8D8D8;
            margin-top: 50px;
            margin-bottom: 10px;
        }
        .signatory-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            padding: 0 10px;
            font-size: 13px;
        }
        .signatory-box-left {
            font-weight: 700;
            color: #324824;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        .signatory-box-right {
            text-align: right;
            font-weight: 700;
            color: #324824;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        
        @media print {
            body {
                padding: 0;
                margin: 0;
                background: #FFFFFF;
                color: #222222;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .invoice-box {
                max-width: 100%;
                width: 100%;
            }
            .totals-table tr.total-amount-row td {
                background-color: #324824 !important;
                color: #FFFFFF !important;
            }
            .footer-banner {
                background-color: #324824 !important;
                color: #FFFFFF !important;
            }
            .items-table th {
                background-color: #324824 !important;
                color: #FFFFFF !important;
            }
            .badge-icon {
                color: #324824 !important;
            }
            .badge-title {
                color: #324824 !important;
            }
            .brand-name {
                color: #324824 !important;
            }
            .invoice-title {
                color: #324824 !important;
            }
        }
    </style>
</head>
<body>
    <div class="invoice-box">
        <div class="header-container">
            <div class="header-left">
                <div class="logo-container">
                    <svg width="85" height="85" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="50" cy="50" r="45" stroke="#324824" stroke-width="1.5" fill="none" />
                        <circle cx="50" cy="50" r="41" stroke="#B08D57" stroke-width="0.75" stroke-dasharray="2 2" fill="none" />
                        <rect x="35" y="25" width="4" height="48" fill="#324824" rx="1" />
                        <rect x="61" y="25" width="4" height="48" fill="#324824" rx="1" />
                        <rect x="28" y="29" width="44" height="4" fill="#B08D57" rx="1" />
                        <rect x="28" y="65" width="44" height="4" fill="#B08D57" rx="1" />
                        <line x1="42" y1="33" x2="42" y2="65" stroke="#324824" stroke-width="0.75" />
                        <line x1="46" y1="33" x2="46" y2="65" stroke="#324824" stroke-width="0.75" />
                        <line x1="50" y1="33" x2="50" y2="65" stroke="#324824" stroke-width="0.75" />
                        <line x1="54" y1="33" x2="54" y2="65" stroke="#324824" stroke-width="0.75" />
                        <line x1="58" y1="33" x2="58" y2="65" stroke="#324824" stroke-width="0.75" />
                        <rect x="39" y="55" width="22" height="10" fill="#B08D57" opacity="0.3" />
                        <line x1="39" y1="57" x2="61" y2="57" stroke="#B08D57" stroke-width="0.5" />
                        <line x1="39" y1="60" x2="61" y2="60" stroke="#B08D57" stroke-width="0.5" />
                        <line x1="39" y1="63" x2="61" y2="63" stroke="#B08D57" stroke-width="0.5" />
                        <circle cx="28" cy="74" r="6" fill="#ffffff" stroke="#324824" stroke-width="1" />
                        <circle cx="23" cy="78" r="5" fill="#ffffff" stroke="#324824" stroke-width="1" />
                        <circle cx="29" cy="80" r="5.5" fill="#ffffff" stroke="#324824" stroke-width="1" />
                        <path d="M 20 85 C 24 81, 28 81, 31 79" stroke="#324824" stroke-width="1.25" fill="none" />
                        <path d="M 31 79 L 34 76" stroke="#324824" stroke-width="1" fill="none" />
                        <circle cx="16" cy="65" r="5.5" fill="#ffffff" stroke="#324824" stroke-width="1" />
                        <circle cx="12" cy="70" r="5" fill="#ffffff" stroke="#324824" stroke-width="1" />
                        <path d="M 10 75 C 13 72, 16 71, 18 69" stroke="#324824" stroke-width="1" fill="none" />
                    </svg>
                </div>
                <div class="brand-details">
                    <h1 class="brand-name">SRI MARUTHI</h1>
                    <div class="brand-sub">TEXTILES</div>
                    <div class="brand-desc">HANDLOOM COTTON TOWELS</div>
                    <div class="brand-tag">20+ YEARS OF TRUST & QUALITY</div>
                </div>
            </div>
            <div class="header-right">
                <div class="invoice-title">Tax Invoice</div>
                <div class="invoice-title-divider">
                    <div class="invoice-title-divider-line"></div>
                </div>
                <table class="meta-table">
                    <tr>
                        <td class="meta-label">Invoice No.</td>
                        <td class="meta-colon">:</td>
                        <td class="meta-value" style="font-weight: 700;">${invoiceNo}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Date</td>
                        <td class="meta-colon">:</td>
                        <td class="meta-value">${invoiceDate}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Place of Supply</td>
                        <td class="meta-colon">:</td>
                        <td class="meta-value">${placeOfSupply}</td>
                    </tr>
                </table>
            </div>
        </div>

        <div class="address-section">
            <div class="address-box">
                <div class="address-title">BILL TO</div>
                <div class="address-text">
                    <strong>${esc(a?.name || auth.getUser()?.name || '')}</strong><br>
                    ${esc(a?.line1 || '')}<br>
                    ${a?.line2 ? esc(a.line2) + '<br>' : ''}
                    ${esc(a?.city || '')}${a?.state ? ', ' + esc(a?.state) : ''} - ${esc(a?.pincode || '')}<br>
                    India<br>
                    ${a?.phone ? `Phone: ${esc(a.phone)}` : ''}
                </div>
            </div>
            <div class="address-box">
                <div class="address-title">SHIP TO</div>
                <div class="address-text">
                    <strong>${esc(a?.name || auth.getUser()?.name || '')}</strong><br>
                    ${esc(a?.line1 || '')}<br>
                    ${a?.line2 ? esc(a.line2) + '<br>' : ''}
                    ${esc(a?.city || '')}${a?.state ? ', ' + esc(a?.state) : ''} - ${esc(a?.pincode || '')}<br>
                    India<br>
                    ${a?.phone ? `Phone: ${esc(a.phone)}` : ''}
                </div>
            </div>
        </div>

        <table class="items-table">
            <thead>
                <tr>
                    <th style="width: 5%; text-align:center;">S.No.</th>
                    <th style="width: 40%;">Description of Goods</th>
                    <th style="width: 15%; text-align:center;">HSN Code</th>
                    <th style="width: 10%; text-align:center;">Qty</th>
                    <th style="width: 15%; text-align:right;">Rate (₹)</th>
                    <th style="width: 15%; text-align:right;">Amount (₹)</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>

        <div class="summary-container">
            <div class="summary-left">
                <div class="words-box">
                    <div class="words-title">Amount in Words:</div>
                    <div class="words-text">${amountInWordsText}</div>
                </div>
            </div>
            <div class="summary-right">
                <table class="totals-table">
                    <tr>
                        <td class="label">Subtotal</td>
                        <td class="val">${inr(subtotalVal)}</td>
                    </tr>
                    <tr>
                        <td class="label">Discount (5%)</td>
                        <td class="val">-${inr(discountVal)}</td>
                    </tr>
                    <tr>
                        <td class="label">Taxable Amount</td>
                        <td class="val">${inr(taxableVal)}</td>
                    </tr>
                    ${isSameState ? `
                        <tr>
                            <td class="label">CGST (2.5%)</td>
                            <td class="val">${inr(cgstVal)}</td>
                        </tr>
                        <tr>
                            <td class="label">SGST (2.5%)</td>
                            <td class="val">${inr(sgstVal)}</td>
                        </tr>
                    ` : `
                        <tr>
                            <td class="label">IGST (5%)</td>
                            <td class="val">${inr(igstVal)}</td>
                        </tr>
                    `}
                    <tr class="total-amount-row">
                        <td class="label">Total Amount</td>
                        <td class="val">${inr(totalBill)}</td>
                    </tr>
                </table>
            </div>
        </div>

        <div class="badges-container">
            <div class="badge-item">
                <div class="badge-icon">
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none">
                        <circle cx="50" cy="45" r="14" stroke="#324824" stroke-width="4"/>
                        <circle cx="36" cy="55" r="13" stroke="#324824" stroke-width="4"/>
                        <circle cx="64" cy="55" r="13" stroke="#324824" stroke-width="4"/>
                        <circle cx="50" cy="65" r="14" stroke="#324824" stroke-width="4"/>
                        <path d="M 50 79 C 50 87, 50 90, 50 90" stroke="#324824" stroke-width="4" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="badge-title">100% Cotton</div>
                <div class="badge-desc">Premium Quality</div>
            </div>
            <div class="badge-item">
                <div class="badge-icon">
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none">
                        <rect x="20" y="20" width="60" height="60" stroke="#324824" stroke-width="4" rx="4"/>
                        <line x1="35" y1="20" x2="35" y2="80" stroke="#324824" stroke-width="3"/>
                        <line x1="50" y1="20" x2="50" y2="80" stroke="#324824" stroke-width="3"/>
                        <line x1="65" y1="20" x2="65" y2="80" stroke="#324824" stroke-width="3"/>
                        <line x1="20" y1="35" x2="80" y2="35" stroke="#324824" stroke-width="3"/>
                        <line x1="20" y1="50" x2="80" y2="50" stroke="#324824" stroke-width="3"/>
                        <line x1="20" y1="65" x2="80" y2="65" stroke="#324824" stroke-width="3"/>
                    </svg>
                </div>
                <div class="badge-title">Handloom</div>
                <div class="badge-desc">Woven with Care</div>
            </div>
            <div class="badge-item">
                <div class="badge-icon">
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none">
                        <path d="M 50 15 C 30 35, 25 60, 50 85 C 75 60, 70 35, 50 15 Z" stroke="#324824" stroke-width="4" stroke-linejoin="round"/>
                        <path d="M 50 85 L 50 15" stroke="#324824" stroke-width="4" stroke-linecap="round"/>
                        <path d="M 50 65 C 40 60, 35 55, 35 55" stroke="#324824" stroke-width="3" stroke-linecap="round"/>
                        <path d="M 50 50 C 60 45, 65 40, 65 40" stroke="#324824" stroke-width="3" stroke-linecap="round"/>
                        <path d="M 50 35 C 40 30, 38 25, 38 25" stroke="#324824" stroke-width="3" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="badge-title">Eco Friendly</div>
                <div class="badge-desc">Sustainable Choice</div>
            </div>
            <div class="badge-item">
                <div class="badge-icon">
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none">
                        <path d="M 50 80 C 40 65, 30 65, 25 80 C 35 85, 45 85, 50 80 Z" stroke="#324824" stroke-width="4"/>
                        <path d="M 50 80 C 60 65, 70 65, 75 80 C 65 85, 55 85, 50 80 Z" stroke="#324824" stroke-width="4"/>
                        <path d="M 50 40 C 45 55, 45 70, 50 80 C 55 70, 55 55, 50 40 Z" stroke="#324824" stroke-width="4"/>
                        <path d="M 50 50 C 35 60, 35 70, 50 80 C 65 70, 65 60, 50 50 Z" stroke="#324824" stroke-width="4"/>
                    </svg>
                </div>
                <div class="badge-title">Made In India</div>
                <div class="badge-desc">Proudly Indian</div>
            </div>
        </div>

        <div class="footer-banner">
            <div class="footer-left">
                <div class="footer-thank-you">Thank you for your business!</div>
                <div class="footer-contact-row">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.11-.27 11.72 11.72 0 0 0 3.7 1.18 1 1 0 0 1 .89 1v3.48a1 1 0 0 1-1 1A16 16 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 .89 11.72 11.72 0 0 0 1.18 3.7 1 1 0 0 1-.27 1.1l-2.2 2.2z"/></svg>
                    <span>+91 9XXXXXXXXX</span>
                </div>
                <div class="footer-contact-row">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                    <span>srimaruthitextiles@gmail.com</span>
                </div>
                <div class="footer-contact-row">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    <span>Tamil Nadu, India</span>
                </div>
            </div>
            <div class="footer-right">
                <svg width="120" height="90" viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg" fill="none">
                    <path d="M 90 70 C 70 50, 45 40, 20 45" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" opacity="0.4" />
                    <path d="M 60 48 C 55 35, 45 25, 35 22" stroke="#ffffff" stroke-width="1.25" stroke-linecap="round" opacity="0.4" />
                    <path d="M 40 46 C 30 55, 22 62, 12 65" stroke="#ffffff" stroke-width="1.25" stroke-linecap="round" opacity="0.4" />
                    <g fill="#ffffff" opacity="0.8">
                        <circle cx="20" cy="45" r="5" />
                        <circle cx="16" cy="41" r="4.5" />
                        <circle cx="21" cy="39" r="4" />
                        <circle cx="25" cy="43" r="4.5" />
                        <path d="M 18 48 L 22 48 L 20 52 Z" fill="#ffffff" opacity="0.5" />
                        <circle cx="35" cy="22" r="5" />
                        <circle cx="31" cy="18" r="4.5" />
                        <circle cx="37" cy="17" r="4.5" />
                        <circle cx="39" cy="21" r="4" />
                        <path d="M 33 24 L 37 24 L 35 28 Z" fill="#ffffff" opacity="0.5" />
                        <circle cx="12" cy="65" r="5.5" />
                        <circle cx="8" cy="62" r="4.5" />
                        <circle cx="11" cy="59" r="4.5" />
                        <circle cx="14" cy="62" r="4" />
                        <path d="M 10 67 L 14 67 L 12 71 Z" fill="#ffffff" opacity="0.5" />
                    </g>
                </svg>
            </div>
        </div>

        <div class="signature-divider"></div>
        <div class="signatory-container">
            <div class="signatory-box-left">
                AUTHORISED SIGNATORY
            </div>
            <div class="signatory-box-right">
                FOR SRI MARUTHI TEXTILES
            </div>
        </div>
    </div>
    <script>window.onload=function(){window.print();}<\/script>
</body>
</html>`);
    win.document.close();
}
