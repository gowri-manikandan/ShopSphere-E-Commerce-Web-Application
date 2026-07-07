import { api } from './api.js';

export const auth = {
    _storeSession(response) {
        if (response && response.token) {
            localStorage.setItem('token', response.token);
            if (response.refreshToken) localStorage.setItem('refreshToken', response.refreshToken);
            localStorage.setItem('name', response.name);
            localStorage.setItem('email', response.email);
            localStorage.setItem('role', response.role);
        }
    },

    async login(email, password) {
        const response = await api.post('/api/auth/login', { email, password }, true);
        this._storeSession(response);
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

    async verify(email, otp) {
        const response = await api.post('/api/auth/verify', { email, otp }, true);
        this._storeSession(response);
        return response;
    },

    async resendOtp(email) {
        return await api.post(`/api/auth/resend-otp?email=${encodeURIComponent(email)}`, {}, true);
    },

    async sendOtp(email) {
        return await api.post('/api/auth/send-otp', { email }, true);
    },

    async verifyOtpForLogin(email, otp) {
        return await api.post('/api/auth/verify-otp', { email, otp }, true);
    },

    async logout() {
        // Best-effort server-side revocation of the refresh token.
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
            try { await api.post('/api/auth/logout', { refreshToken }, true); } catch (e) { /* ignore */ }
        }
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
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
