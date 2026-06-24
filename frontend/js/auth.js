import { api } from './api.js';

export const auth = {
    async login(email, password) {
        const response = await api.post('/api/auth/login', { email, password }, true);
        if (response && response.token) {
            localStorage.setItem('token', response.token);
            localStorage.setItem('name', response.name);
            localStorage.setItem('email', response.email);
            localStorage.setItem('role', response.role);
        }
        return response;
    },

    async register(name, email, password) {
        const response = await api.post('/api/auth/register', { name, email, password }, true);
        if (response && response.token) {
            localStorage.setItem('token', response.token);
            localStorage.setItem('name', response.name);
            localStorage.setItem('email', response.email);
            localStorage.setItem('role', response.role);
        }
        return response;
    },

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('name');
        localStorage.removeItem('email');
        localStorage.removeItem('role');
        window.location.href = 'index.html';
    },

    getUser() {
        const token = localStorage.getItem('token');
        if (!token) return null;
        return {
            name: localStorage.getItem('name'),
            email: localStorage.getItem('email'),
            role: localStorage.getItem('role')
        };
    },

    isAuthenticated() {
        return !!localStorage.getItem('token');
    },

    isAdmin() {
        const user = this.getUser();
        return user && user.role === 'ADMIN';
    },

    guardRoute() {
        const path = window.location.pathname.split('/').pop() || 'index.html';
        const user = this.getUser();

        const protectedPages = ['cart.html', 'checkout.html', 'orders.html', 'admin.html'];
        const adminPages = ['admin.html'];

        if (protectedPages.includes(path) && !user) {
            window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
            return false;
        }

        if (adminPages.includes(path) && (!user || user.role !== 'ADMIN')) {
            window.location.href = 'index.html';
            return false;
        }

        // If logged in and trying to access login/register, redirect to index
        if ((path === 'login.html' || path === 'register.html') && user) {
            window.location.href = 'index.html';
            return false;
        }

        return true;
    }
};

// Auto-run route guards when script is imported
auth.guardRoute();
