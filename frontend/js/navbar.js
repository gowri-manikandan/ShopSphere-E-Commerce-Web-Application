import { auth } from './auth.js';
import { api } from './api.js';

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
                <span>ShopSphere</span>
            </a>
            
            <button class="nav-toggle" aria-label="Toggle Navigation">
                <svg class="hamburger" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="24" height="24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
            </button>
            
            <div class="nav-menu">
                <ul class="nav-links">
                    <li><a href="index.html" class="nav-link ${path === 'index.html' ? 'active' : ''}">Catalog</a></li>
                    ${isLoggedIn ? `
                        <li><a href="profile.html" class="nav-link ${path === 'profile.html' ? 'active' : ''}">My Profile</a></li>
                        ${!isAdmin ? `<li><a href="orders.html" class="nav-link ${path === 'orders.html' ? 'active' : ''}">My Orders</a></li>` : ''}
                        ${isAdmin ? `<li><a href="admin.html" class="nav-link ${path === 'admin.html' ? 'active' : ''}">Admin Dashboard</a></li>` : ''}
                    ` : ''}
                </ul>
                
                <div class="nav-actions">
                    ${!isAdmin ? `
                    <a href="cart.html" class="cart-btn ${path === 'cart.html' ? 'active' : ''}">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="22" height="22">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                        </svg>
                        <span class="cart-badge">0</span>
                    </a>
                    ` : ''}
                    
                    ${isLoggedIn ? `
                        <div class="user-info">
                            <span class="user-greeting">Hi, ${user.name.split(' ')[0]}</span>
                            <button id="nav-logout-btn" class="btn btn-outline btn-sm">Logout</button>
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

    // Logout handling
    const logoutBtn = header.querySelector('#nav-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            auth.logout();
        });
    }

    // Load initial cart count
    refreshCartCount();
    
    // Render dynamic footer
    renderFooter();
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
            <div class="footer-grid">
                <div class="footer-brand">
                    <h4>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="22" height="22">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                        ShopSphere
                    </h4>
                    <p style="margin-top: 10px; max-width: 280px; color: #94a3b8; font-size: 13px;">Your modern, state-of-the-art e-commerce destination for premium gadgets, fashion, and books.</p>
                </div>
                <div class="footer-col">
                    <h5 style="color: #ffffff; font-size: 15px; margin-bottom: 12px;">Shop</h5>
                    <div class="footer-links">
                        <a href="index.html" class="footer-link">Catalog</a>
                        <a href="index.html" class="footer-link">Electronics</a>
                        <a href="index.html" class="footer-link">Fashion</a>
                    </div>
                </div>
                <div class="footer-col">
                    <h5 style="color: #ffffff; font-size: 15px; margin-bottom: 12px;">Support</h5>
                    <div class="footer-links">
                        <a href="#" class="footer-link">Help Center</a>
                        <a href="#" class="footer-link">Privacy Policy</a>
                        <a href="#" class="footer-link">Terms of Service</a>
                    </div>
                </div>
                <div class="footer-col">
                    <h5 style="color: #ffffff; font-size: 15px; margin-bottom: 12px;">Account</h5>
                    <div class="footer-links">
                        <a href="profile.html" class="footer-link">My Profile</a>
                        <a href="orders.html" class="footer-link">My Orders</a>
                        <a href="cart.html" class="footer-link">Shopping Cart</a>
                    </div>
                </div>
            </div>
            <div class="footer-bottom">
                &copy; 2026 ShopSphere. All rights reserved. Built with premium design standards.
            </div>
        </div>
    `;
}

// Auto render if container is present on load
document.addEventListener('DOMContentLoaded', renderNavbar);
