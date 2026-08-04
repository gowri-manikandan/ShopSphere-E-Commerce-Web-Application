import { api } from './api.js';
import { showToast, showModal, showConfirm, showLoader, hideLoader } from './ui.js';
import { API_BASE } from './config.js';
import './navbar.js';

// Admin page states
let categoriesCache = [];
let activeTab = 'products-panel';
let showDeletedProducts = false;

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

    // Setup Active/Deleted product filters
    const prodFilterActiveBtn = document.getElementById('prod-filter-active-btn');
    const prodFilterDeletedBtn = document.getElementById('prod-filter-deleted-btn');
    if (prodFilterActiveBtn && prodFilterDeletedBtn) {
        prodFilterActiveBtn.addEventListener('click', () => {
            showDeletedProducts = false;
            prodFilterActiveBtn.classList.remove('btn-secondary');
            prodFilterActiveBtn.classList.add('btn-primary');
            prodFilterDeletedBtn.classList.remove('btn-primary');
            prodFilterDeletedBtn.classList.add('btn-secondary');
            loadAdminProducts();
        });
        prodFilterDeletedBtn.addEventListener('click', () => {
            showDeletedProducts = true;
            prodFilterDeletedBtn.classList.remove('btn-secondary');
            prodFilterDeletedBtn.classList.add('btn-primary');
            prodFilterActiveBtn.classList.remove('btn-primary');
            prodFilterActiveBtn.classList.add('btn-secondary');
            loadAdminProducts();
        });
    }

    // Load initial products list + categories cache
    initAdminDashboard();
});

async function initAdminDashboard() {
    await loadCategoriesCache();
    loadTabContent(activeTab);

    // Deep-link from the catalog's admin "Edit" button: ?edit={productId} opens its edit modal.
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (editId) {
        try {
            const product = await api.get(`/api/products/${editId}`, true);
            openProductModal(product);
        } catch (err) {
            showToast('Could not open that product for editing.', 'error');
        }
    }
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
        const products = await api.get('/api/products?includeDeleted=true');
        productsTbody.innerHTML = '';

        const filteredProducts = products ? products.filter(p => p.deleted === showDeletedProducts) : [];

        if (filteredProducts.length === 0) {
            productsTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No products found.</td></tr>`;
            return;
        }

        filteredProducts.forEach(prod => {
            const tr = document.createElement('tr');
            const fallbackImage = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%23cbd5e1" width="100%" height="100%"%3E%3Crect width="100%" height="100%" fill="%23f1f5f9"/%3E%3Cpath stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"/%3E%3C/svg%3E';
            
            const actionsCell = prod.deleted ? 
                `<button class="btn btn-primary btn-sm restore-prod-btn" data-id="${prod.id}">Restore</button>` :
                `<button class="btn btn-secondary btn-sm edit-prod-btn" data-id="${prod.id}">Edit</button>
                 <button class="btn btn-danger btn-sm delete-prod-btn" data-id="${prod.id}">Delete</button>`;

            tr.innerHTML = `
                <td><img src="${prod.imageUrl || fallbackImage}" class="admin-table-img" alt="${prod.name}" loading="lazy" onerror="this.onerror=null; this.src='${fallbackImage}'"></td>
                <td style="font-weight:600; ${prod.deleted ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${prod.name}</td>
                <td><span class="badge badge-info">${prod.categoryName || 'General'}</span></td>
                <td style="font-family:var(--font-heading); font-weight:700;">₹${prod.price.toFixed(2)}</td>
                <td><span style="font-weight: 600; color: ${prod.stockQuantity <= 0 ? 'var(--danger)' : 'var(--text-main)'};">${prod.stockQuantity}</span></td>
                <td>
                    <div class="admin-actions-cell">
                        ${actionsCell}
                    </div>
                </td>
            `;

            // Bind CRUD operations
            if (prod.deleted) {
                tr.querySelector('.restore-prod-btn').addEventListener('click', () => handleRestoreProduct(prod));
            } else {
                tr.querySelector('.edit-prod-btn').addEventListener('click', () => openProductModal(prod));
                tr.querySelector('.delete-prod-btn').addEventListener('click', () => handleDeleteProduct(prod));
            }

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
    
    let tempAdditionalImages = product ? [...(product.additionalImages || [])] : [];

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
                <label class="form-label">Main Product Image</label>
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

            <div class="form-group">
                <label class="form-label">Additional Product Images</label>
                <div id="additional-images-list" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
                    <!-- Rendered dynamically -->
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="url" id="prod-additional-img-url" class="form-control" placeholder="https://example.com/additional-image.jpg" style="flex: 1;">
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-add-additional-url" style="height: 42px; padding: 0 16px;">Add URL</button>
                    <span style="font-size: 13px; color: var(--text-muted); font-weight: 600;">OR</span>
                    <label class="file-upload-custom-btn" style="margin: 0; padding: 10px 14px; font-size: 13px; height: auto; flex-shrink: 0;">
                        <span>Upload File</span>
                        <input type="file" id="prod-additional-file-upload" class="file-upload-input-hidden" accept="image/*">
                    </label>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Product Video Showcase</label>
                <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
                    <input type="url" id="prod-video-url" class="form-control" value="${product?.videoUrl || ''}" placeholder="https://example.com/video.mp4" style="flex: 1;">
                    <span style="font-size: 13px; color: var(--text-muted); font-weight: 600;">OR</span>
                    <label class="file-upload-custom-btn" style="margin: 0; padding: 10px 14px; font-size: 13px; height: auto; flex-shrink: 0;">
                        <span>Upload Video</span>
                        <input type="file" id="prod-video-file-upload" class="file-upload-input-hidden" accept="video/*">
                    </label>
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
            const videoUrl = modalEl.querySelector('#prod-video-url').value.trim();

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
                imageUrl: imageUrl || null,
                additionalImages: tempAdditionalImages,
                videoUrl: videoUrl || null
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

    // Wire up additional images management
    const additionalImagesList = modalEl.querySelector('#additional-images-list');
    const btnAddAdditionalUrl = modalEl.querySelector('#btn-add-additional-url');
    const inputAdditionalUrl = modalEl.querySelector('#prod-additional-img-url');
    const fileAdditionalInput = modalEl.querySelector('#prod-additional-file-upload');

    const renderTempAdditionalImages = () => {
        if (!additionalImagesList) return;
        additionalImagesList.innerHTML = '';
        if (tempAdditionalImages.length === 0) {
            additionalImagesList.innerHTML = '<span style="font-size: 13px; color: var(--text-muted); font-style: italic;">No additional images added.</span>';
            return;
        }
        tempAdditionalImages.forEach((img, idx) => {
            const imgBox = document.createElement('div');
            imgBox.style.cssText = 'position: relative; width: 60px; height: 60px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center;';
            imgBox.innerHTML = `
                <img src="${img}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
                <button type="button" class="btn-remove-additional-img" data-index="${idx}" style="position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--danger); color: #fff; border: none; display: flex; align-items: center; justify-content: center; font-size: 10px; cursor: pointer; font-weight: bold; padding: 0;">&times;</button>
            `;
            additionalImagesList.appendChild(imgBox);
        });

        // Bind remove button click
        additionalImagesList.querySelectorAll('.btn-remove-additional-img').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.getAttribute('data-index'));
                tempAdditionalImages.splice(index, 1);
                renderTempAdditionalImages();
            });
        });
    };

    // Initial render of additional images
    renderTempAdditionalImages();

    // Bind Add URL button
    if (btnAddAdditionalUrl && inputAdditionalUrl) {
        btnAddAdditionalUrl.addEventListener('click', () => {
            const val = inputAdditionalUrl.value.trim();
            if (val) {
                if (!tempAdditionalImages.includes(val)) {
                    tempAdditionalImages.push(val);
                    renderTempAdditionalImages();
                }
                inputAdditionalUrl.value = '';
            }
        });
    }

    // Bind additional file upload input
    if (fileAdditionalInput) {
        fileAdditionalInput.addEventListener('change', async () => {
            if (!fileAdditionalInput.files || fileAdditionalInput.files.length === 0) return;
            const file = fileAdditionalInput.files[0];
            
            // Name validation
            const name = modalEl.querySelector('#prod-name').value.trim();
            if (!name) {
                showToast('Please enter the Product Name first so we can organize media uploads.', 'warning');
                fileAdditionalInput.value = '';
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                showToast('File size is larger than 10MB.', 'error');
                fileAdditionalInput.value = '';
                return;
            }
            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg'];
            if (!validTypes.includes(file.type)) {
                showToast('Invalid file format. Please upload JPEG, PNG, or GIF.', 'error');
                fileAdditionalInput.value = '';
                return;
            }

            const nextIndex = tempAdditionalImages.length + 2; // Image 1 is main, additional starts at Image 2

            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', name);
            formData.append('publicId', `Image ${nextIndex}`);

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
                const bodyData = await uploadResponse.json();
                const fileUrl = (bodyData.data || bodyData).url;

                if (!tempAdditionalImages.includes(fileUrl)) {
                    tempAdditionalImages.push(fileUrl);
                    renderTempAdditionalImages();
                }
                showToast('Additional image uploaded successfully!', 'success');
            } catch (err) {
                showToast(err.message || 'Additional image upload failed.', 'error');
            } finally {
                hideLoader();
                fileAdditionalInput.value = '';
            }
        });
    }

    // Wire up main file upload
    const fileInput = modalEl.querySelector('#prod-file-upload');
    const imgUrlInput = modalEl.querySelector('#prod-img');
    const previewContainer = modalEl.querySelector('#prod-upload-preview-container');
    const previewImg = modalEl.querySelector('#prod-upload-preview-img');

    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            if (!fileInput.files || fileInput.files.length === 0) return;
            const file = fileInput.files[0];
            
            // Name validation
            const name = modalEl.querySelector('#prod-name').value.trim();
            if (!name) {
                showToast('Please enter the Product Name first so we can organize media uploads.', 'warning');
                fileInput.value = '';
                return;
            }

            // Client side validation
            if (file.size > 10 * 1024 * 1024) {
                showToast('File size is larger than 10MB.', 'error');
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
            formData.append('folder', name);
            formData.append('publicId', 'Image 1');

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
                const bodyData = await uploadResponse.json();
                const fileUrl = (bodyData.data || bodyData).url; // unwrap ApiResponse (§8)

                imgUrlInput.value = fileUrl;
                previewImg.src = fileUrl;
                previewContainer.style.display = 'flex';
                showToast('Image uploaded successfully!', 'success');
            } catch (err) {
                showToast(err.message || 'Image upload failed.', 'error');
            } finally {
                hideLoader();
                fileInput.value = '';
            }
        });
    }

    // Wire up video file upload
    const videoFileInput = modalEl.querySelector('#prod-video-file-upload');
    const videoUrlInput = modalEl.querySelector('#prod-video-url');

    if (videoFileInput) {
        videoFileInput.addEventListener('change', async () => {
            if (!videoFileInput.files || videoFileInput.files.length === 0) return;
            const file = videoFileInput.files[0];

            // Name validation
            const name = modalEl.querySelector('#prod-name').value.trim();
            if (!name) {
                showToast('Please enter the Product Name first so we can organize media uploads.', 'warning');
                videoFileInput.value = '';
                return;
            }

            // Client side validation
            if (file.size > 50 * 1024 * 1024) {
                showToast('Video size exceeds the limit of 50MB.', 'error');
                videoFileInput.value = '';
                return;
            }
            const validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
            if (!validTypes.includes(file.type)) {
                showToast('Invalid video format. Please upload MP4, WebM, OGG, or MOV.', 'error');
                videoFileInput.value = '';
                return;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', name);
            formData.append('publicId', 'Demo Video');

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
                    throw new Error(errData?.message || 'Failed to upload video.');
                }
                const bodyData = await uploadResponse.json();
                const fileUrl = (bodyData.data || bodyData).url;

                videoUrlInput.value = fileUrl;
                showToast('Video uploaded successfully!', 'success');
            } catch (err) {
                showToast(err.message || 'Video upload failed.', 'error');
            } finally {
                hideLoader();
                videoFileInput.value = '';
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

// Restore product
function handleRestoreProduct(product) {
    showConfirm(
        'Restore Product',
        `Are you sure you want to restore the product "${product.name}"?`,
        async () => {
            try {
                showLoader();
                await api.put(`/api/products/${product.id}/restore`, {});
                showToast('Product restored successfully.', 'success');
                await loadAdminProducts();
            } catch (err) {
                showToast(err.message || 'Failed to restore product.', 'error');
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
                    <option value="CONFIRMED" ${order.status === 'CONFIRMED' ? 'selected' : ''}>CONFIRMED</option>
                    <option value="PACKED" ${order.status === 'PACKED' ? 'selected' : ''}>PACKED</option>
                    <option value="SHIPPED" ${order.status === 'SHIPPED' ? 'selected' : ''}>SHIPPED</option>
                    <option value="DELIVERED" ${order.status === 'DELIVERED' ? 'selected' : ''}>DELIVERED</option>
                    <option value="CANCELLED" ${order.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
                </select>
            `;

            let actionButtonsHtml = `<button class="btn btn-primary btn-sm admin-shipping-btn" data-order-id="${order.orderId}">Shipping Info</button>`;
            
            if (order.paymentMethod === 'COD' && order.paymentStatus === 'PENDING') {
                actionButtonsHtml += `
                    <button class="btn btn-success btn-sm admin-cod-confirm-btn" data-order-id="${order.orderId}" style="margin-top:6px; margin-left: 6px;">Confirm COD</button>
                    <button class="btn btn-danger btn-sm admin-cod-reject-btn" data-order-id="${order.orderId}" style="margin-top:6px; margin-left: 6px;">Reject COD</button>
                `;
            }

            tr.innerHTML = `
                <td style="font-family:monospace; font-weight:700;">#${order.orderId}</td>
                <td>${dateStr}</td>
                <td style="font-family:var(--font-heading); font-weight:700;">₹${order.totalAmount.toFixed(2)}</td>
                <td>
                    <span style="font-size:12px; font-weight:600; display:block; text-transform:uppercase;">${order.paymentMethod}</span>
                    <span class="badge ${order.paymentStatus === 'SUCCESS' ? 'badge-success' : (order.paymentStatus === 'FAILED' ? 'badge-danger' : 'badge-warning')}" style="font-size:10px; padding: 2px 6px;">${order.paymentStatus}</span>
                </td>
                <td>
                    ${selectHtml}
                    ${order.paymentStatus === 'SUCCESS' ? `<button class="btn btn-secondary btn-sm admin-refund-btn" data-order-id="${order.orderId}" style="margin-top:6px;">Refund</button>` : ''}
                </td>
                <td style="font-family:monospace; font-size:12px;">${order.transactionRef || 'N/A'}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        ${actionButtonsHtml}
                    </div>
                </td>
            `;

            // Bind click handlers
            tr.querySelector('.admin-shipping-btn').addEventListener('click', () => openShippingModal(order));
            
            const codConfirmBtn = tr.querySelector('.admin-cod-confirm-btn');
            if (codConfirmBtn) {
                codConfirmBtn.addEventListener('click', () => handleCodPayment(order, true));
            }
            
            const codRejectBtn = tr.querySelector('.admin-cod-reject-btn');
            if (codRejectBtn) {
                codRejectBtn.addEventListener('click', () => handleCodPayment(order, false));
            }

            // Refund handler (backend validates the payment is a refundable online capture)
            const refundBtn = tr.querySelector('.admin-refund-btn');
            if (refundBtn) {
                refundBtn.addEventListener('click', () => {
                    showConfirm(
                        'Refund Order',
                        `Refund and cancel order #${order.orderId}? This restores stock and cannot be undone.`,
                        async () => {
                            try {
                                showLoader();
                                await api.post(`/api/admin/orders/${order.orderId}/refund`);
                                showToast(`Order #${order.orderId} refunded and cancelled.`, 'success');
                                loadAdminOrders();
                            } catch (err) {
                                showToast(err.message || 'Refund failed.', 'error');
                            } finally {
                                hideLoader();
                            }
                        }
                    );
                });
            }

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

// Open modal to view and update shipping details
function openShippingModal(order) {
    const addr = order.shippingAddress || {};
    let estDeliveryVal = '';
    if (order.estimatedDeliveryDate) {
        estDeliveryVal = order.estimatedDeliveryDate.substring(0, 10);
    }

    const formHtml = `
        <form id="shipping-modal-form" style="display:flex; flex-direction:column; gap:16px;">
            <h4 style="margin: 0; font-size: 15px; color: var(--text-main); font-weight: 700; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">Delivery Address</h4>
            <div class="form-group">
                <label for="ship-line1" class="form-label">Address Line 1</label>
                <input type="text" id="ship-line1" class="form-control" value="${addr.line1 || ''}" placeholder="E.g., 12 Main St" required>
            </div>
            <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                <div>
                    <label for="ship-city" class="form-label">City</label>
                    <input type="text" id="ship-city" class="form-control" value="${addr.city || ''}" placeholder="E.g., Mumbai" required>
                </div>
                <div>
                    <label for="ship-state" class="form-label">State</label>
                    <input type="text" id="ship-state" class="form-control" value="${addr.state || ''}" placeholder="E.g., Maharashtra" required>
                </div>
            </div>
            <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                <div>
                    <label for="ship-pincode" class="form-label">Pin Code</label>
                    <input type="text" id="ship-pincode" class="form-control" value="${addr.pincode || ''}" placeholder="E.g., 400001" required>
                </div>
                <div>
                    <label for="ship-phone" class="form-label">Phone Number</label>
                    <input type="text" id="ship-phone" class="form-control" value="${addr.phone || ''}" placeholder="E.g., 9876543210" required>
                </div>
            </div>
            <h4 style="margin: 12px 0 0 0; font-size: 15px; color: var(--text-main); font-weight: 700; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">Tracking & Courier Details</h4>
            <div class="form-group" style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                <div>
                    <label for="ship-courier" class="form-label">Courier Partner</label>
                    <input type="text" id="ship-courier" class="form-control" value="${order.courierPartner || ''}" placeholder="E.g., Blue Dart, DHL">
                </div>
                <div>
                    <label for="ship-tracking" class="form-label">Tracking Number</label>
                    <input type="text" id="ship-tracking" class="form-control" value="${order.trackingNumber || ''}" placeholder="E.g., BD123456789">
                </div>
            </div>
            <div class="form-group">
                <label for="ship-est-delivery" class="form-label">Estimated Delivery Date</label>
                <input type="date" id="ship-est-delivery" class="form-control" value="${estDeliveryVal}" min="${order.orderDate ? order.orderDate.substring(0, 10) : ''}">
            </div>
        </form>
    `;

    showModal({
        title: `Edit Shipping & Tracking — Order #${order.orderId}`,
        contentHtml: formHtml,
        confirmText: 'Save Shipping Details',
        cancelText: 'Cancel',
        onConfirm: async (modalEl) => {
            const line1 = modalEl.querySelector('#ship-line1').value.trim();
            const city = modalEl.querySelector('#ship-city').value.trim();
            const state = modalEl.querySelector('#ship-state').value.trim();
            const pincode = modalEl.querySelector('#ship-pincode').value.trim();
            const phone = modalEl.querySelector('#ship-phone').value.trim();
            const courierPartner = modalEl.querySelector('#ship-courier').value.trim();
            const trackingNumber = modalEl.querySelector('#ship-tracking').value.trim();
            const estimatedDeliveryDate = modalEl.querySelector('#ship-est-delivery').value.trim();

            if (!line1 || !city || !state || !pincode || !phone) {
                showToast('All delivery address fields are required.', 'error');
                return false;
            }

            if (estimatedDeliveryDate && order.orderDate) {
                const orderDateStr = order.orderDate.substring(0, 10);
                if (estimatedDeliveryDate < orderDateStr) {
                    showToast('Estimated delivery date cannot be earlier than the order placement date.', 'error');
                    return false;
                }
            }

            try {
                showLoader();
                await api.put(`/api/admin/orders/${order.orderId}/shipping`, {
                    line1,
                    city,
                    state,
                    pincode,
                    phone,
                    courierPartner: courierPartner || null,
                    trackingNumber: trackingNumber || null,
                    estimatedDeliveryDate: estimatedDeliveryDate || null
                });
                showToast(`Shipping details updated for Order #${order.orderId}.`, 'success');
                loadAdminOrders();
                return true;
            } catch (err) {
                showToast(err.message || 'Failed to update shipping details.', 'error');
                return false;
            } finally {
                hideLoader();
            }
        }
    });
}

// Confirm or Reject COD payment status
function handleCodPayment(order, received) {
    const title = received ? 'Confirm COD Payment' : 'Reject COD Order';
    const msg = received 
        ? `Are you sure you want to confirm cash received for Order #${order.orderId}? This sets payment to SUCCESS and order status to DELIVERED.`
        : `Are you sure you want to reject Cash on Delivery payment for Order #${order.orderId}? This sets payment status to FAILED, cancels the order, and restores product stock.`;

    showConfirm(
        title,
        msg,
        async () => {
            try {
                showLoader();
                await api.put(`/api/admin/orders/${order.orderId}/cod-payment?received=${received}`);
                showToast(`COD payment status updated for Order #${order.orderId}.`, 'success');
                loadAdminOrders();
            } catch (err) {
                showToast(err.message || 'Failed to update COD payment status.', 'error');
            } finally {
                hideLoader();
            }
        }
    );
}
