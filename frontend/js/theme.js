// Global-ready light/dark theme controller.
// Sets data-theme on <html> from a saved preference, falling back to the OS setting.
// Import this as early as possible (top of a page's entry module) to avoid a flash of
// the wrong theme. Other pages/navbar can reuse toggleTheme()/initThemeToggle() later —
// nothing here is login-specific.

const STORAGE_KEY = 'theme';

function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** The effective theme: saved preference if set, else the OS preference. */
export function currentTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return systemPrefersDark() ? 'dark' : 'light';
}

/** Apply a theme to the document root. */
export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

// Apply immediately on import so the first paint is correct.
applyTheme(currentTheme());

// Follow OS changes only while the user hasn't set an explicit preference.
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(STORAGE_KEY)) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });
}

/** Flip the theme, persist the choice, and return the new value. */
export function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    return next;
}

const SUN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>`;
const MOON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>`;

// Show the icon of the theme you'll switch TO (moon while light, sun while dark).
function iconFor(theme) {
    return theme === 'dark' ? SUN_SVG : MOON_SVG;
}

/** Wire a button element to toggle the theme and keep its icon/label in sync. */
export function initThemeToggle(btn) {
    if (!btn) return;
    const render = () => {
        const theme = currentTheme();
        btn.innerHTML = iconFor(theme);
        const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
    };
    render();
    btn.addEventListener('click', () => {
        toggleTheme();
        render();
    });
}
