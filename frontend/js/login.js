// Login page logic — plain email + password (AJAX, no page reloads).
// Theme is imported first so the toggle is wired and the mode is applied early.
import { initThemeToggle } from './theme.js';
import './navbar.js';
import { auth } from './auth.js';
import { showToast } from './ui.js';

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const emailGroup = document.getElementById('email-group');
const passwordGroup = document.getElementById('password-group');
const submitBtn = document.getElementById('submit-btn');
const loginSpinner = document.getElementById('login-spinner');
const togglePasswordBtn = document.getElementById('toggle-password-btn');
const eyeOpenSvg = document.getElementById('eye-open-svg');
const eyeClosedSvg = document.getElementById('eye-closed-svg');

// Theme toggle in the card corner
initThemeToggle(document.getElementById('theme-toggle'));

// Prefill from a remembered session
const savedEmail = localStorage.getItem('remember_me_email');
if (savedEmail) {
    emailInput.value = savedEmail;
    document.getElementById('remember-me').checked = true;
}

function validateEmailFormat(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clearErrors() {
    emailGroup.classList.remove('has-error');
    passwordGroup.classList.remove('has-error');
    document.getElementById('email-error').textContent = 'Please enter a valid email address.';
    document.getElementById('password-error').textContent = 'Password is required.';
}

// Show/hide password
togglePasswordBtn.addEventListener('click', () => {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    eyeOpenSvg.style.display = showing ? 'block' : 'none';
    eyeClosedSvg.style.display = showing ? 'none' : 'block';
});

// Placeholders for features shipping in later slices
document.getElementById('forgot-password-link').addEventListener('click', (e) => {
    e.preventDefault();
    showToast('Password reset is coming soon.', 'info');
});
document.getElementById('google-btn').addEventListener('click', () => {
    showToast('Google sign-in is coming soon.', 'info');
});

function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.querySelector('.submit-btn-text').textContent = loading ? 'Signing In...' : 'Sign In';
    loginSpinner.style.display = loading ? 'inline-block' : 'none';
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    let valid = true;
    if (!email || !validateEmailFormat(email)) {
        emailGroup.classList.add('has-error');
        valid = false;
    }
    if (!password) {
        passwordGroup.classList.add('has-error');
        valid = false;
    }
    if (!valid) return;

    setLoading(true);
    try {
        const response = await auth.login(email, password);

        const rememberMe = document.getElementById('remember-me').checked;
        if (rememberMe) {
            localStorage.setItem('remember_me_email', email);
        } else {
            localStorage.removeItem('remember_me_email');
        }

        showToast(`Welcome back, ${response.name}!`, 'success');

        const redirectPath = new URLSearchParams(window.location.search).get('redirect');
        setTimeout(() => {
            window.location.href = redirectPath ? decodeURIComponent(redirectPath) : 'index.html';
        }, 800);
    } catch (err) {
        console.error(err);
        setLoading(false);

        // Surface server-side field errors inline (no reload)
        const fieldErrors = err.details && err.details.fieldErrors;
        if (fieldErrors) {
            if (fieldErrors.email) {
                document.getElementById('email-error').textContent = fieldErrors.email;
                emailGroup.classList.add('has-error');
            }
            if (fieldErrors.password) {
                document.getElementById('password-error').textContent = fieldErrors.password;
                passwordGroup.classList.add('has-error');
            }
        }

        const msg = (err.details && err.details.message) || err.message || '';
        if (msg.toLowerCase().includes('not verified')) {
            showToast('Your email is not verified yet. Please verify it from the registration page.', 'error');
        } else {
            showToast(msg || 'Login failed. Please check your credentials.', 'error');
        }
    }
});
