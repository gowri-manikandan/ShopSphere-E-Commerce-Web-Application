// Shared STOMP-over-SockJS client (CLAUDE.md §5/§13).
// One connection per page load; pages subscribe to topics via subscribeWhenConnected().
// Requires the classic CDN scripts (SockJS + @stomp/stompjs UMD) on the page — when they
// are absent (pages without realtime features) every function is a silent no-op.
import { WS_BASE } from './config.js';

let client = null;
let connected = false;
const pendingSubscriptions = []; // queued until CONNECT completes; re-run on reconnect

function libsAvailable() {
    return typeof window.SockJS !== 'undefined' && typeof window.StompJs !== 'undefined';
}

function getClient() {
    if (!libsAvailable()) return null;
    if (client) return client;

    const token = localStorage.getItem('token');
    client = new window.StompJs.Client({
        webSocketFactory: () => new window.SockJS(WS_BASE),
        // JWT as STOMP CONNECT header (never a query param) — §13. Anonymous connects
        // are allowed server-side; they can only subscribe to public stock topics.
        connectHeaders: token ? { Authorization: 'Bearer ' + token } : {},
        // Free-tier backends sleep and drop sockets (§14): silently reconnect forever.
        reconnectDelay: 5000,
        onConnect: () => {
            connected = true;
            // (Re)establish every registered subscription on each (re)connect.
            pendingSubscriptions.forEach(sub => {
                sub.handle = client.subscribe(sub.topic, msg => sub.callback(JSON.parse(msg.body)));
            });
        },
        onWebSocketClose: () => {
            connected = false;
        }
    });
    client.activate();
    return client;
}

/**
 * Subscribe to a broker topic; safe to call before the socket is connected.
 * The subscription survives reconnects. Returns { unsubscribe() }.
 */
export function subscribeWhenConnected(topic, callback) {
    const sub = { topic, callback, handle: null };
    pendingSubscriptions.push(sub);

    const c = getClient();
    if (!c) return { unsubscribe() {} }; // realtime libs not on this page

    if (connected) {
        sub.handle = c.subscribe(topic, msg => callback(JSON.parse(msg.body)));
    }
    return {
        unsubscribe() {
            const idx = pendingSubscriptions.indexOf(sub);
            if (idx >= 0) pendingSubscriptions.splice(idx, 1);
            if (sub.handle) sub.handle.unsubscribe();
        }
    };
}
