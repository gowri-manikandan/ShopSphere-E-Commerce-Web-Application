// API Base URL Configuration for ShopSphere
export const API_BASE = "http://localhost:8080";

// SockJS endpoint for live stock / order-status updates (http(s) URL, not ws://)
export const WS_BASE = API_BASE + "/ws";

// Google OAuth 2.0 Web client ID (from Google Cloud Console). Leave empty to keep the
// "Continue with Google" button as a coming-soon placeholder. Must match the backend's
// GOOGLE_CLIENT_ID for the ID token to verify.
export const GOOGLE_CLIENT_ID = "";
