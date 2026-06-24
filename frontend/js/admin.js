import { api } from './api.js';
import { showToast, showModal, showConfirm, showLoader, hideLoader } from './ui.js';
import './navbar.js';

// Admin page states
let categoriesCache = [];
let activeTab = 'products-panel';

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
    if (panelId === 'products-panel') {
        loadAdminProducts();
    } else if (panelId === 'categories-panel') {
        loadAdminCategories();
    } else if (panelId === 'orders-panel') {
        loadAdminOrders();
    }
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
            const fallbackImage = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%23cbd5e1" width="100%" height="100%"><rect width="100%" height="100%" fill="%23f1f5f9"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" /></svg>`;
            
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
                <label for="prod-img" class="form-label">Image URL</label>
                <input type="url" id="prod-img" class="form-control" value="${product?.imageUrl || ''}" placeholder="https://example.com/image.jpg">
            </div>
        </form>
    `;

    showModal({
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
