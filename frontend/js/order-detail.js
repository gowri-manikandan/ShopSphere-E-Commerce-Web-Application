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
    const estDelivery = o.estimatedDeliveryDate ? new Date(o.estimatedDeliveryDate) : new Date(new Date(o.orderDate).getTime() + 5 * 24 * 60 * 60 * 1000);

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
async function downloadInvoice(o) {
    let settings = null;
    try {
        settings = await api.get('/api/store-settings');
    } catch (e) {
        console.error("Failed to load store settings for invoice", e);
    }

    const storeName = settings?.storeName || 'ShopSphere';
    const storeAddress = settings?.address || '123 E-Commerce Boulevard, Tech Park, Bangalore, Karnataka - 560001';
    const storeGst = settings?.gstNumber || '29AAAAA0000A1Z5';
    const storePan = settings?.pan || 'ABCDE1234F';
    const bankName = settings?.bankName || 'State Bank of India';
    const bankAcc = settings?.bankAccountNumber || '333344445555';
    const bankIfsc = settings?.bankIfsc || 'SBIN0001234';

    const win = window.open('', '_blank', 'width=850,height=950');
    if (!win) { showToast('Allow pop-ups to download the invoice.', 'error'); return; }

    const rows = o.items.map((i, idx) => {
        const price = Number(i.price || 0);
        const subtotal = Number(i.subtotal || 0);
        const taxableUnit = price / 1.18;
        const cgstUnit = taxableUnit * 0.09;
        const sgstUnit = taxableUnit * 0.09;
        const totalTaxable = taxableUnit * i.quantity;
        const totalCgst = cgstUnit * i.quantity;
        const totalSgst = sgstUnit * i.quantity;
        const totalGst = totalCgst + totalSgst;

        return `<tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td><strong>${esc(i.productName)}</strong></td>
            <td style="text-align:right;">${inr(taxableUnit)}</td>
            <td style="text-align:center;">${i.quantity}</td>
            <td style="text-align:right;">${inr(totalCgst)} <span class="tax-pct">(9%)</span></td>
            <td style="text-align:right;">${inr(totalSgst)} <span class="tax-pct">(9%)</span></td>
            <td style="text-align:right;">${inr(totalGst)}</td>
            <td style="text-align:right; font-weight: 600;">${inr(subtotal)}</td>
        </tr>`;
    }).join('');

    const totalBill = Number(o.totalAmount || 0);
    const totalTaxableVal = totalBill / 1.18;
    const cgstAmt = totalTaxableVal * 0.09;
    const sgstAmt = totalTaxableVal * 0.09;
    const gstAmt = cgstAmt + sgstAmt;

    const a = o.shippingAddress;
    
    win.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>Tax Invoice - #${o.orderId}</title>
    <style>
        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 30px;
            color: #333;
            line-height: 1.4;
            font-size: 14px;
        }
        .invoice-box {
            max-width: 800px;
            margin: auto;
        }
        .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
        }
        .header-table td {
            border: none;
            padding: 0;
            vertical-align: top;
        }
        .store-logo {
            font-size: 28px;
            font-weight: 800;
            color: #1a1a1a;
            margin: 0 0 6px 0;
            letter-spacing: -0.5px;
        }
        .store-details {
            font-size: 12px;
            color: #555;
            max-width: 320px;
        }
        .invoice-title-box {
            text-align: right;
        }
        .invoice-title {
            font-size: 24px;
            font-weight: 700;
            color: #444;
            margin: 0 0 10px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .invoice-meta {
            font-size: 13px;
            color: #444;
            display: inline-block;
            text-align: left;
        }
        .invoice-meta div {
            margin-bottom: 4px;
        }
        .invoice-meta strong {
            color: #111;
        }
        .divider {
            border-top: 2px solid #333;
            margin: 15px 0;
        }
        .address-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
        }
        .address-table td {
            border: 1px solid #eaeaea;
            padding: 15px;
            vertical-align: top;
            background: #fafafa;
            border-radius: 4px;
        }
        .address-title {
            font-size: 12px;
            font-weight: 700;
            color: #777;
            text-transform: uppercase;
            margin: 0 0 8px 0;
            letter-spacing: 0.5px;
        }
        .address-text {
            font-size: 13px;
            color: #333;
            margin: 0;
            line-height: 1.5;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        .items-table th {
            background: #333;
            color: #fff;
            text-transform: uppercase;
            font-size: 11px;
            font-weight: 600;
            padding: 10px;
            border: 1px solid #333;
            letter-spacing: 0.5px;
        }
        .items-table td {
            padding: 12px 10px;
            border: 1px solid #eaeaea;
            font-size: 13px;
            vertical-align: middle;
        }
        .items-table tr:nth-child(even) {
            background: #fcfcfc;
        }
        .tax-pct {
            font-size: 10px;
            color: #888;
            font-weight: normal;
        }
        .summary-table {
            width: 320px;
            float: right;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        .summary-table td {
            padding: 8px 10px;
            border-bottom: 1px solid #eaeaea;
            font-size: 13px;
        }
        .summary-table tr.grand-total td {
            border-top: 2px solid #333;
            border-bottom: 2px solid #333;
            font-weight: 700;
            font-size: 16px;
            color: #000;
            background: #fafafa;
        }
        .bank-details-box {
            width: 420px;
            float: left;
            border: 1px solid #eaeaea;
            padding: 15px;
            border-radius: 4px;
            background: #fafafa;
            margin-bottom: 30px;
        }
        .bank-title {
            font-size: 12px;
            font-weight: 700;
            color: #555;
            text-transform: uppercase;
            margin: 0 0 8px 0;
        }
        .bank-details-row {
            font-size: 12px;
            margin-bottom: 4px;
            color: #444;
        }
        .bank-details-row span {
            display: inline-block;
            width: 120px;
            font-weight: 600;
            color: #666;
        }
        .clear {
            clear: both;
        }
        .footer {
            margin-top: 50px;
            text-align: center;
            font-size: 12px;
            color: #777;
            border-top: 1px solid #eaeaea;
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <div class="invoice-box">
        <table class="header-table">
            <tr>
                <td>
                    <div class="store-logo">${esc(storeName)}</div>
                    <div class="store-details">
                        <p style="margin:0 0 8px 0; font-weight:600; font-size:13px; color:#333;">${esc(storeName)}</p>
                        <p style="margin:0 0 6px 0; line-height:1.5;">${esc(storeAddress)}</p>
                        <p style="margin:4px 0 0 0;"><strong>GSTIN:</strong> ${esc(storeGst)}</p>
                        <p style="margin:2px 0 0 0;"><strong>PAN:</strong> ${esc(storePan)}</p>
                    </div>
                </td>
                <td class="invoice-title-box">
                    <div class="invoice-title">Tax Invoice</div>
                    <div class="invoice-meta">
                        <div><strong>Invoice No:</strong> #${o.orderId}</div>
                        <div><strong>Date:</strong> ${fmtDateTime(o.orderDate)}</div>
                        <div><strong>Payment Method:</strong> ${esc(o.paymentMethod || '—')}</div>
                        <div><strong>Payment Status:</strong> ${esc(o.paymentStatus)}</div>
                        <div><strong>Transaction ID:</strong> <span style="font-family:monospace; font-size:11px;">${esc(o.transactionRef || '—')}</span></div>
                    </div>
                </td>
            </tr>
        </table>

        <div class="divider"></div>

        <table class="address-table">
            <tr>
                <td>
                    <div class="address-title">Billed & Shipped To</div>
                    <div class="address-text">
                        <strong>${esc(a?.name || '')}</strong><br>
                        ${esc(a?.line1 || '')}<br>
                        ${esc(a?.city || '')}${a?.state ? ', ' + esc(a?.state) : ''} - ${esc(a?.pincode || '')}<br>
                        India<br>
                        ${a?.phone ? `Phone: ${esc(a.phone)}` : ''}
                    </div>
                </td>
            </tr>
        </table>

        <table class="items-table">
            <thead>
                <tr>
                    <th style="width: 5%; text-align:center;">#</th>
                    <th style="width: 40%;">Item Description</th>
                    <th style="width: 12%; text-align:right;">Taxable Value</th>
                    <th style="width: 8%; text-align:center;">Qty</th>
                    <th style="width: 12%; text-align:right;">CGST</th>
                    <th style="width: 12%; text-align:right;">SGST</th>
                    <th style="width: 10%; text-align:right;">Total GST</th>
                    <th style="width: 15%; text-align:right;">Net Amount</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>

        <div class="bank-details-box">
            <div class="bank-title">Bank Transfer Details</div>
            <div class="bank-details-row"><span>Beneficiary:</span> ${esc(storeName)}</div>
            <div class="bank-details-row"><span>Bank Name:</span> ${esc(bankName)}</div>
            <div class="bank-details-row"><span>Account No:</span> ${esc(bankAcc)}</div>
            <div class="bank-details-row"><span>IFSC Code:</span> ${esc(bankIfsc)}</div>
        </div>

        <table class="summary-table">
            <tr>
                <td>Taxable Value (Subtotal)</td>
                <td style="text-align:right;">${inr(totalTaxableVal)}</td>
            </tr>
            <tr>
                <td>CGST (9%)</td>
                <td style="text-align:right;">${inr(cgstAmt)}</td>
            </tr>
            <tr>
                <td>SGST (9%)</td>
                <td style="text-align:right;">${inr(sgstAmt)}</td>
            </tr>
            <tr>
                <td>Total Tax Amount (18%)</td>
                <td style="text-align:right;">${inr(gstAmt)}</td>
            </tr>
            <tr class="grand-total">
                <td>Grand Total</td>
                <td style="text-align:right;">${inr(totalBill)}</td>
            </tr>
        </table>

        <div class="clear"></div>

        <div class="footer">
            <p style="margin: 0 0 6px 0; font-weight:600; color:#444;">Thank you for your business!</p>
            <p style="margin: 0; font-size:11px; color:#999;">This is a computer-generated tax invoice and does not require a physical signature.</p>
        </div>
    </div>
    <script>window.onload=function(){window.print();}<\/script>
</body>
</html>`);
    win.document.close();
}
