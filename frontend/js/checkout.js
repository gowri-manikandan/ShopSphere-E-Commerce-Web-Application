import { api } from './api.js';
import { showToast, showModal, showConfirm, showLoader, hideLoader } from './ui.js';
import { refreshCartCount } from './navbar.js';

// Page states
let selectedAddressId = null;
let selectedPaymentMethod = 'CARD';
let cartItemsCount = 0;

// DOM References
const addressGrid = document.getElementById('address-grid');
const addAddressBtn = document.getElementById('add-address-btn');
const checkoutItemsPreview = document.getElementById('checkout-items-preview');
const checkoutItemsCount = document.getElementById('checkout-items-count');
const checkoutSubtotalVal = document.getElementById('checkout-subtotal-val');
const checkoutGrandTotalVal = document.getElementById('checkout-grand-total-val');
const placeOrderBtn = document.getElementById('place-order-btn');
const paymentOptions = document.querySelectorAll('.payment-option');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadCheckoutSummary();
    loadAddresses();
    setupPaymentHandlers();
    
    // Add Address Modal Trigger
    addAddressBtn.addEventListener('click', openAddAddressModal);

    // Place Order Action
    placeOrderBtn.addEventListener('click', handlePlaceOrder);
});

// Load summary items
async function loadCheckoutSummary() {
    try {
        showLoader();
        const cartData = await api.get('/api/cart');
        
        if (!cartData || !cartData.items || cartData.items.length === 0) {
            showToast('Your shopping cart is empty.', 'info');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
            return;
        }

        cartItemsCount = cartData.totalItems;

        // Preview sidebar listing
        checkoutItemsPreview.innerHTML = '';
        cartData.items.forEach(item => {
            const previewRow = document.createElement('div');
            previewRow.className = 'order-item-row-simple';
            
            const fallbackImage = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%23cbd5e1" width="100%" height="100%"><rect width="100%" height="100%" fill="%23f1f5f9"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" /></svg>`;
            const imgUrl = item.imageUrl || fallbackImage;

            previewRow.innerHTML = `
                <img src="${imgUrl}" class="order-item-img-simple" alt="${item.productName}" onerror="this.src='${fallbackImage}'">
                <div class="order-item-info-simple">
                    <span class="order-item-name-simple" style="display:block;">${item.productName}</span>
                    <span class="order-item-meta-simple">Qty: ${item.quantity} × ₹${item.price.toFixed(2)}</span>
                </div>
                <div class="order-item-subtotal-simple">₹${item.subtotal.toFixed(2)}</div>
            `;
            checkoutItemsPreview.appendChild(previewRow);
        });

        // Update totals
        checkoutItemsCount.textContent = `Subtotal (${cartData.totalItems} ${cartData.totalItems === 1 ? 'item' : 'items'})`;
        checkoutSubtotalVal.textContent = `₹${cartData.grandTotal.toFixed(2)}`;
        checkoutGrandTotalVal.textContent = `₹${cartData.grandTotal.toFixed(2)}`;

    } catch (err) {
        showToast(err.message || 'Failed to load order summary.', 'error');
    } finally {
        hideLoader();
    }
}

// Load customer addresses
async function loadAddresses() {
    try {
        const addresses = await api.get('/api/addresses');
        addressGrid.innerHTML = '';

        if (!addresses || addresses.length === 0) {
            addressGrid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 20px; text-align: center; border: 1.5px dashed var(--border-color); border-radius: var(--radius-md); color: var(--text-muted);">
                    <p style="font-weight: 500;">No shipping addresses saved yet.</p>
                    <p style="font-size: 13px;">Please add a shipping address to place your order.</p>
                </div>
            `;
            selectedAddressId = null;
            return;
        }

        addresses.forEach((addr, idx) => {
            const card = document.createElement('div');
            card.className = `address-card ${idx === 0 ? 'selected' : ''}`;
            card.setAttribute('data-addr-id', addr.id);
            
            if (idx === 0) {
                selectedAddressId = addr.id;
            }

            card.innerHTML = `
                <p style="font-weight: 700; font-size: 15px; margin-bottom: 6px; color: var(--text-main);">Address #${idx + 1}</p>
                <p style="font-size: 14px; color: var(--text-muted); line-height: 1.4; margin-bottom: 4px;">${addr.line1}</p>
                <p style="font-size: 14px; color: var(--text-muted); line-height: 1.4;">${addr.city}${addr.state ? ', ' + addr.state : ''} - ${addr.pincode}</p>
                <p style="font-size: 13px; color: var(--text-main); font-weight: 600; margin-top: 8px;">Phone: ${addr.phone || 'N/A'}</p>
                <button class="address-card-delete" aria-label="Delete Address" data-addr-id="${addr.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                </button>
            `;

            // Address selection listener
            card.addEventListener('click', (e) => {
                // Ignore if clicking delete button
                if (e.target.closest('.address-card-delete')) return;
                
                addressGrid.querySelectorAll('.address-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedAddressId = addr.id;
            });

            // Address deletion listener
            card.querySelector('.address-card-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirm(
                    'Delete Shipping Address',
                    'Are you sure you want to delete this shipping address?',
                    async () => {
                        try {
                            showLoader();
                            await api.delete(`/api/addresses/${addr.id}`);
                            showToast('Address deleted successfully.', 'success');
                            await loadAddresses();
                        } catch (err) {
                            showToast(err.message || 'Failed to delete address.', 'error');
                        } finally {
                            hideLoader();
                        }
                    }
                );
            });

            addressGrid.appendChild(card);
        });
    } catch (err) {
        showToast(err.message || 'Failed to load shipping addresses.', 'error');
    }
}

// Payment Choice changes
function setupPaymentHandlers() {
    paymentOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            paymentOptions.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            
            const radio = opt.querySelector('input[type="radio"]');
            radio.checked = true;
            selectedPaymentMethod = radio.value;
        });
    });
}

// Add Address overlay logic
function openAddAddressModal() {
    const formHtml = `
        <form id="address-modal-form" class="address-form-modal">
            <div class="form-group">
                <label for="modal-line1" class="form-label">Address Line 1</label>
                <input type="text" id="modal-line1" class="form-control" placeholder="12 MG Road, Appt 4B" required>
            </div>
            <div class="form-group">
                <label for="modal-city" class="form-label">City</label>
                <input type="text" id="modal-city" class="form-control" placeholder="Chennai" required>
            </div>
            <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                    <label for="modal-state" class="form-label">State</label>
                    <input type="text" id="modal-state" class="form-control" placeholder="Tamil Nadu" required>
                </div>
                <div>
                    <label for="modal-pincode" class="form-label">Pin Code</label>
                    <input type="text" id="modal-pincode" class="form-control" placeholder="600001" required>
                </div>
            </div>
            <div class="form-group">
                <label for="modal-phone" class="form-label">Phone Number</label>
                <input type="text" id="modal-phone" class="form-control" placeholder="9876543210" required>
            </div>
        </form>
    `;

    showModal({
        title: 'Add Shipping Address',
        contentHtml: formHtml,
        confirmText: 'Save Address',
        cancelText: 'Cancel',
        onConfirm: async (modalEl) => {
            const line1 = modalEl.querySelector('#modal-line1').value.trim();
            const city = modalEl.querySelector('#modal-city').value.trim();
            const state = modalEl.querySelector('#modal-state').value.trim();
            const pincode = modalEl.querySelector('#modal-pincode').value.trim();
            const phone = modalEl.querySelector('#modal-phone').value.trim();

            if (!line1 || !city || !state || !pincode || !phone) {
                showToast('All shipping address fields are required.', 'error');
                return false; // keeps modal open
            }

            try {
                showLoader();
                await api.post('/api/addresses', { line1, city, state, pincode, phone });
                showToast('New shipping address saved.', 'success');
                await loadAddresses();
                return true; // closes modal
            } catch (err) {
                showToast(err.message || 'Failed to save address.', 'error');
                return false; // keeps modal open
            } finally {
                hideLoader();
            }
        }
    });
}

// Checkout placement trigger
async function handlePlaceOrder() {
    if (!selectedAddressId) {
        showToast('Please select or add a shipping address first.', 'error');
        return;
    }

    try {
        placeOrderBtn.disabled = true;
        showLoader();
        
        const orderResult = await api.post('/api/orders/checkout', {
            addressId: selectedAddressId,
            paymentMethod: selectedPaymentMethod
        });

        // Cart was cleared server-side on checkout; sync the navbar badge.
        await refreshCartCount();

        // Show Success confirmation Modal
        const successHtml = `
            <div class="success-modal-content">
                <div class="success-icon-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="64" height="64" style="margin:0 auto;">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h3 class="success-title">Order Placed Successfully!</h3>
                <p class="success-text">Thank you for your order. We have received your payment details.</p>
                
                <div class="order-receipt">
                    <div class="receipt-row">
                        <span style="font-weight:600; color:var(--text-muted);">Order ID</span>
                        <span style="font-family:monospace; font-weight:700;">#${orderResult.orderId}</span>
                    </div>
                    <div class="receipt-row">
                        <span style="font-weight:600; color:var(--text-muted);">Total Amount</span>
                        <span style="font-weight:700;">₹${orderResult.totalAmount.toFixed(2)}</span>
                    </div>
                    <div class="receipt-row">
                        <span style="font-weight:600; color:var(--text-muted);">Payment Method</span>
                        <span style="font-weight:700;">${orderResult.paymentMethod}</span>
                    </div>
                    <div class="receipt-row">
                        <span style="font-weight:600; color:var(--text-muted);">Transaction Ref</span>
                        <span style="font-family:monospace; font-size:12px;">${orderResult.transactionRef || 'N/A'}</span>
                    </div>
                </div>
            </div>
        `;

        showModal({
            title: 'Order Status Confirmation',
            contentHtml: successHtml,
            confirmText: 'View Order History',
            showActions: true,
            cancelText: '',
            onConfirm: () => {
                window.location.href = 'orders.html';
                return true;
            },
            size: 'medium'
        });

        // Hide cancel button in success modal if it is rendered
        const cancelBtn = document.getElementById('modal-cancel-btn');
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }

    } catch (err) {
        showToast(err.message || 'Checkout transaction failed. Please retry.', 'error');
        placeOrderBtn.disabled = false;
    } finally {
        hideLoader();
    }
}
