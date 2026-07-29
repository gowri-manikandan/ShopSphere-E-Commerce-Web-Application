import { api } from './api.js';
import { showToast } from './ui.js';
import './navbar.js'; // renders navbar + runs the auth guard

const list = document.getElementById('notif-list');
const emptyState = document.getElementById('notif-empty');

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

document.addEventListener('DOMContentLoaded', loadNotifications);

async function loadNotifications() {
    try {
        const items = await api.get('/api/notifications');
        list.innerHTML = '';
        if (!items || items.length === 0) {
            list.style.display = 'none';
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            list.style.display = '';
            items.forEach(n => list.appendChild(renderItem(n)));
        }
        // Mark everything read now that the user is viewing them; clear the navbar badge.
        try {
            await api.post('/api/notifications/read-all', {});
            if (window.updateNotifBadge) window.updateNotifBadge(0);
        } catch (e) { /* non-fatal */ }
    } catch (err) {
        list.innerHTML = '';
        showToast(err.message || 'Failed to load notifications.', 'error');
    }
}

function renderItem(n) {
    const row = document.createElement(n.link ? 'a' : 'div');
    row.className = 'notif-item' + (n.read ? '' : ' unread');
    if (n.link) row.href = n.link;
    row.innerHTML = `
        <div class="notif-item-body">
            <div class="notif-item-title">${esc(n.title)}</div>
            <div class="notif-item-msg">${esc(n.message)}</div>
        </div>
        <span class="notif-item-time">${timeAgo(n.createdAt)}</span>
    `;
    return row;
}
