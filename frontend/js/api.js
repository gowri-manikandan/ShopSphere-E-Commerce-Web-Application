import { API_BASE } from './config.js';

// Helper to check if current page is auth page
function isAuthPage() {
    const path = window.location.pathname;
    return path.includes('login.html') || path.includes('register.html');
}

// Redirect helper
function handleAuthFailure() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('name');
    localStorage.removeItem('email');
    localStorage.removeItem('role');

    if (!isAuthPage()) {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    }
}

// Single-flight refresh: concurrent 401s share one refresh call.
let refreshPromise = null;

async function tryRefresh() {
    // The refresh token lives in an httpOnly cookie (§7) — not readable here. If there's no
    // access token then there's no session to refresh, so skip the call.
    if (!localStorage.getItem('token')) return false;

    if (!refreshPromise) {
        refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include' // browser attaches the refresh-token cookie
        })
        .then(async (res) => {
            if (!res.ok) return false;
            const data = await res.json();
            if (data && data.token) {
                localStorage.setItem('token', data.token);
                if (data.name) localStorage.setItem('name', data.name);
                if (data.email) localStorage.setItem('email', data.email);
                if (data.role) localStorage.setItem('role', data.role);
                return true;
            }
            return false;
        })
        .catch(() => false)
        .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
}

// Universal fetch wrapper
async function request(method, path, body = null, isPublic = false, _retry = false) {
    const url = `${API_BASE}${path}`;
    const headers = {
        'Content-Type': 'application/json'
    };

    const token = localStorage.getItem('token');
    if (token && !isPublic) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers,
        credentials: 'include' // carry the httpOnly refresh-token cookie on /api/auth/* calls (§7)
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);

        // 401 on an AUTHENTICATED request = expired/invalid access token: try a one-time
        // silent refresh, retry once, and if that fails clear the session + redirect.
        // Public requests (login, register, OTP) are NOT sessions — a 401 there is a real
        // response (e.g. bad credentials), so fall through to normal error parsing below so
        // the backend message survives. 403 is a legit authz denial and must NOT log out.
        if (response.status === 401 && !isPublic) {
            if (!_retry) {
                const refreshed = await tryRefresh();
                if (refreshed) {
                    return request(method, path, body, isPublic, true);
                }
            }
            handleAuthFailure();
            const err = new Error("Your session has expired. Please log in again.");
            err.status = 401;
            throw err;
        }

        // Handle delete endpoints or empty content responses
        if (response.status === 204) {
            return null;
        }

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            const errorObj = new Error(data?.message || 'Something went wrong.');
            errorObj.status = response.status;
            errorObj.details = data; // stores {timestamp, status, error, message, path, fieldErrors}
            throw errorObj;
        }

        return data;
    } catch (err) {
        // If it was already thrown with details, rethrow
        if (err.status) throw err;
        
        // Otherwise, throw general network/parsing error
        const networkError = new Error('Network error or connection failed. Please make sure the backend is running.');
        networkError.status = 500;
        throw networkError;
    }
}

export const api = {
    get: (path, isPublic = false) => request('GET', path, null, isPublic),
    post: (path, body, isPublic = false) => request('POST', path, body, isPublic),
    put: (path, body, isPublic = false) => request('PUT', path, body, isPublic),
    delete: (path, isPublic = false) => request('DELETE', path, null, isPublic)
};
