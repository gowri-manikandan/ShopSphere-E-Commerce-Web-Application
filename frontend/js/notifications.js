import { api } from './api.js';
import { auth } from './auth.js';
import { showToast } from './ui.js';
import { subscribeWhenConnected } from './realtime.js';
import './navbar.js'; // renders navbar + footer + runs auth guard

// DOM Elements
const notifList = document.getElementById('notif-list');
const emptyState = document.getElementById('notif-empty');
const emptyDesc = document.getElementById('notif-empty-desc');
const paginationContainer = document.getElementById('notif-pagination');
const markAllReadBtn = document.getElementById('mark-all-read-btn');
const categoryNav = document.getElementById('notif-category-nav');

// State
let allNotifications = [];
let activeCategory = 'all';
let currentPage = 1;
const pageSize = 6;

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

// Categorize notification for tab filtering
function getNotificationCategory(n) {
    const type = (n.type || '').toUpperCase();
    const title = (n.title || '').toUpperCase();
    const msg = (n.message || '').toUpperCase();

    if (type.includes('OFFER') || type.includes('PROMO') || type.includes('COUPON') ||
        title.includes('OFFER') || title.includes('DISCOUNT') || title.includes('SALE') || title.includes('PROMO') || msg.includes('CODE:')) {
        return 'offers';
    }
    if (type.includes('ACCOUNT') || type.includes('SECURITY') || type.includes('PROFILE') || type.includes('PASSWORD') ||
        title.includes('ACCOUNT') || title.includes('PASSWORD') || title.includes('PROFILE') || title.includes('VERIF')) {
        return 'account';
    }
    if (type.includes('SYSTEM') || title.includes('SYSTEM') || title.includes('MAINTENANCE') || title.includes('UPDATE')) {
        return 'system';
    }
    if (type.includes('ORDER') || title.includes('ORDER #') || title.includes('ORDER ') ||
        title.includes('CONFIRMED') || title.includes('SHIPPED') || title.includes('PACKED') || title.includes('DELIVERED') || title.includes('CANCELLED')) {
        return 'orders';
    }
    return 'orders';
}

// Determine avatar icon and color styling
function getNotificationIconMeta(n) {
    const category = getNotificationCategory(n);
    const title = (n.title || '').toUpperCase();

    if (category === 'offers') {
        return {
            className: 'offers',
            iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" width="20" height="20">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>`
        };
    }

    if (category === 'account') {
        return {
            className: 'account',
            iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" width="20" height="20">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>`
        };
    }

    if (category === 'system') {
        return {
            className: 'system',
            iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" width="20" height="20">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>`
        };
    }

    // Orders classification
    if (title.includes('SHIPPED')) {
        return {
            className: 'shipped',
            iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" width="20" height="20">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.25V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V14.25m11.25-6.75h2.25M3 14.25h11.25" />
            </svg>`
        };
    }

    if (title.includes('PACKED')) {
        return {
            className: 'packed',
            iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" width="20" height="20">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>`
        };
    }

    if (title.includes('CANCELLED')) {
        return {
            className: 'cancelled',
            iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" width="20" height="20">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>`
        };
    }

    // Default confirmed / delivered
    return {
        className: 'confirmed',
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>`
    };
}

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    loadNotifications();
    subscribeLiveNotifications();
});

function initEvents() {
    // Category tabs filter
    if (categoryNav) {
        categoryNav.addEventListener('click', (e) => {
            const btn = e.target.closest('.notif-cat-btn');
            if (!btn) return;
            categoryNav.querySelectorAll('.notif-cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategory = btn.dataset.category || 'all';
            currentPage = 1;
            renderView();
        });
    }

    // Mark all as read button
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', handleMarkAllRead);
    }
}

async function loadNotifications() {
    if (!notifList) return;
    notifList.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted);">
        <p class="loader-text">Loading notifications…</p>
    </div>`;

    try {
        const items = await api.get('/api/notifications') || [];
        allNotifications = Array.isArray(items) ? items : [];
        updateBadges();
        renderView();
    } catch (err) {
        notifList.innerHTML = '';
        allNotifications = [];
        updateBadges();
        renderView();
        showToast(err.message || 'Failed to load notifications.', 'error');
    }
}

// Update sidebar badge counts
function updateBadges() {
    const counts = {
        all: allNotifications.length,
        orders: 0,
        offers: 0,
        account: 0,
        system: 0
    };

    allNotifications.forEach(n => {
        const cat = getNotificationCategory(n);
        if (counts[cat] !== undefined) {
            counts[cat]++;
        }
    });

    const setBadge = (id, count) => {
        const el = document.getElementById(id);
        if (el) el.textContent = count;
    };

    setBadge('badge-all', counts.all);
    setBadge('badge-orders', counts.orders);
    setBadge('badge-offers', counts.offers);
    setBadge('badge-account', counts.account);
    setBadge('badge-system', counts.system);
}

// Render the list of notifications + pagination
function renderView() {
    if (!notifList) return;

    const filtered = (activeCategory === 'all')
        ? allNotifications
        : allNotifications.filter(n => getNotificationCategory(n) === activeCategory);

    notifList.innerHTML = '';

    if (filtered.length === 0) {
        notifList.style.display = 'none';
        if (paginationContainer) paginationContainer.style.display = 'none';
        if (emptyState) {
            emptyState.style.display = 'block';
            if (emptyDesc) {
                if (activeCategory === 'orders') emptyDesc.textContent = 'No order status updates found.';
                else if (activeCategory === 'offers') emptyDesc.textContent = 'No promotional offers or discounts available right now.';
                else if (activeCategory === 'account') emptyDesc.textContent = 'No security or account alerts at this moment.';
                else if (activeCategory === 'system') emptyDesc.textContent = 'No system notifications.';
                else emptyDesc.textContent = "You're all caught up! Order updates, offers, and account alerts will appear here.";
            }
        }
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    notifList.style.display = 'flex';

    // Pagination calculations
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * pageSize;
    const pageItems = filtered.slice(startIndex, startIndex + pageSize);

    pageItems.forEach(n => {
        const card = createNotificationCard(n);
        notifList.appendChild(card);
    });

    renderPagination(totalPages);
}

// Create single notification card element
function createNotificationCard(n) {
    const card = document.createElement(n.link ? 'a' : 'div');
    card.className = 'notif-card';
    if (n.link) {
        card.href = n.link;
    }

    const { className, iconSvg } = getNotificationIconMeta(n);

    card.innerHTML = `
        <div class="notif-avatar ${className}">
            ${iconSvg}
        </div>
        <div class="notif-body">
            <h4 class="notif-title">${esc(n.title)}</h4>
            <p class="notif-desc">${esc(n.message)}</p>
        </div>
        <div class="notif-meta">
            <span class="notif-time">${timeAgo(n.createdAt)}</span>
            ${!n.read ? '<span class="notif-unread-dot" title="Unread"></span>' : ''}
        </div>
    `;

    card.addEventListener('click', () => {
        if (!n.read) {
            n.read = true;
            const dot = card.querySelector('.notif-unread-dot');
            if (dot) dot.remove();
        }
    });

    return card;
}

// Render dynamic pagination buttons
function renderPagination(totalPages) {
    if (!paginationContainer) return;

    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        paginationContainer.innerHTML = '';
        return;
    }

    paginationContainer.style.display = 'flex';
    let html = '';

    // Previous Button
    html += `<button type="button" class="notif-page-btn prev-btn" ${currentPage === 1 ? 'disabled' : ''} aria-label="Previous page">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="14" height="14">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
    </button>`;

    // Page Number Buttons
    for (let p = 1; p <= totalPages; p++) {
        html += `<button type="button" class="notif-page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }

    // Next Button
    html += `<button type="button" class="notif-page-btn next-btn" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Next page">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="14" height="14">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
    </button>`;

    paginationContainer.innerHTML = html;

    // Attach pagination listeners
    paginationContainer.querySelectorAll('.notif-page-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            if (target.classList.contains('prev-btn')) {
                if (currentPage > 1) {
                    currentPage--;
                    renderView();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            } else if (target.classList.contains('next-btn')) {
                if (currentPage < totalPages) {
                    currentPage++;
                    renderView();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            } else if (target.dataset.page) {
                currentPage = Number(target.dataset.page);
                renderView();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });
}

// Mark all as read
async function handleMarkAllRead() {
    try {
        await api.post('/api/notifications/read-all', {});
        allNotifications.forEach(n => { n.read = true; });
        renderView();
        if (window.updateNotifBadge) {
            window.updateNotifBadge(0);
        }
        showToast('All notifications marked as read', 'success');
    } catch (err) {
        showToast(err.message || 'Failed to mark notifications as read.', 'error');
    }
}

// Subscribe to live websocket notifications
function subscribeLiveNotifications() {
    const user = auth.getUser();
    if (!user || !user.id) return;

    subscribeWhenConnected(`/topic/notifications/${user.id}`, (newNotif) => {
        if (!newNotif) return;
        allNotifications.unshift(newNotif);
        updateBadges();
        renderView();
    });
}
