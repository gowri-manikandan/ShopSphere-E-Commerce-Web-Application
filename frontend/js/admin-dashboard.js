import { api } from './api.js';
import { auth } from './auth.js';
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
let selectedCategoryId = '';

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
        case 'CONFIRMED': return 'badge-info';
        case 'PACKED': return 'badge-warning';
        case 'SHIPPED': return 'badge-info';
        default: return 'badge-info';
    }
}
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initAdminUser();

    const monthPicker = document.getElementById('month-picker');
    monthPicker.value = currentMonth;
    monthPicker.addEventListener('change', () => {
        currentMonth = monthPicker.value || toMonthValue(new Date());
        syncPeriodChips();
        refreshDashboard();
    });

    // Period Quick Shortcut Chips
    const btnThisMonth = document.getElementById('btn-period-current');
    const btnPrevMonth = document.getElementById('btn-period-prev');

    btnThisMonth?.addEventListener('click', () => {
        currentMonth = toMonthValue(new Date());
        monthPicker.value = currentMonth;
        syncPeriodChips();
        refreshDashboard();
    });

    btnPrevMonth?.addEventListener('click', () => {
        const prev = new Date();
        prev.setMonth(prev.getMonth() - 1);
        currentMonth = toMonthValue(prev);
        monthPicker.value = currentMonth;
        syncPeriodChips();
        refreshDashboard();
    });

    const categoryFilter = document.getElementById('category-filter');
    categoryFilter.addEventListener('change', () => {
        selectedCategoryId = categoryFilter.value;
        refreshDashboard();
    });

    // Refresh button
    const refreshBtn = document.getElementById('admin-refresh-btn');
    refreshBtn?.addEventListener('click', async () => {
        refreshBtn.classList.add('spinning');
        await refreshDashboard();
        setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
        showToast('Dashboard data refreshed', 'success');
    });

    populateCategoryFilter();

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

    // CSV/PDF export
    document.getElementById('export-csv-btn').addEventListener('click', exportSalesCsv);
    document.getElementById('export-pdf-btn').addEventListener('click', exportSalesPdf);

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
        if (!e.target.closest('.admin-search-wrapper')) {
            document.getElementById('trend-results')?.classList.add('hidden');
        }
    });

    // Product-trend search
    document.getElementById('trend-search').addEventListener('input',
        debounce(e => trendSearch(e.target.value), 250));

    // Sidebar active-link on click
    document.querySelectorAll('.admin-sidebar-link').forEach(link => {
        if (link.classList.contains('external')) return;
        link.addEventListener('click', () => {
            document.querySelectorAll('.admin-sidebar-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Initial load
    refreshDashboard();
});

function initAdminUser() {
    const user = auth.getUser();
    if (user && user.name) {
        const nameEl = document.getElementById('sidebar-admin-name');
        if (nameEl) nameEl.textContent = user.name;
        const avatarEl = document.querySelector('.admin-avatar');
        if (avatarEl) {
            const initials = user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'SA';
            avatarEl.textContent = initials;
        }
    }
}

function syncPeriodChips() {
    const thisMonthVal = toMonthValue(new Date());
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1);
    const prevMonthVal = toMonthValue(prevDate);

    const btnThis = document.getElementById('btn-period-current');
    const btnPrev = document.getElementById('btn-period-prev');

    if (btnThis) btnThis.classList.toggle('active', currentMonth === thisMonthVal);
    if (btnPrev) btnPrev.classList.toggle('active', currentMonth === prevMonthVal);
}

async function refreshDashboard() {
    await Promise.allSettled([
        loadOverview(),
        loadSalesReport(),
        loadTopProducts(),
        loadLowStock(),
        loadRecentOrders()
    ]);
}

async function populateCategoryFilter() {
    try {
        const categories = await api.get('/api/categories', true);
        const filter = document.getElementById('category-filter');
        if (filter && categories) {
            const filteredCategories = categories.filter(
                cat => cat && cat.name && cat.name.trim().toLowerCase() !== 'uncategorized'
            );
            filteredCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.name;
                filter.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('Failed to load categories for filtering.', err);
    }
}

// ----- Overview -----
async function loadOverview() {
    try {
        const [from, to] = monthRange(currentMonth);
        const categoryQuery = selectedCategoryId ? `&categoryId=${selectedCategoryId}` : '';
        const o = await api.get(`/api/admin/analytics/overview?from=${from}&to=${to}${categoryQuery}`);
        document.getElementById('ov-alltime-revenue').textContent = inr(o.allTimeRevenue);
        document.getElementById('ov-period-revenue').textContent = inr(o.periodRevenue);
        document.getElementById('ov-period-orders').textContent = (o.periodOrders ?? 0).toLocaleString();
        document.getElementById('ov-avg-order').textContent = inr(o.averageOrderValue);
        document.getElementById('ov-total-customers').textContent = (o.totalCustomers ?? 0).toLocaleString();

        const [y, m] = currentMonth.split('-');
        const monthDate = new Date(Number(y), Number(m) - 1, 1);
        const monthName = monthDate.toLocaleString('default', { month: 'short', year: 'numeric' });
        const subLabel = document.getElementById('stat-period-sub');
        if (subLabel) subLabel.textContent = `Sales in ${monthName}`;
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
        const categoryQuery = selectedCategoryId ? `&categoryId=${selectedCategoryId}` : '';
        const r = await api.get(`/api/admin/analytics/sales-report?month=${currentMonth}${categoryQuery}`);
        
        // Comparison badge
        const badge = document.getElementById('sales-comparison');
        const statMonthComp = document.getElementById('stat-month-comparison');
        
        if (r.revenueChangePct == null) {
            badge.textContent = 'First tracked period';
            badge.className = 'badge badge-info';
            if (statMonthComp) {
                statMonthComp.textContent = 'Baseline';
                statMonthComp.className = 'stat-badge-pill';
            }
        } else {
            const up = r.revenueChangePct >= 0;
            const sign = up ? '▲' : '▼';
            const pctStr = `${sign} ${Math.abs(r.revenueChangePct).toFixed(1)}% vs prev month`;
            badge.textContent = pctStr;
            badge.className = 'badge ' + (up ? 'badge-success' : 'badge-danger');
            
            if (statMonthComp) {
                statMonthComp.textContent = `${sign} ${Math.abs(r.revenueChangePct).toFixed(1)}%`;
                statMonthComp.className = 'stat-badge-pill ' + (up ? 'trend-up' : 'trend-down');
            }
        }

        const hasData = r.daily && r.daily.some(d => d.orders > 0 || d.revenue > 0);
        if (!hasData) {
            setState(state, 'No sales data recorded for this month.');
            if (charts.sales) charts.sales.destroy();
            return;
        }
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
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(79, 70, 229, 0.85)');
    gradient.addColorStop(1, 'rgba(129, 140, 248, 0.25)');

    charts.sales = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: daily.map(d => {
                const dayNum = parseInt(d.date.slice(8), 10);
                return `Day ${dayNum}`;
            }),
            datasets: [{
                label: 'Daily Revenue',
                data: daily.map(d => Number(d.revenue || 0)),
                backgroundColor: gradient,
                hoverBackgroundColor: '#4338ca',
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return ' Revenue: ' + inr(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#64748b',
                        font: { size: 11, weight: '500' }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(226, 232, 240, 0.8)' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 11, weight: '500' },
                        callback: function(val) {
                            if (val >= 1000) return '₹' + (val / 1000).toFixed(0) + 'k';
                            return '₹' + val;
                        }
                    }
                }
            }
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
        const categoryQuery = selectedCategoryId ? `&categoryId=${selectedCategoryId}` : '';
        const rows = await api.get(
            `/api/admin/analytics/top-products?month=${currentMonth}&limit=10&sortBy=${topSort}${categoryQuery}`);
        
        if (!rows || !rows.length) {
            setState(state, 'No product sales recorded for this month.');
            if (charts.top) charts.top.destroy();
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:30px 0;">No sales data available</td></tr>`;
            return;
        }
        setState(state, null);
        renderTopChart(rows);

        const maxVal = Math.max(...rows.map(p => topSort === 'revenue' ? Number(p.revenue) : p.unitsSold), 1);

        tbody.innerHTML = rows.map((p, i) => {
            const rankMedal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
            const currentVal = topSort === 'revenue' ? Number(p.revenue) : p.unitsSold;
            const pct = Math.min(100, Math.round((currentVal / maxVal) * 100));

            return `
            <tr>
                <td><span class="rank-badge rank-${i + 1}">${rankMedal}</span></td>
                <td>
                    <div class="product-cell-wrap">
                        <strong class="prod-name-title">${esc(p.productName)}</strong>
                        <div class="prod-rel-bar-wrap">
                            <div class="prod-rel-bar" style="width: ${pct}%"></div>
                        </div>
                    </div>
                </td>
                <td class="text-right font-bold">${p.unitsSold.toLocaleString()}</td>
                <td class="text-right font-bold color-primary">${inr(p.revenue)}</td>
            </tr>`;
        }).join('');

        // Populate quick chips for Trend Search from top products
        populateTrendChips(rows);
    } catch (err) {
        setState(state, 'Failed to load top products.');
        showToast(err.message || 'Failed to load top products.', 'error');
    }
}

function populateTrendChips(products) {
    const container = document.getElementById('trend-chips-container');
    if (!container) return;
    const top3 = products.slice(0, 4);
    if (!top3.length) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <span class="chip-label">Quick select:</span>
        ${top3.map(p => `
            <button type="button" class="trend-quick-chip" data-product-id="${p.productId || ''}" data-name="${esc(p.productName)}">
                ${esc(p.productName)}
            </button>
        `).join('')}
    `;

    container.querySelectorAll('.trend-quick-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.dataset.name;
            const searchInput = document.getElementById('trend-search');
            if (searchInput) searchInput.value = name;
            // Search or find product id
            trendSearch(name, true);
        });
    });
}

function renderTopChart(rows) {
    if (charts.top) charts.top.destroy();
    const ctx = document.getElementById('chart-top').getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 350, 0);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(1, '#818cf8');

    charts.top = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: rows.map(p => {
                const name = p.productName || 'Product';
                return name.length > 18 ? name.slice(0, 16) + '…' : name;
            }),
            datasets: [{
                label: topSort === 'revenue' ? 'Revenue' : 'Units Sold',
                data: rows.map(p => topSort === 'revenue' ? Number(p.revenue) : p.unitsSold),
                backgroundColor: gradient,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) {
                            return topSort === 'revenue'
                                ? ' Revenue: ' + inr(ctx.parsed.x)
                                : ' Units Sold: ' + ctx.parsed.x.toLocaleString();
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: 'rgba(226, 232, 240, 0.8)' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 11 },
                        callback: function(val) {
                            if (topSort === 'revenue' && val >= 1000) return '₹' + (val / 1000).toFixed(0) + 'k';
                            return val;
                        }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: '#334155',
                        font: { size: 12, weight: '600' }
                    }
                }
            }
        }
    });
}

// ----- Product trend -----
async function loadProductTrend(productId) {
    const state = document.getElementById('trend-state');
    setState(state, 'Loading…');
    try {
        const categoryQuery = selectedCategoryId ? `&categoryId=${selectedCategoryId}` : '';
        const r = await api.get(`/api/admin/analytics/product-trend?productId=${productId}&months=12${categoryQuery}`);
        
        document.getElementById('trend-summary').innerHTML = `
            <div class="trend-result-badge">
                <span class="trend-prod-title">📈 ${esc(r.productName)}</span>
                <span class="trend-stat-point"><strong>${r.totalUnits.toLocaleString()}</strong> Units Sold</span>
                <span class="trend-stat-point"><strong>${inr(r.totalRevenue)}</strong> Gross Revenue</span>
                <span class="trend-stat-period">(Last 12 Months)</span>
            </div>
        `;

        const hasData = r.points && r.points.some(p => p.units > 0);
        if (!hasData) {
            setState(state, 'No sales records found for this product in the last 12 months.');
            if (charts.trend) charts.trend.destroy();
            return;
        }
        setState(state, null);
        renderTrendChart(r.points, r.productName);
    } catch (err) {
        setState(state, 'Failed to load product trend.');
        showToast(err.message || 'Failed to load product trend.', 'error');
    }
}

function renderTrendChart(points, prodName) {
    if (charts.trend) charts.trend.destroy();
    const ctx = document.getElementById('chart-trend').getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.35)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.01)');

    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: points.map(p => p.month),
            datasets: [{
                label: `${prodName || 'Product'} (Units Sold)`,
                data: points.map(p => p.units),
                borderColor: '#4f46e5',
                backgroundColor: gradient,
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#4f46e5',
                pointBorderWidth: 2.5,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) {
                            return ' Units Sold: ' + ctx.parsed.y + ' units';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b', font: { size: 11, weight: '500' } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(226, 232, 240, 0.8)' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 11 },
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// ----- Low stock -----
async function loadLowStock() {
    const tbody = document.getElementById('lowstock-tbody');
    const badge = document.getElementById('sidebar-lowstock-badge');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:24px 0;">Loading stock alerts…</td></tr>`;
    
    try {
        const rows = await api.get('/api/admin/analytics/low-stock');
        const count = rows ? rows.length : 0;
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
        }

        if (!rows || !rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding:32px 0;">
                        <div class="empty-stock-ok">
                            <span class="ok-icon">🎉</span>
                            <strong>All products are well stocked!</strong>
                            <p style="color:var(--text-muted); font-size:12.5px; margin-top:4px;">No immediate inventory replenishments required.</p>
                        </div>
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = rows.map(p => {
            const qty = p.stockQuantity ?? 0;
            const isOut = qty === 0 || p.status === 'OUT_OF_STOCK';
            const statusCls = isOut ? 'badge-danger' : 'badge-warning';
            const statusLabel = isOut ? 'Out of Stock' : 'Low Stock';
            const stockBarWidth = Math.min(100, Math.max(8, qty * 10));

            return `
            <tr>
                <td>
                    <strong class="font-bold">${esc(p.name)}</strong>
                </td>
                <td>
                    <div class="stock-level-indicator">
                        <div class="stock-bar-track">
                            <div class="stock-bar-fill ${isOut ? 'critical' : 'low'}" style="width: ${stockBarWidth}%"></div>
                        </div>
                        <span class="stock-qty-text font-mono">${qty} left</span>
                    </div>
                </td>
                <td class="font-bold">${inr(p.price)}</td>
                <td><span class="badge ${statusCls}">${statusLabel}</span></td>
                <td class="text-right">
                    <a href="admin.html" class="btn btn-sm btn-outline-primary btn-restock-action">
                        Restock &rarr;
                    </a>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--danger); padding:20px 0;">Failed to load low-stock alerts.</td></tr>`;
    }
}

// ----- Recent orders -----
async function loadRecentOrders() {
    const tbody = document.getElementById('recent-orders-tbody');
    const status = document.getElementById('recent-status-filter').value;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px 0;">Loading orders…</td></tr>`;
    
    try {
        const categoryQuery = selectedCategoryId ? `&categoryId=${selectedCategoryId}` : '';
        const r = await api.get(
            `/api/admin/analytics/recent-orders?page=${recentPage}&size=${RECENT_SIZE}&status=${status}${categoryQuery}`);
        
        if (!r.content || !r.content.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:32px 0;">No matching orders found.</td></tr>`;
        } else {
            tbody.innerHTML = r.content.map(o => `
                <tr>
                    <td>
                        <a href="order-detail.html?id=${o.orderId}" target="_blank" class="order-id-link">
                            #${o.orderId}
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="12" height="12">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                        </a>
                    </td>
                    <td class="font-mono text-muted">${o.orderDate ? o.orderDate.slice(0, 10) : '—'}</td>
                    <td class="font-bold">${inr(o.totalAmount)}</td>
                    <td>
                        <div class="payment-meta-badge">
                            <span class="payment-method-text">${esc(o.paymentMethod || 'CARD')}</span>
                            <span class="payment-status-dot ${o.paymentStatus === 'SUCCESS' ? 'ok' : 'pending'}">${esc(o.paymentStatus || '—')}</span>
                        </div>
                    </td>
                    <td><span class="badge ${badgeClassFor(o.status)}">${o.status}</span></td>
                    <td class="text-right">
                        <a href="order-detail.html?id=${o.orderId}" target="_blank" class="btn btn-sm btn-outline btn-view-order">
                            View Details &rarr;
                        </a>
                    </td>
                </tr>`).join('');
        }
        document.getElementById('recent-page-info').textContent = `Page ${r.page + 1} of ${Math.max(1, r.totalPages)}`;
        document.getElementById('recent-prev').disabled = r.page <= 0;
        document.getElementById('recent-next').disabled = r.page >= r.totalPages - 1;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--danger); padding:20px 0;">Failed to load orders.</td></tr>`;
    }
}

// ----- CSV export -----
async function exportSalesCsv() {
    try {
        const token = localStorage.getItem('token');
        const categoryQuery = selectedCategoryId ? `&categoryId=${selectedCategoryId}` : '';
        const res = await fetch(
            `${API_BASE}/api/admin/analytics/sales-report/export?month=${currentMonth}${categoryQuery}`,
            { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const catStr = selectedCategoryId ? `-cat-${selectedCategoryId}` : '';
        a.download = `sales-report-${currentMonth}${catStr}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('CSV export downloaded successfully', 'success');
    } catch (err) {
        showToast('Could not export CSV.', 'error');
    }
}

// ----- PDF export -----
async function exportSalesPdf() {
    try {
        const token = localStorage.getItem('token');
        const categoryQuery = selectedCategoryId ? `&categoryId=${selectedCategoryId}` : '';
        const res = await fetch(
            `${API_BASE}/api/admin/analytics/sales-report/export-pdf?month=${currentMonth}${categoryQuery}`,
            { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const catStr = selectedCategoryId ? `-cat-${selectedCategoryId}` : '';
        a.download = `sales-report-${currentMonth}${catStr}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('PDF sales report downloaded', 'success');
    } catch (err) {
        showToast('Could not export PDF.', 'error');
    }
}

// ----- Product-trend search dropdown -----
async function trendSearch(q, autoSelectFirst = false) {
    const box = document.getElementById('trend-results');
    if (!q || q.trim().length < 2) {
        if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
        return;
    }
    try {
        const r = await api.get(`/api/admin/search?q=${encodeURIComponent(q.trim())}&type=products&limit=8`);
        if (!r.products || !r.products.length) {
            if (box) {
                box.innerHTML = `<div class="search-hit muted">No matching products</div>`;
                box.classList.remove('hidden');
            }
            return;
        }

        if (autoSelectFirst) {
            const first = r.products[0];
            selectedTrendProductId = Number(first.id);
            document.getElementById('trend-search').value = first.name;
            if (box) box.classList.add('hidden');
            loadProductTrend(selectedTrendProductId);
            return;
        }

        if (box) {
            box.innerHTML = r.products.map(p =>
                `<div class="search-hit" data-product-id="${p.id}" data-product-name="${esc(p.name)}">
                    <span class="hit-name">${esc(p.name)}</span>
                    <span class="hit-badge font-mono">ID: ${p.id}</span>
                </div>`).join('');
            box.classList.remove('hidden');

            box.querySelectorAll('.search-hit[data-product-id]').forEach(hit => {
                hit.addEventListener('click', () => {
                    selectedTrendProductId = Number(hit.dataset.productId);
                    document.getElementById('trend-search').value = hit.dataset.productName;
                    box.classList.add('hidden');
                    loadProductTrend(selectedTrendProductId);
                });
            });
        }
    } catch (err) {
        if (box) box.classList.add('hidden');
    }
}
