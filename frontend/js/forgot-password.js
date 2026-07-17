// Forgot-password flow: email -> OTP -> new password (AJAX, no page reloads).
import { initThemeToggle } from './theme.js';
import './navbar.js';
import { auth } from './auth.js';
import { showToast } from './ui.js';

initThemeToggle(document.getElementById('theme-toggle'));

// Sections
const emailSection = document.getElementById('email-section');
const otpSection = document.getElementById('otp-section');
const resetSection = document.getElementById('reset-section');

// Step 1
const emailForm = document.getElementById('email-form');
const emailInput = document.getElementById('email-input');
const emailGroup = document.getElementById('email-group');
const sendBtn = document.getElementById('send-btn');
const sendSpinner = document.getElementById('send-spinner');

// Step 2
const otpForm = document.getElementById('otp-form');
const otpBoxes = [1, 2, 3, 4, 5, 6].map(i => document.getElementById('otp-' + i));
const countdownTimer = document.getElementById('countdown-timer');
const resendBtn = document.getElementById('resend-otp-btn');

// Step 3
const resetForm = document.getElementById('reset-form');
const passwordInput = document.getElementById('password-input');
const confirmInput = document.getElementById('confirm-input');
const passwordGroup = document.getElementById('password-group');
const matchHint = document.getElementById('match-hint');
const resetBtn = document.getElementById('reset-btn');
const resetSpinner = document.getElementById('reset-spinner');

let resetEmail = '';
let resetOtp = '';
let countdownInterval = null;

function validateEmailFormat(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showSection(hideEl, showEl, focusEl) {
    hideEl.style.opacity = '0';
    hideEl.style.transform = 'translateY(-10px)';
    setTimeout(() => {
        hideEl.style.display = 'none';
        showEl.style.display = 'block';
        setTimeout(() => {
            showEl.style.opacity = '1';
            showEl.style.transform = 'translateY(0)';
            if (focusEl) focusEl.focus();
        }, 30);
    }, 350);
}

// ---------- Step 1: request reset code ----------
emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    emailGroup.classList.remove('has-error');
    const email = emailInput.value.trim();
    if (!email || !validateEmailFormat(email)) {
        emailGroup.classList.add('has-error');
        return;
    }

    sendBtn.disabled = true;
    sendBtn.querySelector('.send-btn-text').textContent = 'Sending...';
    sendSpinner.style.display = 'inline-block';
    try {
        await auth.requestPasswordReset(email);
        resetEmail = email;
        document.getElementById('otp-email-display').textContent = email;
        // Backend is non-enumerating: this generic success shows regardless of existence.
        showToast('If an account exists for that email, a reset code has been sent.', 'success');
        showSection(emailSection, otpSection, otpBoxes[0]);
        startTimer();
    } catch (err) {
        showToast((err.details && err.details.message) || err.message || 'Could not send reset code.', 'error');
    } finally {
        sendBtn.disabled = false;
        sendBtn.querySelector('.send-btn-text').textContent = 'Send Reset Code';
        sendSpinner.style.display = 'none';
    }
});

// ---------- Countdown + resend ----------
function startTimer() {
    clearInterval(countdownInterval);
    let seconds = 60;
    resendBtn.style.display = 'none';
    countdownTimer.style.display = 'inline';
    countdownTimer.textContent = `Resend code in ${seconds}s`;
    countdownInterval = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
            clearInterval(countdownInterval);
            countdownTimer.style.display = 'none';
            resendBtn.style.display = 'inline';
        } else {
            countdownTimer.textContent = `Resend code in ${seconds}s`;
        }
    }, 1000);
}

resendBtn.addEventListener('click', async () => {
    try {
        resendBtn.style.display = 'none';
        countdownTimer.style.display = 'inline';
        countdownTimer.textContent = 'Sending...';
        await auth.requestPasswordReset(resetEmail);
        showToast('Reset code resent.', 'success');
        startTimer();
    } catch (err) {
        showToast((err.details && err.details.message) || err.message || 'Failed to resend code.', 'error');
        countdownTimer.style.display = 'none';
        resendBtn.style.display = 'inline';
    }
});

// ---------- OTP boxes ----------
otpBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        if (e.target.value.length === 1 && index < 5) otpBoxes[index + 1].focus();
    });
    box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && e.target.value === '' && index > 0) otpBoxes[index - 1].focus();
        else if (e.key === 'Enter') { e.preventDefault(); otpForm.requestSubmit(); }
    });
    box.addEventListener('paste', (e) => {
        e.preventDefault();
        const digits = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '').slice(0, 6);
        for (let i = 0; i < digits.length; i++) if (otpBoxes[i]) otpBoxes[i].value = digits[i];
        otpBoxes[Math.min(digits.length, 5)].focus();
    });
});

// ---------- Step 2: capture code, move to new-password ----------
// The real OTP check happens on the reset call; here we just require 6 digits.
otpForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const otp = otpBoxes.map(b => b.value).join('');
    if (otp.length !== 6) { showToast('Please enter all 6 digits of the code.', 'error'); return; }
    resetOtp = otp;
    clearInterval(countdownInterval);
    showSection(otpSection, resetSection, passwordInput);
});

document.getElementById('restart-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.reload();
});

// ---------- Password show/hide ----------
function wireToggle(btnId, input, openId, closedId) {
    document.getElementById(btnId).addEventListener('click', () => {
        const open = document.getElementById(openId);
        const closed = document.getElementById(closedId);
        if (input.type === 'password') {
            input.type = 'text'; open.style.display = 'none'; closed.style.display = 'block';
        } else {
            input.type = 'password'; open.style.display = 'block'; closed.style.display = 'none';
        }
    });
}
wireToggle('toggle-password-btn', passwordInput, 'eye-open-svg', 'eye-closed-svg');
wireToggle('toggle-confirm-btn', confirmInput, 'eye-open-confirm', 'eye-closed-confirm');

// ---------- Strength meter ----------
let passwordScore = 0;
passwordInput.addEventListener('input', () => {
    const password = passwordInput.value;
    const requirements = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    };
    let score = 0;
    for (const key in requirements) {
        const li = document.querySelector(`[data-requirement="${key}"]`);
        if (requirements[key]) {
            li.classList.remove('invalid'); li.classList.add('valid');
            li.querySelector('.check-icon').textContent = '✔';
            score++;
        } else {
            li.classList.remove('valid');
            li.querySelector('.check-icon').textContent = password.length ? '✖' : '○';
            if (password.length) li.classList.add('invalid'); else li.classList.remove('invalid');
        }
    }
    passwordScore = score;

    const fill = document.getElementById('strength-fill');
    const levelText = document.getElementById('strength-level');
    const levels = [
        { w: '0%', c: 'var(--text-muted)', t: 'None' },
        { w: '20%', c: '#ef4444', t: 'Very Weak' },
        { w: '40%', c: '#f97316', t: 'Weak' },
        { w: '60%', c: '#eab308', t: 'Medium' },
        { w: '80%', c: '#22c55e', t: 'Strong' },
        { w: '100%', c: '#15803d', t: 'Very Strong' }
    ];
    const lvl = password.length === 0 ? levels[0] : levels[score];
    fill.style.width = lvl.w;
    fill.style.backgroundColor = lvl.c;
    levelText.textContent = lvl.t;
    levelText.style.color = lvl.c;

    updateMatchHint();
});

function updateMatchHint() {
    const pw = passwordInput.value;
    const cf = confirmInput.value;
    if (!cf) { matchHint.className = 'match-hint'; matchHint.textContent = ''; return; }
    if (pw === cf) { matchHint.className = 'match-hint ok'; matchHint.textContent = '✔ Passwords match'; }
    else { matchHint.className = 'match-hint bad'; matchHint.textContent = '✖ Passwords do not match'; }
}
confirmInput.addEventListener('input', updateMatchHint);

// ---------- Step 3: reset password ----------
resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    passwordGroup.classList.remove('has-error');
    const newPassword = passwordInput.value;
    const confirmPassword = confirmInput.value;

    if (passwordScore < 5) {
        document.getElementById('password-error').textContent =
            'Password must be 8+ chars with upper, lower, number and special character.';
        passwordGroup.classList.add('has-error');
        return;
    }
    if (newPassword !== confirmPassword) {
        updateMatchHint();
        showToast('Passwords do not match.', 'error');
        return;
    }

    resetBtn.disabled = true;
    resetBtn.querySelector('.reset-btn-text').textContent = 'Resetting...';
    resetSpinner.style.display = 'inline-block';
    try {
        await auth.resetPassword(resetEmail, resetOtp, newPassword, confirmPassword);
        showToast('Password reset successfully. Redirecting to sign in...', 'success');
        setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    } catch (err) {
        const msg = (err.details && err.details.message) || err.message || 'Password reset failed.';
        showToast(msg, 'error');
        resetBtn.disabled = false;
        resetBtn.querySelector('.reset-btn-text').textContent = 'Reset Password';
        resetSpinner.style.display = 'none';
        // If the code was wrong/expired, send them back to re-enter it.
        if (/otp|code/i.test(msg)) {
            otpBoxes.forEach(b => b.value = '');
            showSection(resetSection, otpSection, otpBoxes[0]);
            startTimer();
        }
    }
});
