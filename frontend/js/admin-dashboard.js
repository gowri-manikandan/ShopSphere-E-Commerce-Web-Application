import { api } from './api.js';
import { API_BASE } from './config.js';
import { showToast } from './ui.js';
import './navbar.js'; // renders navbar + runs the admin route guard (auth.js)

// ----- state -----
const charts = { sales: null, top: null, trend: null };
let currentMonth = toMonthValue(new Date());   // "YYYY-MM"
let topSort = 'units';
let recentPage = 0;
const RECENT_SIZE = 10;
let selectedTrendProductId = null;

// ----- helpers -----
function toMonthValue(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function inr(n) {
    const v = Number(n || 0);
    return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function setState(el, msg) {
    if (!el) return;
    if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
    else { el.classList.add('hidden'); }
}
function badgeClassFor(status) {
    switch (status) {
        case 'DELIVERED': return 'badge-success';
        case 'CANCELLED': return 'badge-danger';
        case 'PLACED': return 'badge-warning';
        default: return 'badge-info';
    }
}
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const monthPicker = document.getElementById('month-picker');
    monthPicker.value = currentMonth;
    monthPicker.addEventListener('change', () => {
        currentMonth = monthPicker.value || toMonthValue(new Date());
        loadOverview();
        loadSalesReport();
        loadTopProducts();
    });

    // Top-products sort toggle
    document.getElementById('top-sort-toggle').addEventListener('click', (e) => {
        const btn = e.target.closest('.admin-toggle-btn');
        if (!btn) return;
        document.querySelectorAll('#top-sort-toggle .admin-toggle-btn')
            .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        topSort = btn.dataset.sort;
        loadTopProducts();
    });

    // CSV export
    document.getElementById('export-csv-btn').addEventListener('click', exportSalesCsv);

    // Recent orders filter + pagination
    document.getElementById('recent-status-filter').addEventListener('change', () => {
        recentPage = 0;
        loadRecentOrders();
    });
    document.getElementById('recent-prev').addEventListener('click', () => {
        if (recentPage > 0) { recentPage--; loadRecentOrders(); }
    });
    document.getElementById('recent-next').addEventListener('click', () => {
        recentPage++; loadRecentOrders();
    });

    // Close the product-trend results dropdown when clicking outside it
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.admin-search-wrap')) {
            document.getElementById('trend-results').classList.add('hidden');
        }
    });

    // Product-trend search
    document.getElementById('trend-search').addEventListener('input',
        debounce(e => trendSearch(e.target.value), 300));

    // Sidebar active-link on click
    document.querySelectorAll('.admin-sidebar-link').forEach(link => {
        if (link.classList.contains('external')) return;
        link.addEventListener('click', () => {
            document.querySelectorAll('.admin-sidebar-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Initial load
    loadOverview();
    loadSalesReport();
    loadTopProducts();
    loadLowStock();
    loadRecentOrders();
});

// ----- Overview -----
async function loadOverview() {
    try {
        const [from, to] = monthRange(currentMonth);
        const o = await api.get(`/api/admin/analytics/overview?from=${from}&to=${to}`);
        document.getElementById('ov-alltime-revenue').textContent = inr(o.allTimeRevenue);
        document.getElementById('ov-period-revenue').textContent = inr(o.periodRevenue);
        document.getElementById('ov-period-orders').textContent = o.periodOrders ?? 0;
        document.getElementById('ov-avg-order').textContent = inr(o.averageOrderValue);
        document.getElementById('ov-total-customers').textContent = o.totalCustomers ?? 0;
    } catch (err) {
        showToast(err.message || 'Failed to load overview.', 'error');
    }
}

function monthRange(month) {
    const [y, m] = month.split('-').map(Number);
    const from = `${month}-01`;
    const last = new Date(y, m, 0).getDate(); // day 0 of next month = last day
    const to = `${month}-${String(last).padStart(2, '0')}`;
    return [from, to];
}

// ----- Sales report -----
async function loadSalesReport() {
    const state = document.getElementById('sales-state');
    setState(state, 'Loading…');
    try {
        const r = await api.get(`/api/admin/analytics/sales-report?month=${currentMonth}`);
        // Comparison badge
        const badge = document.getElementById('sales-comparison');
        if (r.revenueChangePct == null) {
            badge.textContent = 'no prior month';
            badge.className = 'badge badge-info';
        } else {
            const up = r.revenueChangePct >= 0;
            badge.textContent = `${up ? '▲' : '▼'} ${Math.abs(r.revenueChangePct).toFixed(1)}% vs prev month`;
            badge.className = 'badge ' + (up ? 'badge-success' : 'badge-danger');
        }
        const hasData = r.daily.some(d => d.orders > 0);
        if (!hasData) { setState(state, 'No sales in this month.'); if (charts.sales) charts.sales.destroy(); return; }
        setState(state, null);
        renderSalesChart(r.daily);
    } catch (err) {
        setState(state, 'Failed to load sales report.');
        showToast(err.message || 'Failed to load sales report.', 'error');
    }
}

function renderSalesChart(daily) {
    if (charts.sales) charts.sales.destroy();
    const ctx = document.getElementById('chart-sales').getContext('2d');
    charts.sales = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: daily.map(d => d.date.slice(8)), // day-of-month
            datasets: [{
                label: 'Revenue (₹)',
                data: daily.map(d => Number(d.revenue)),
                backgroundColor: 'rgba(99,102,241,0.6)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// ----- Top products -----
async function loadTopProducts() {
    const state = document.getElementById('top-state');
    const tbody = document.getElementById('top-products-tbody');
    setState(state, 'Loading…');
    tbody.innerHTML = '';
    try {
        const rows = await api.get(
            `/api/admin/analytics/top-products?month=${currentMonth}&limit=10&sortBy=${topSort}`);
        if (!rows.length) {
            setState(state, 'No product sales this month.');
            if (charts.top) charts.top.destroy();
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No data</td></tr>`;
            return;
        }
        setState(state, null);
        renderTopChart(rows);
        tbody.innerHTML = rows.map((p, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${esc(p.productName)}</td>
                <td>${p.unitsSold}</td>
                <td>${inr(p.revenue)}</td>
            </tr>`).join('');
    } catch (err) {
        setState(state, 'Failed to load top products.');
        showToast(err.message || 'Failed to load top products.', 'error');
    }
}

function renderTopChart(rows) {
    if (charts.top) charts.top.destroy();
    const ctx = document.getElementById('chart-top').getContext('2d');
    charts.top = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: rows.map(p => p.productName),
            datasets: [{
                label: topSort === 'revenue' ? 'Revenue (₹)' : 'Units sold',
                data: rows.map(p => topSort === 'revenue' ? Number(p.revenue) : p.unitsSold),
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true } }
        }
    });
}

// ----- Product trend -----
async function loadProductTrend(productId) {
    const state = document.getElementById('trend-state');
    setState(state, 'Loading…');
    try {
        const r = await api.get(`/api/admin/analytics/product-trend?productId=${productId}&months=12`);
        document.getElementById('trend-summary').innerHTML =
            `<strong>${esc(r.productName)}</strong> — ${r.totalUnits} units, ${inr(r.totalRevenue)} over 12 months`;
        const hasData = r.points.some(p => p.units > 0);
        if (!hasData) { setState(state, 'No sales for this product in the last 12 months.'); if (charts.trend) charts.trend.destroy(); return; }
        setState(state, null);
        renderTrendChart(r.points);
    } catch (err) {
        setState(state, 'Failed to load product trend.');
        showToast(err.message || 'Failed to load product trend.', 'error');
    }
}

function renderTrendChart(points) {
    if (charts.trend) charts.trend.destroy();
    const ctx = document.getElementById('chart-trend').getContext('2d');
    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: points.map(p => p.month),
            datasets: [{
                label: 'Units sold',
                data: points.map(p => p.units),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.1)',
                borderWidth: 3, fill: true, tension: 0.4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// ----- Low stock -----
async function loadLowStock() {
    const tbody = document.getElementById('lowstock-tbody');
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Loading…</td></tr>`;
    try {
        const rows = await api.get('/api/admin/analytics/low-stock');
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">All products are well stocked 🎉</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(p => `
            <tr>
                <td>${esc(p.name)}</td>
                <td>${p.stockQuantity}</td>
                <td>${inr(p.price)}</td>
                <td><span class="badge ${p.status === 'OUT_OF_STOCK' ? 'badge-danger' : 'badge-warning'}">${p.status.replace('_', ' ')}</span></td>
            </tr>`).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--danger);">Failed to load low-stock.</td></tr>`;
    }
}

// ----- Recent orders -----
async function loadRecentOrders() {
    const tbody = document.getElementById('recent-orders-tbody');
    const status = document.getElementById('recent-status-filter').value;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Loading…</td></tr>`;
    try {
        const r = await api.get(
            `/api/admin/analytics/recent-orders?page=${recentPage}&size=${RECENT_SIZE}&status=${status}`);
        if (!r.content.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No orders.</td></tr>`;
        } else {
            tbody.innerHTML = r.content.map(o => `
                <tr>
                    <td>#${o.orderId}</td>
                    <td>${o.orderDate ? o.orderDate.slice(0, 10) : '—'}</td>
                    <td>${inr(o.totalAmount)}</td>
                    <td>${esc(o.paymentMethod || '—')} / ${esc(o.paymentStatus || '—')}</td>
                    <td><span class="badge ${badgeClassFor(o.status)}">${o.status}</span></td>
                </tr>`).join('');
        }
        document.getElementById('recent-page-info').textContent = `Page ${r.page + 1} of ${Math.max(1, r.totalPages)}`;
        document.getElementById('recent-prev').disabled = r.page <= 0;
        document.getElementById('recent-next').disabled = r.page >= r.totalPages - 1;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--danger);">Failed to load orders.</td></tr>`;
    }
}

// ----- CSV export (raw fetch to preserve the attachment + auth header) -----
async function exportSalesCsv() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(
            `${API_BASE}/api/admin/analytics/sales-report/export?month=${currentMonth}`,
            { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sales-report-${currentMonth}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        showToast('Could not export CSV.', 'error');
    }
}

// ----- Product-trend search dropdown -----
async function trendSearch(q) {
    const box = document.getElementById('trend-results');
    if (!q || q.trim().length < 2) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    try {
        const r = await api.get(`/api/admin/search?q=${encodeURIComponent(q.trim())}&type=products&limit=8`);
        if (!r.products.length) { box.innerHTML = `<div class="search-hit muted">No products</div>`; box.classList.remove('hidden'); return; }
        box.innerHTML = r.products.map(p =>
            `<div class="search-hit" data-product-id="${p.id}" data-product-name="${esc(p.name)}">${esc(p.name)}</div>`).join('');
        box.classList.remove('hidden');
        box.querySelectorAll('.search-hit[data-product-id]').forEach(hit => {
            hit.addEventListener('click', () => {
                selectedTrendProductId = Number(hit.dataset.productId);
                document.getElementById('trend-search').value = hit.dataset.productName;
                box.classList.add('hidden');
                loadProductTrend(selectedTrendProductId);
            });
        });
    } catch (err) {
        box.classList.add('hidden');
    }
}
