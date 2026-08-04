import { auth } from './auth.js';
import { api } from './api.js';
import { subscribeWhenConnected } from './realtime.js';
import { showToast } from './ui.js';

// Setup global hook for other scripts to refresh the cart badge count
window.updateCartBadge = function(count) {
    const badge = document.querySelector('.cart-badge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-flex';
        } else {
            badge.textContent = '0';
            badge.style.display = 'none';
        }
    }
};

// Function to fetch cart count and update badge
export async function refreshCartCount() {
    if (!auth.isAuthenticated() || auth.isAdmin()) {
        window.updateCartBadge(0);
        return;
    }
    try {
        const cartData = await api.get('/api/cart');
        const count = cartData?.totalItems || 0;
        window.updateCartBadge(count);
    } catch (err) {
        console.error("Failed to fetch cart count:", err);
    }
}

// Unread-notifications badge (mirrors the cart badge) (§16)
window.updateNotifBadge = function(count) {
    const badge = document.querySelector('.notif-badge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-flex';
        } else {
            badge.textContent = '0';
            badge.style.display = 'none';
        }
    }
};

export async function refreshUnreadCount() {
    if (!auth.isAuthenticated() || auth.isAdmin()) {
        window.updateNotifBadge(0);
        return;
    }
    try {
        const res = await api.get('/api/notifications/unread-count');
        window.updateNotifBadge(res?.count || 0);
    } catch (err) {
        /* non-fatal */
    }
}

// Live-increment the bell when a notification is pushed (only where STOMP libs are loaded).
async function subscribeToNotifications() {
    if (!auth.isAuthenticated() || auth.isAdmin()) return;
    const userId = await auth.getUserId();
    if (!userId) return;
    subscribeWhenConnected(`/topic/notifications/${userId}`, (msg) => {
        const badge = document.querySelector('.notif-badge');
        const current = badge ? (parseInt(badge.textContent, 10) || 0) : 0;
        window.updateNotifBadge(current + 1);
        try { showToast(msg.title || 'New notification', 'info'); } catch (e) { /* ignore */ }
    });
}

// Render dynamic navbar
export function renderNavbar() {
    const header = document.getElementById('navbar-container');
    if (!header) return;

    const user = auth.getUser();
    const isAdmin = auth.isAdmin();
    const isLoggedIn = auth.isAuthenticated();

    // Determine current active page
    const path = window.location.pathname.split('/').pop() || 'index.html';

    header.innerHTML = `
        <div class="nav-container">
            <a href="index.html" class="nav-logo">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="24" height="24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                <span>Sri Maruthi textiles</span>
            </a>
            
            <button class="nav-toggle" aria-label="Toggle Navigation">
                <svg class="hamburger" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="24" height="24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
            </button>
            
            <div class="nav-menu">
                <ul class="nav-links">
                    <li><a href="index.html" class="nav-link ${path === 'index.html' ? 'active' : ''}">Catalog</a></li>
                    ${isLoggedIn && !isAdmin ? `<li><a href="orders.html" class="nav-link ${path === 'orders.html' ? 'active' : ''}">My Orders</a></li>` : ''}
                    ${isLoggedIn && !isAdmin ? `<li><a href="wishlist.html" class="nav-link ${path === 'wishlist.html' ? 'active' : ''}">Wishlist</a></li>` : ''}
                    ${isAdmin ? `<li><a href="admin-dashboard.html" class="nav-link ${path === 'admin-dashboard.html' ? 'active' : ''}">Dashboard</a></li>` : ''}
                    ${isAdmin ? `<li><a href="admin.html" class="nav-link ${path === 'admin.html' ? 'active' : ''}">Manage</a></li>` : ''}
                </ul>

                <div class="nav-actions">
                    ${(isLoggedIn && !isAdmin) ? `
                    <a href="notifications.html" class="notif-btn ${path === 'notifications.html' ? 'active' : ''}" aria-label="Notifications">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="22" height="22">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                        </svg>
                        <span class="notif-badge">0</span>
                    </a>
                    ` : ''}

                    ${!isAdmin ? `
                    <a href="cart.html" class="cart-btn ${path === 'cart.html' ? 'active' : ''}" aria-label="Shopping cart">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="22" height="22">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                        </svg>
                        <span class="cart-badge">0</span>
                    </a>
                    ` : ''}

                    ${isLoggedIn ? `
                        <div class="profile-menu" id="profile-menu">
                            <button class="profile-trigger" id="profile-trigger" aria-haspopup="true" aria-expanded="false">
                                <span class="nav-avatar" id="nav-avatar">${avatarMarkup(user)}</span>
                                <span class="nav-username">${escapeHtml(user.name.split(' ')[0])}</span>
                                <svg class="profile-caret" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="14" height="14">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                            </button>
                            <div class="profile-dropdown" id="profile-dropdown" role="menu">
                                <a href="profile.html" class="dropdown-item" role="menuitem">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    My Profile
                                </a>
                                <button class="dropdown-item" id="nav-logout-btn" role="menuitem">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                                    </svg>
                                    Logout
                                </button>
                            </div>
                        </div>
                    ` : `
                        <a href="login.html" class="btn btn-outline btn-sm">Login</a>
                        <a href="register.html" class="btn btn-primary btn-sm">Register</a>
                    `}
                </div>
            </div>
        </div>
    `;

    // Interactive mobile collapse
    const toggle = header.querySelector('.nav-toggle');
    const menu = header.querySelector('.nav-menu');

    toggle.addEventListener('click', () => {
        menu.classList.toggle('nav-menu-open');
        toggle.classList.toggle('toggle-active');
    });

    // Profile dropdown toggle + outside-click close
    const profileMenu = header.querySelector('#profile-menu');
    if (profileMenu) {
        const trigger = profileMenu.querySelector('#profile-trigger');
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = profileMenu.classList.toggle('open');
            trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.addEventListener('click', (e) => {
            if (!profileMenu.contains(e.target)) {
                profileMenu.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Logout handling
    const logoutBtn = header.querySelector('#nav-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            auth.logout();
        });
    }

    // Load initial cart count + unread notifications + real profile photo
    refreshCartCount();
    refreshUnreadCount();
    subscribeToNotifications();
    refreshUserAvatar();

    // Render dynamic footer
    renderFooter();
}

// Build the avatar inner markup: cached profile photo if available, else the user's initial.
function avatarMarkup(user) {
    const initial = escapeHtml((user.name || 'U').trim().charAt(0).toUpperCase() || 'U');
    const url = localStorage.getItem('profileImageUrl');
    if (url) {
        return `<img src="${escapeHtml(url)}" alt="" class="nav-avatar-img"
                     onerror="this.remove()">`;
    }
    return initial;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Fetch the user's profile once to show their real photo + keep the name fresh.
async function refreshUserAvatar() {
    if (!auth.isAuthenticated()) return;
    try {
        const profile = await api.get('/api/users/profile');
        if (!profile) return;
        if (profile.name) localStorage.setItem('name', profile.name);
        const avatar = document.getElementById('nav-avatar');
        if (profile.profileImageUrl) {
            localStorage.setItem('profileImageUrl', profile.profileImageUrl);
            if (avatar) {
                avatar.innerHTML = `<img src="${escapeHtml(profile.profileImageUrl)}" alt="" class="nav-avatar-img" onerror="this.remove()">`;
            }
        } else {
            localStorage.removeItem('profileImageUrl');
        }
    } catch (err) {
        /* non-fatal: keep the initials avatar */
    }
}

// Render dynamic footer
export function renderFooter() {
    let footer = document.getElementById('footer-container');
    if (!footer) {
        footer = document.createElement('footer');
        footer.id = 'footer-container';
        document.body.appendChild(footer);
    }
    footer.innerHTML = `
        <div class="container">
            <div class="footer-top">
                <div class="footer-brand">
                    <h4>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="22" height="22">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                        Sri Maruthi textiles
                    </h4>
                    <p>Your modern, state-of-the-art e-commerce destination for premium gadgets, fashion, and books.</p>
                </div>
                <nav class="footer-support" aria-label="Support">
                    <a href="help-center.html" class="footer-link">Help Center</a>
                    <span class="footer-sep">·</span>
                    <a href="privacy-policy.html" class="footer-link">Privacy Policy</a>
                    <span class="footer-sep">·</span>
                    <a href="terms-of-service.html" class="footer-link">Terms of Service</a>
                </nav>
            </div>
            <div class="footer-bottom">
                &copy; 2026 Sri Maruthi textiles. All rights reserved. Built with premium design standards.
            </div>
        </div>
    `;
}

// Auto render if container is present on load
document.addEventListener('DOMContentLoaded', renderNavbar);
