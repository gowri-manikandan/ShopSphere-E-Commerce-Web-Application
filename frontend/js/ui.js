// UI Helpers for ShopSphere

// ==========================================
// Toast Notifications
// ==========================================
export function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // SVG icons based on type
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>`;
    } else {
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>`;
    }

    toast.innerHTML = `
        <span class="toast-icon">${iconSvg}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close-btn">&times;</button>
    `;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    const dismissTimeout = setTimeout(() => {
        dismissToast(toast);
    }, 4000);

    // Close button click listener
    toast.querySelector('.toast-close-btn').addEventListener('click', () => {
        clearTimeout(dismissTimeout);
        dismissToast(toast);
    });
}

function dismissToast(toast) {
    toast.classList.add('toast-fade-out');
    toast.addEventListener('animationend', () => {
        toast.remove();
    });
}

// ==========================================
// Modal Helpers
// ==========================================
let activeModalElement = null;
let activeModalEscHandler = null;

export function showModal({ title, contentHtml, onConfirm = null, confirmText = 'Confirm', cancelText = 'Cancel', showActions = true, size = 'medium' }) {
    // Remove existing active modal if any
    closeModal();

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.id = 'global-modal';

    modalOverlay.innerHTML = `
        <div class="modal-card modal-${size}">
            <div class="modal-header">
                <h3 class="modal-title">${title}</h3>
                <button class="modal-close-btn" id="modal-close-x">&times;</button>
            </div>
            <div class="modal-body">${contentHtml}</div>
            ${showActions ? `
            <div class="modal-actions">
                <button class="btn btn-secondary modal-cancel-btn" id="modal-cancel-btn">${cancelText}</button>
                <button class="btn btn-primary modal-confirm-btn" id="modal-confirm-btn">${confirmText}</button>
            </div>
            ` : ''}
        </div>
    `;

    document.body.appendChild(modalOverlay);
    activeModalElement = modalOverlay;

    // Body lock scroll
    document.body.classList.add('modal-open');

    // Fade-in effect trigger
    setTimeout(() => {
        modalOverlay.classList.add('modal-active');
    }, 10);

    // Event listeners
    const closeBtn = modalOverlay.querySelector('#modal-close-x');
    const cancelBtn = modalOverlay.querySelector('#modal-cancel-btn');
    const confirmBtn = modalOverlay.querySelector('#modal-confirm-btn');

    const handleClose = () => closeModal();

    closeBtn.addEventListener('click', handleClose);
    if (cancelBtn) cancelBtn.addEventListener('click', handleClose);

    if (confirmBtn && onConfirm) {
        confirmBtn.addEventListener('click', async () => {
            const success = await onConfirm(modalOverlay);
            if (success !== false) {
                closeModal();
            }
        });
    }

    // Close on overlay backdrop click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    // Close on Escape Key
    activeModalEscHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    document.addEventListener('keydown', activeModalEscHandler);
    
    return modalOverlay;
}

export function closeModal() {
    if (!activeModalElement) return;

    const modal = activeModalElement;
    activeModalElement = null;

    if (activeModalEscHandler) {
        document.removeEventListener('keydown', activeModalEscHandler);
        activeModalEscHandler = null;
    }

    modal.classList.remove('modal-active');
    document.body.classList.remove('modal-open');
    
    modal.addEventListener('transitionend', () => {
        modal.remove();
    });
}

// ==========================================
// Custom Confirm Dialog
// ==========================================
export function showConfirm(title, message, onConfirm) {
    showModal({
        title,
        contentHtml: `<p>${message}</p>`,
        confirmText: 'Yes, Proceed',
        cancelText: 'Cancel',
        onConfirm: onConfirm,
        size: 'small'
    });
}

// ==========================================
// Fullscreen Loading Spinner
// ==========================================
export function showLoader() {
    let loader = document.getElementById('global-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.className = 'loader-overlay';
        loader.innerHTML = `
            <div class="spinner-container">
                <div class="premium-spinner"></div>
                <p class="loader-text">Loading ShopSphere...</p>
            </div>
        `;
        document.body.appendChild(loader);
    }
}

export function hideLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.remove();
    }
}

// ==========================================
// Skeletons
// ==========================================
export function getProductSkeleton(count = 4) {
    let skeletons = '';
    for (let i = 0; i < count; i++) {
        skeletons += `
            <div class="skeleton-card">
                <div class="skeleton skeleton-image"></div>
                <div class="skeleton-details">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-subtitle"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton-price-btn">
                        <div class="skeleton skeleton-price"></div>
                        <div class="skeleton skeleton-btn"></div>
                    </div>
                </div>
            </div>
        `;
    }
    return skeletons;
}
