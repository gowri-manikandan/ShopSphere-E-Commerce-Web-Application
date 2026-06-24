import { API_BASE } from './config.js';

// Helper to check if current page is auth page
function isAuthPage() {
    const path = window.location.pathname;
    return path.includes('login.html') || path.includes('register.html');
}

// Redirect helper
function handleAuthFailure() {
    localStorage.removeItem('token');
    localStorage.removeItem('name');
    localStorage.removeItem('email');
    localStorage.removeItem('role');
    
    if (!isAuthPage()) {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    }
}

// Universal fetch wrapper
async function request(method, path, body = null, isPublic = false) {
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
        headers
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);

        // 401 = not authenticated / expired token -> clear session and redirect.
        // 403 (forbidden) is a legitimate authorization denial and must NOT log
        // the user out; let it fall through to normal error handling below.
        if (response.status === 401) {
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
