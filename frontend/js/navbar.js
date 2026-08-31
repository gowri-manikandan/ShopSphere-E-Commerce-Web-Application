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
        <!-- Top Announcement Utility Bar -->
        <div class="top-announcement-bar">
            <div class="container announcement-inner">
                <div class="announcement-left">
                    <span class="ann-emoji">🚚</span>
                    <span>Free Shipping on orders above ₹900</span>
                </div>
                <div class="announcement-center">
                    <span>✨ Quality You Trust, Style You Love</span>
                </div>
                <div class="announcement-right">
                    <span class="announcement-item"><span class="ann-emoji">🎧</span> Customer Support</span>
                    <span class="announcement-item phone-item"><span class="ann-emoji">📞</span> +91 98765 43210</span>
                </div>
            </div>
        </div>

        <!-- Main Navigation Bar -->
        <nav class="navbar-main">
            <div class="container nav-inner">
                <!-- Brand Logo & Name -->
                <a href="index.html" class="nav-brand">
                    <div class="brand-logo-badge">
                        <img src="images/logo.png" alt="Sri Maruthi textiles" class="brand-logo-img">
                    </div>
                    <div class="brand-text-group">
                        <span class="brand-title">Sri Maruthi textiles</span>
                        <span class="brand-subtitle">Premium Quality. Pure Comfort.</span>
                    </div>
                </a>

                <!-- Centered Search Bar -->
                <div class="nav-search-wrap">
                    <div class="nav-search-box">
                        <svg class="nav-search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="18" height="18">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                        </svg>
                        <input type="text" id="search-input" class="nav-search-input" placeholder="Search for products, brands or models..." autocomplete="off">
                        <button type="button" class="nav-search-btn" id="nav-search-btn" aria-label="Search">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="15" height="15">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Navigation Links & User Actions -->
                <div class="nav-right-wrap">
                    <ul class="nav-links">
                        <li><a href="index.html" class="nav-link ${path === 'index.html' ? 'active' : ''}">Catalog</a></li>
                        ${isLoggedIn && !isAdmin ? `<li><a href="orders.html" class="nav-link ${path === 'orders.html' ? 'active' : ''}">My Orders</a></li>` : ''}
                        ${isLoggedIn && !isAdmin ? `<li><a href="wishlist.html" class="nav-link ${path === 'wishlist.html' ? 'active' : ''}">Wishlist</a></li>` : ''}
                        ${isAdmin ? `<li><a href="admin-dashboard.html" class="nav-link ${path === 'admin-dashboard.html' ? 'active' : ''}">Dashboard</a></li>` : ''}
                        ${isAdmin ? `<li><a href="admin.html" class="nav-link ${path === 'admin.html' ? 'active' : ''}">Manage</a></li>` : ''}
                    </ul>

                    <div class="nav-actions-group">
                        ${!isAdmin ? `
                        <a href="cart.html" class="nav-icon-btn cart-btn ${path === 'cart.html' ? 'active' : ''}" aria-label="Shopping cart">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                            </svg>
                            <span class="cart-badge">0</span>
                        </a>
                        ` : ''}

                        ${(isLoggedIn && !isAdmin) ? `
                        <a href="notifications.html" class="nav-icon-btn notif-btn ${path === 'notifications.html' ? 'active' : ''}" aria-label="Notifications">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                            </svg>
                            <span class="notif-badge">0</span>
                        </a>
                        ` : ''}

                        ${isLoggedIn ? `
                            <div class="profile-menu" id="profile-menu">
                                <button class="profile-pill-trigger" id="profile-trigger" aria-haspopup="true" aria-expanded="false">
                                    <span class="profile-avatar-circle" id="nav-avatar">${avatarMarkup(user)}</span>
                                    <span class="profile-username-text">${escapeHtml(user.name.split(' ')[0])}</span>
                                    <svg class="profile-caret" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="12" height="12">
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
                            <a href="login.html" class="btn btn-outline-nav btn-sm">Login</a>
                            <a href="register.html" class="btn btn-primary btn-sm">Register</a>
                        `}
                    </div>

                    <!-- Mobile Menu Toggle Button -->
                    <button class="nav-toggle" aria-label="Toggle Navigation">
                        <svg class="hamburger" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="24" height="24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </button>
                </div>
            </div>
        </nav>
    `;

    // Interactive mobile collapse
    const toggle = header.querySelector('.nav-toggle');
    const menuWrap = header.querySelector('.nav-right-wrap');

    if (toggle && menuWrap) {
        toggle.addEventListener('click', () => {
            menuWrap.classList.toggle('nav-menu-open');
            toggle.classList.toggle('toggle-active');
        });
    }

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

    // Search button handling across pages
    const navSearchBtn = header.querySelector('#nav-search-btn');
    const navSearchInput = header.querySelector('#search-input');
    if (navSearchBtn && navSearchInput) {
        const triggerSearch = () => {
            const query = navSearchInput.value.trim();
            if (path !== 'index.html') {
                window.location.href = `index.html?search=${encodeURIComponent(query)}`;
            }
        };
        navSearchBtn.addEventListener('click', triggerSearch);
        navSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && path !== 'index.html') {
                triggerSearch();
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
        return `<img src="${escapeHtml(url)}" alt="" class="nav-avatar-img" onerror="this.remove()">`;
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

// Render dynamic footer exactly matching the screenshot design
export function renderFooter() {
    let footer = document.getElementById('footer-container');
    if (!footer) {
        footer = document.createElement('footer');
        footer.id = 'footer-container';
        document.body.appendChild(footer);
    }
    footer.className = 'site-footer-wrapper';
    footer.innerHTML = `
        <div class="container footer-content-wrap">
            <div class="footer-grid">
                <!-- Column 1: Brand & Socials -->
                <div class="footer-col footer-brand-col">
                    <div class="footer-brand-header">
                        <div class="brand-logo-badge small">
                            <img src="images/logo.png" alt="Sri Maruthi textiles" class="brand-logo-img">
                        </div>
                        <span class="footer-brand-title">Sri Maruthi textiles</span>
                    </div>
                    <p class="footer-brand-tagline">Premium Quality. Pure Comfort.</p>
                    <div class="footer-social-links">
                        <a href="javascript:void(0)" class="social-icon-btn" aria-label="Facebook">
                            <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        </a>
                        <a href="javascript:void(0)" class="social-icon-btn" aria-label="Instagram">
                            <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                        </a>
                        <a href="javascript:void(0)" class="social-icon-btn" aria-label="WhatsApp">
                            <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm5.73 14.04c-.24.67-1.39 1.28-1.92 1.36-.51.08-1.16.11-3.37-.8-2.61-1.07-4.28-3.72-4.41-3.89-.13-.17-1.06-1.41-1.06-2.69s.67-1.91.91-2.17c.24-.26.52-.33.7-.33.17 0 .35 0 .5.01.16.01.38-.06.59.45.22.53.75 1.83.82 1.96.07.13.11.29.02.47-.09.18-.13.29-.26.44-.13.15-.28.34-.4.45-.13.13-.27.27-.12.53.15.26.68 1.12 1.46 1.81 1 .89 1.85 1.17 2.11 1.3.26.13.42.11.57-.07.16-.18.67-.78.85-1.05.18-.27.35-.22.59-.13.24.09 1.54.73 1.8 1.01.26.28.26.42.26.64.01.21-.23.88-.47 1.55z"/></svg>
                        </a>
                    </div>
                </div>

                <!-- Column 2: Shop -->
                <div class="footer-col">
                    <h5 class="footer-col-title">Shop</h5>
                    <ul class="footer-links-list">
                        <li><a href="index.html">All Products</a></li>
                        <li><a href="index.html">New Arrivals</a></li>
                        <li><a href="index.html">Best Sellers</a></li>
                    </ul>
                </div>

                <!-- Column 3: Company -->
                <div class="footer-col">
                    <h5 class="footer-col-title">Company</h5>
                    <ul class="footer-links-list">
                        <li><a href="help-center.html">About Us</a></li>
                        <li><a href="privacy-policy.html">Privacy Policy</a></li>
                        <li><a href="terms-of-service.html">Terms & Conditions</a></li>
                    </ul>
                </div>

                <!-- Column 4: Help -->
                <div class="footer-col">
                    <h5 class="footer-col-title">Help</h5>
                    <ul class="footer-links-list">
                        <li><a href="help-center.html">FAQs</a></li>
                        <li><a href="help-center.html">Shipping Policy</a></li>
                        <li><a href="help-center.html">Return Policy</a></li>
                    </ul>
                </div>

                <!-- Column 5: Newsletter -->
                <div class="footer-col footer-newsletter-col">
                    <h5 class="footer-col-title">Newsletter</h5>
                    <p class="newsletter-sub">Subscribe to get updates on new arrivals and offers.</p>
                    <form class="newsletter-form" id="newsletter-form">
                        <input type="email" placeholder="Enter your email" class="newsletter-input" required>
                        <button type="submit" class="btn-newsletter-submit">Subscribe</button>
                    </form>
                </div>
            </div>

            <!-- Footer Bottom Bar -->
            <div class="footer-bottom-bar">
                <div class="footer-copy">
                    &copy; 2025 Sri Maruthi Textiles. All rights reserved.
                </div>
                <div class="footer-payment-badges">
                    <span class="payment-badge-pill visa-badge">VISA</span>
                    <span class="payment-badge-pill mc-badge">
                        <span class="mc-dot red"></span>
                        <span class="mc-dot yellow"></span>
                    </span>
                    <span class="payment-badge-pill upi-badge">UPI</span>
                    <span class="payment-badge-pill paytm-badge">Paytm</span>
                </div>
            </div>
        </div>

        <!-- Scroll to Top Floating Button -->
        <button type="button" class="scroll-to-top-btn" id="scroll-to-top-btn" aria-label="Scroll to top">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="18" height="18">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
        </button>
    `;

    // Newsletter submit listener
    const newsForm = footer.querySelector('#newsletter-form');
    if (newsForm) {
        newsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const inp = newsForm.querySelector('.newsletter-input');
            if (inp && inp.value) {
                showToast('Thank you for subscribing to our newsletter!', 'success');
                inp.value = '';
            }
        });
    }

    // Setup scroll to top
    const scrollBtn = footer.querySelector('#scroll-to-top-btn');
    if (scrollBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollBtn.classList.add('visible');
            } else {
                scrollBtn.classList.remove('visible');
            }
        });
        scrollBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}

// Auto render if container is present on load
document.addEventListener('DOMContentLoaded', renderNavbar);
