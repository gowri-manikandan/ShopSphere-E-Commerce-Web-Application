import { api } from './api.js';
import { showToast, showModal, showConfirm, showLoader, hideLoader } from './ui.js';
import { API_BASE } from './config.js';
import './navbar.js';

// Admin page states
let categoriesCache = [];
let activeTab = 'dashboard-panel';

// Store Chart instances to avoid duplicates overlay canvas context bugs
let charts = {
    monthlyRevenue: null,
    monthlyOrders: null,
    orderStatus: null,
    categoryProducts: null,
    userRegistration: null,
    topProducts: null
};

// DOM Elements
const tabBtns = document.querySelectorAll('.admin-tab-btn');
const tabPanels = document.querySelectorAll('.admin-tab-panel');

const productsTbody = document.getElementById('admin-products-tbody');
const categoriesTbody = document.getElementById('admin-categories-tbody');
const ordersTbody = document.getElementById('admin-orders-tbody');

const addProductBtn = document.getElementById('admin-add-product-btn');
const addCategoryBtn = document.getElementById('admin-add-category-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Setup tab listeners
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPanel = btn.getAttribute('data-tab-target');
            
            // Toggle active classes
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const panel = document.getElementById(targetPanel);
            if (panel) panel.classList.add('active');

            activeTab = targetPanel;
            loadTabContent(targetPanel);
        });
    });

    // Add Product modal triggers
    addProductBtn.addEventListener('click', () => openProductModal());
    // Add Category modal triggers
    addCategoryBtn.addEventListener('click', () => openCategoryModal());

    // Load initial products list + categories cache
    initAdminDashboard();
});

async function initAdminDashboard() {
    await loadCategoriesCache();
    loadTabContent(activeTab);
}

// Load categories cache for selects dropdowns
async function loadCategoriesCache() {
    try {
        categoriesCache = await api.get('/api/categories', true);
    } catch (err) {
        console.error("Failed to load categories cache:", err);
    }
}

// Routing tab content fetches
function loadTabContent(panelId) {
    if (panelId === 'dashboard-panel') {
        loadDashboardStats();
    } else if (panelId === 'products-panel') {
        loadAdminProducts();
    } else if (panelId === 'categories-panel') {
        loadAdminCategories();
    } else if (panelId === 'orders-panel') {
        loadAdminOrders();
    }
}

// ==========================================
// Dashboard Stats and Charts
// ==========================================
async function loadDashboardStats() {
    try {
        showLoader();
        const stats = await api.get('/api/admin/dashboard/stats');
        
        // Populate stats counts
        document.getElementById('stats-total-users').textContent = stats.totalUsers;
        document.getElementById('stats-total-revenue').textContent = `₹${stats.totalRevenue ? stats.totalRevenue.toFixed(2) : '0.00'}`;
        document.getElementById('stats-total-products').textContent = stats.totalProducts;
        document.getElementById('stats-total-orders').textContent = stats.totalOrders;
        document.getElementById('stats-delivered-orders').textContent = stats.deliveredOrders;
        document.getElementById('stats-cancelled-orders').textContent = stats.cancelledOrders;

        // Render the 6 charts
        renderMonthlyRevenueChart(stats.monthlySales);
        renderMonthlyOrdersChart(stats.monthlySales);
        renderOrderStatusChart(stats.orderStatusCounts);
        renderCategoryProductsChart(stats.categoryProductCounts);
        renderUserRegistrationChart(stats.userRegistrationTrends);
        renderTopProductsChart(stats.topSellingProducts);

    } catch (err) {
        showToast(err.message || 'Failed to load dashboard stats.', 'error');
    } finally {
        hideLoader();
    }
}

function renderMonthlyRevenueChart(data) {
    if (charts.monthlyRevenue) charts.monthlyRevenue.destroy();
    const ctx = document.getElementById('chart-monthly-revenue').getContext('2d');
    const labels = data.map(d => d.month);
    const values = data.map(d => d.sales);

    charts.monthlyRevenue = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue (₹)',
                data: values,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function renderMonthlyOrdersChart(data) {
    if (charts.monthlyOrders) charts.monthlyOrders.destroy();
    const ctx = document.getElementById('chart-monthly-orders').getContext('2d');
    const labels = data.map(d => d.month);
    const values = data.map(d => Math.max(1, Math.round(d.sales / 500)));

    charts.monthlyOrders = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Order Volume',
                data: values,
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function renderOrderStatusChart(data) {
    if (charts.orderStatus) charts.orderStatus.destroy();
    const ctx = document.getElementById('chart-order-status').getContext('2d');
    const labels = data.map(d => d.status);
    const values = data.map(d => d.count);

    charts.orderStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: ['#f59e0b', '#10b981', '#ef4444', '#3b82f6']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderCategoryProductsChart(data) {
    if (charts.categoryProducts) charts.categoryProducts.destroy();
    const ctx = document.getElementById('chart-category-products').getContext('2d');
    const labels = data.map(d => d.categoryName);
    const values = data.map(d => d.count);

    charts.categoryProducts = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: ['rgba(99, 102, 241, 0.6)', 'rgba(16, 185, 129, 0.6)', 'rgba(245, 158, 11, 0.6)', 'rgba(59, 130, 246, 0.6)']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderUserRegistrationChart(data) {
    if (charts.userRegistration) charts.userRegistration.destroy();
    const ctx = document.getElementById('chart-user-registration').getContext('2d');
    const labels = data.map(d => d.date);
    const values = data.map(d => d.count);

    charts.userRegistration = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'New Registrations',
                data: values,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function renderTopProductsChart(data) {
    if (charts.topProducts) charts.topProducts.destroy();
    const ctx = document.getElementById('chart-top-products').getContext('2d');
    const labels = data.map(d => d.productName);
    const values = data.map(d => d.quantity);

    charts.topProducts = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Units Sold',
                data: values,
                backgroundColor: '#8b5cf6',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

// ==========================================
// Products Admin Logic
// ==========================================
async function loadAdminProducts() {
    try {
        showLoader();
        const products = await api.get('/api/products', true);
        productsTbody.innerHTML = '';

        if (!products || products.length === 0) {
            productsTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No products found. Add your first product.</td></tr>`;
            return;
        }

        products.forEach(prod => {
            const tr = document.createElement('tr');
            const fallbackImage = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlPSIjY2JkNWUxIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEiIGQ9Ik0yLjI1IDE1YTQuNSA0LjUgMCAwMDQuNSA0LjVIMThhMy43NSAzLjc1IDAgMDAxLjMzMi03LjI1NyAzIDMgMCAwMC0zLjc1OC0zLjg0OCA1LjI1IDUuMjUgMCAwMC0xMC4yMzMgMi4zM0E0LjUwMiA0LjUwMiAwIDAwMi4yNSAxNXoiIC8+PC9zdmc+`;
            
            tr.innerHTML = `
                <td><img src="${prod.imageUrl || fallbackImage}" class="admin-table-img" alt="${prod.name}" onerror="this.src='${fallbackImage}'"></td>
                <td style="font-weight:600;">${prod.name}</td>
                <td><span class="badge badge-info">${prod.categoryName || 'General'}</span></td>
                <td style="font-family:var(--font-heading); font-weight:700;">₹${prod.price.toFixed(2)}</td>
                <td><span style="font-weight: 600; color: ${prod.stockQuantity <= 0 ? 'var(--danger)' : 'var(--text-main)'};">${prod.stockQuantity}</span></td>
                <td>
                    <div class="admin-actions-cell">
                        <button class="btn btn-secondary btn-sm edit-prod-btn" data-id="${prod.id}">Edit</button>
                        <button class="btn btn-danger btn-sm delete-prod-btn" data-id="${prod.id}">Delete</button>
                    </div>
                </td>
            `;

            // Bind CRUD operations
            tr.querySelector('.edit-prod-btn').addEventListener('click', () => openProductModal(prod));
            tr.querySelector('.delete-prod-btn').addEventListener('click', () => handleDeleteProduct(prod));

            productsTbody.appendChild(tr);
        });
    } catch (err) {
        showToast(err.message || 'Failed to load products list.', 'error');
    } finally {
        hideLoader();
    }
}

// Open Product add/edit form modal
function openProductModal(product = null) {
    const isEdit = !!product;
    const title = isEdit ? 'Edit Product Details' : 'Add New Product';
    
    // Category select options
    const categoryOptions = categoriesCache.map(cat => 
        `<option value="${cat.id}" ${product && product.categoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`
    ).join('');

    const formHtml = `
        <form id="product-modal-form" style="display:flex; flex-direction:column; gap:16px;">
            <div class="form-group">
                <label for="prod-name" class="form-label">Product Name</label>
                <input type="text" id="prod-name" class="form-control" value="${product?.name || ''}" placeholder="E.g., Wireless Headset" required>
            </div>
            
            <div class="form-group">
                <label for="prod-desc" class="form-label">Description</label>
                <textarea id="prod-desc" class="form-control" rows="3" placeholder="Enter product detailed specifications...">${product?.description || ''}</textarea>
            </div>

            <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                <div>
                    <label for="prod-price" class="form-label">Price (INR)</label>
                    <input type="number" step="0.01" id="prod-price" class="form-control" value="${product?.price || ''}" placeholder="E.g., 999.00" required>
                </div>
                <div>
                    <label for="prod-stock" class="form-label">Stock Quantity</label>
                    <input type="number" id="prod-stock" class="form-control" value="${product?.stockQuantity ?? ''}" placeholder="E.g., 50" required>
                </div>
            </div>

            <div class="form-group">
                <label for="prod-cat" class="form-label">Category</label>
                <select id="prod-cat" class="form-control" required style="height: 42px;">
                    <option value="" disabled ${!product ? 'selected' : ''}>Select Category</option>
                    ${categoryOptions}
                </select>
            </div>

            <div class="form-group">
                <label class="form-label">Product Image</label>
                <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
                    <input type="url" id="prod-img" class="form-control" value="${product?.imageUrl || ''}" placeholder="https://example.com/image.jpg" style="flex: 1;">
                    <span style="font-size: 13px; color: var(--text-muted); font-weight: 600;">OR</span>
                    <label class="file-upload-custom-btn" style="margin: 0; padding: 10px 14px; font-size: 13px; height: auto; flex-shrink: 0;">
                        <span>Upload File</span>
                        <input type="file" id="prod-file-upload" class="file-upload-input-hidden" accept="image/*">
                    </label>
                </div>
                <div class="upload-preview-container" id="prod-upload-preview-container" style="${product?.imageUrl ? 'display: flex;' : 'display: none;'}">
                    <div class="upload-preview-box">
                        <img id="prod-upload-preview-img" src="${product?.imageUrl || ''}">
                    </div>
                    <span style="font-size: 12px; color: var(--text-muted);">Preview</span>
                </div>
            </div>
        </form>
    `;

    const modalEl = showModal({
        title,
        contentHtml: formHtml,
        confirmText: isEdit ? 'Update Product' : 'Create Product',
        cancelText: 'Cancel',
        onConfirm: async (modalEl) => {
            const name = modalEl.querySelector('#prod-name').value.trim();
            const description = modalEl.querySelector('#prod-desc').value.trim();
            const priceVal = parseFloat(modalEl.querySelector('#prod-price').value);
            const stockVal = parseInt(modalEl.querySelector('#prod-stock').value);
            const categoryIdVal = modalEl.querySelector('#prod-cat').value;
            const imageUrl = modalEl.querySelector('#prod-img').value.trim();

            if (!name || isNaN(priceVal) || isNaN(stockVal) || !categoryIdVal) {
                showToast('Please fill out all required fields.', 'error');
                return false;
            }

            if (priceVal <= 0) {
                showToast('Price must be greater than 0.', 'error');
                return false;
            }

            if (stockVal < 0) {
                showToast('Stock quantity cannot be negative.', 'error');
                return false;
            }

            const body = {
                name,
                description,
                price: priceVal,
                stockQuantity: stockVal,
                categoryId: parseInt(categoryIdVal),
                imageUrl: imageUrl || null
            };

            try {
                showLoader();
                if (isEdit) {
                    await api.put(`/api/products/${product.id}`, body);
                    showToast('Product updated successfully.', 'success');
                } else {
                    await api.post('/api/products', body);
                    showToast('Product created successfully.', 'success');
                }
                await loadAdminProducts();
                return true; // close modal
            } catch (err) {
                showToast(err.message || 'Action failed.', 'error');
                return false;
            } finally {
                hideLoader();
            }
        }
    });

    // Wire up file upload
    const fileInput = modalEl.querySelector('#prod-file-upload');
    const imgUrlInput = modalEl.querySelector('#prod-img');
    const previewContainer = modalEl.querySelector('#prod-upload-preview-container');
    const previewImg = modalEl.querySelector('#prod-upload-preview-img');

    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            if (!fileInput.files || fileInput.files.length === 0) return;
            const file = fileInput.files[0];
            
            // Client side validation
            if (file.size > 2 * 1024 * 1024) {
                showToast('File size is larger than 2MB.', 'error');
                fileInput.value = '';
                return;
            }
            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg'];
            if (!validTypes.includes(file.type)) {
                showToast('Invalid file format. Please upload JPEG, PNG, or GIF.', 'error');
                fileInput.value = '';
                return;
            }

            const formData = new FormData();
            formData.append('file', file);

            try {
                showLoader();
                const token = localStorage.getItem('token');
                const uploadResponse = await fetch(`${API_BASE}/api/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });
                if (!uploadResponse.ok) {
                    const errData = await uploadResponse.json();
                    throw new Error(errData?.message || 'Failed to upload photo.');
                }
                const data = await uploadResponse.json();
                const fileUrl = data.url; // relative path e.g. "uploads/xyz.jpg"

                imgUrlInput.value = fileUrl;
                previewImg.src = fileUrl;
                previewContainer.style.display = 'flex';
                showToast('Image uploaded successfully!', 'success');
            } catch (err) {
                showToast(err.message || 'Image upload failed.', 'error');
            } finally {
                hideLoader();
            }
        });
    }

    if (imgUrlInput) {
        imgUrlInput.addEventListener('input', () => {
            const val = imgUrlInput.value.trim();
            if (val) {
                previewImg.src = val;
                previewContainer.style.display = 'flex';
            } else {
                previewContainer.style.display = 'none';
            }
        });
    }
}

// Delete product
function handleDeleteProduct(product) {
    showConfirm(
        'Delete Product',
        `Are you sure you want to permanently delete the product "${product.name}"? This action cannot be undone.`,
        async () => {
            try {
                showLoader();
                await api.delete(`/api/products/${product.id}`);
                showToast('Product deleted successfully.', 'success');
                await loadAdminProducts();
            } catch (err) {
                showToast(err.message || 'Failed to delete product.', 'error');
            } finally {
                hideLoader();
            }
        }
    );
}

// ==========================================
// Categories Admin Logic
// ==========================================
async function loadAdminCategories() {
    try {
        showLoader();
        const categories = await api.get('/api/categories', true);
        categoriesTbody.innerHTML = '';

        if (!categories || categories.length === 0) {
            categoriesTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No categories found. Create one to get started.</td></tr>`;
            return;
        }

        // Cache update
        categoriesCache = categories;

        categories.forEach(cat => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family:monospace; font-weight:700;">#${cat.id}</td>
                <td style="font-weight:600;">${cat.name}</td>
                <td style="color:var(--text-muted);">${cat.description || 'No description'}</td>
                <td>
                    <div class="admin-actions-cell">
                        <button class="btn btn-secondary btn-sm edit-cat-btn" data-id="${cat.id}">Edit</button>
                        <button class="btn btn-danger btn-sm delete-cat-btn" data-id="${cat.id}">Delete</button>
                    </div>
                </td>
            `;

            tr.querySelector('.edit-cat-btn').addEventListener('click', () => openCategoryModal(cat));
            tr.querySelector('.delete-cat-btn').addEventListener('click', () => handleDeleteCategory(cat));

            categoriesTbody.appendChild(tr);
        });
    } catch (err) {
        showToast(err.message || 'Failed to load categories.', 'error');
    } finally {
        hideLoader();
    }
}

// Open Category Form Modal
function openCategoryModal(cat = null) {
    const isEdit = !!cat;
    const title = isEdit ? 'Edit Category Details' : 'Add New Category';

    const formHtml = `
        <form id="category-modal-form" style="display:flex; flex-direction:column; gap:16px;">
            <div class="form-group">
                <label for="cat-name" class="form-label">Category Name</label>
                <input type="text" id="cat-name" class="form-control" value="${cat?.name || ''}" placeholder="E.g., Smart Electronics" required>
            </div>
            
            <div class="form-group">
                <label for="cat-desc" class="form-label">Description</label>
                <textarea id="cat-desc" class="form-control" rows="3" placeholder="Enter brief category description...">${cat?.description || ''}</textarea>
            </div>
        </form>
    `;

    showModal({
        title,
        contentHtml: formHtml,
        confirmText: isEdit ? 'Update Category' : 'Create Category',
        cancelText: 'Cancel',
        onConfirm: async (modalEl) => {
            const name = modalEl.querySelector('#cat-name').value.trim();
            const description = modalEl.querySelector('#cat-desc').value.trim();

            if (!name) {
                showToast('Category name is required.', 'error');
                return false;
            }

            const body = { name, description };

            try {
                showLoader();
                if (isEdit) {
                    await api.put(`/api/categories/${cat.id}`, body);
                    showToast('Category updated successfully.', 'success');
                } else {
                    await api.post('/api/categories', body);
                    showToast('Category created successfully.', 'success');
                }
                await loadCategoriesCache(); // sync cache
                await loadAdminCategories();
                return true;
            } catch (err) {
                showToast(err.message || 'Action failed.', 'error');
                return false;
            } finally {
                hideLoader();
            }
        }
    });
}

// Delete category
function handleDeleteCategory(cat) {
    showConfirm(
        'Delete Category',
        `Are you sure you want to permanently delete the category "${cat.name}"? This will affect products mapped to it.`,
        async () => {
            try {
                showLoader();
                await api.delete(`/api/categories/${cat.id}`);
                showToast('Category deleted successfully.', 'success');
                await loadCategoriesCache(); // sync cache
                await loadAdminCategories();
            } catch (err) {
                showToast(err.message || 'Failed to delete category.', 'error');
            } finally {
                hideLoader();
            }
        }
    );
}

// ==========================================
// Orders Admin Logic
// ==========================================
async function loadAdminOrders() {
    try {
        showLoader();
        const orders = await api.get('/api/admin/orders');
        ordersTbody.innerHTML = '';

        if (!orders || orders.length === 0) {
            ordersTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No customer orders found in system.</td></tr>`;
            return;
        }

        orders.forEach(order => {
            const tr = document.createElement('tr');
            
            // Format order date
            const dateObj = new Date(order.orderDate);
            const dateStr = dateObj.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            // Map status values for color-coding the select element if needed
            const selectHtml = `
                <select class="status-dropdown admin-status-select" data-order-id="${order.orderId}">
                    <option value="PLACED" ${order.status === 'PLACED' ? 'selected' : ''}>PLACED</option>
                    <option value="SHIPPED" ${order.status === 'SHIPPED' ? 'selected' : ''}>SHIPPED</option>
                    <option value="DELIVERED" ${order.status === 'DELIVERED' ? 'selected' : ''}>DELIVERED</option>
                    <option value="CANCELLED" ${order.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
                </select>
            `;

            tr.innerHTML = `
                <td style="font-family:monospace; font-weight:700;">#${order.orderId}</td>
                <td>${dateStr}</td>
                <td style="font-family:var(--font-heading); font-weight:700;">₹${order.totalAmount.toFixed(2)}</td>
                <td>
                    <span style="font-size:12px; font-weight:600; display:block; text-transform:uppercase;">${order.paymentMethod}</span>
                    <span class="badge ${order.paymentStatus === 'SUCCESS' ? 'badge-success' : (order.paymentStatus === 'FAILED' ? 'badge-danger' : 'badge-warning')}" style="font-size:10px; padding: 2px 6px;">${order.paymentStatus}</span>
                </td>
                <td>${selectHtml}</td>
                <td style="font-family:monospace; font-size:12px;">${order.transactionRef || 'N/A'}</td>
            `;

            // Change event handler
            const selectEl = tr.querySelector('.admin-status-select');
            selectEl.addEventListener('change', async (e) => {
                const newStatus = e.target.value;
                try {
                    showLoader();
                    await api.put(`/api/admin/orders/${order.orderId}/status?status=${newStatus}`);
                    showToast(`Order #${order.orderId} status updated to ${newStatus}.`, 'success');
                    
                    // Refresh current panel list
                    loadAdminOrders();
                } catch (err) {
                    showToast(err.message || 'Failed to update order status.', 'error');
                    // Reset original status visually
                    selectEl.value = order.status;
                } finally {
                    hideLoader();
                }
            });

            ordersTbody.appendChild(tr);
        });

    } catch (err) {
        showToast(err.message || 'Failed to load client orders.', 'error');
    } finally {
        hideLoader();
    }
}
