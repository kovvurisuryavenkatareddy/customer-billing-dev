// Priority order for API base URL:
// 1. Runtime-injected `window.__API_BASE__` (e.g. from index.html script)
// 2. Build-time env `VITE_API_BASE` (Vite)
// 3. Fallback to localhost
import { navigateToLogin } from './router';
const metaTag = (typeof document !== 'undefined' && document.querySelector('meta[name="api-base"]'))
  ? document.querySelector('meta[name="api-base"]').getAttribute('content')
  : '';

export const API_BASE =
  (metaTag && metaTag !== '' ? metaTag : '') ||
  (typeof window !== 'undefined' && window.__API_BASE__) ||
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) ||
  'http://localhost:8000';

export function getAuthHeaders() {
  const tokenRaw = localStorage.getItem('token');
  const token = (tokenRaw && tokenRaw !== 'undefined' && tokenRaw !== 'null') ? tokenRaw : '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Ask the backend for a fresh token (renewed expiry) using the current one.
// Called periodically while the user is active so a long working session
// never runs into the token's expiry. Silently no-ops on failure — the
// existing token keeps working until it actually expires.
export async function refreshToken() {
  const tokenRaw = localStorage.getItem('token');
  const token = (tokenRaw && tokenRaw !== 'undefined' && tokenRaw !== 'null') ? tokenRaw : '';
  if (!token) return false;
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) return false;
    const data = await response.json();
    if (!data?.access_token) return false;
    localStorage.setItem('token', data.access_token);
    if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
    return true;
  } catch (e) {
    return false;
  }
}

// Only run logout/redirect once when multiple 401s occur in quick succession (e.g. parallel requests).
let _401Handling = false;
export function handle401Error() {
  if (_401Handling) return;
  _401Handling = true;
  setTimeout(() => { _401Handling = false; }, 2000);

  localStorage.removeItem('token');
  localStorage.removeItem('user');
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sessionExpired'));
    }
  } catch (e) {
    /* ignore */
  }
  try {
    navigateToLogin();
  } catch (e) {
    if (typeof window !== 'undefined') window.location.hash = '#login';
  }
  if (window.showToast) {
    window.showToast({ message: 'Session expired. Please login again.', type: 'error' });
  }
  setTimeout(() => { _401Handling = false; }, 2000);
}

// Wrap the global fetch to catch 401 responses and handle session expiry centrally.
// This ensures existing code that uses `fetch()` doesn't need manual checks.
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      // capture token that was present at request time
      const tokenAtRequest = (typeof window !== 'undefined') ? localStorage.getItem('token') : null;
      const response = await originalFetch(input, init);

      // Normalize URL string for checks
      let reqUrl = '';
      try {
        reqUrl = typeof input === 'string' ? input : (input && input.url) || '';
      } catch (e) {
        reqUrl = '';
      }

      // don't treat auth endpoints or unauthenticated requests as session expiry triggers
      const isAuthEndpoint = reqUrl.includes('/auth/login') || reqUrl.includes('/auth/refresh') || reqUrl.includes('/auth/register');

      if (response && response.status === 401 && tokenAtRequest && !isAuthEndpoint) {
        // A 401 can be a transient blip (e.g. backend restarting) rather than
        // a truly expired session. Try one silent refresh-and-retry before
        // logging the user out. Only safe to retry when `input` is a plain
        // URL string with a plain-object init (the common case in this app) —
        // a Request object's body can't be re-read, so skip retry there.
        if (typeof input === 'string') {
          const refreshed = await refreshToken();
          if (refreshed) {
            const retryInit = { ...init, headers: { ...(init.headers || {}), ...getAuthHeaders() } };
            const retryResponse = await originalFetch(input, retryInit);
            if (retryResponse.status !== 401) {
              return retryResponse;
            }
          }
        }
        try {
          handle401Error();
        } catch (e) {
          console.error('Error handling 401:', e);
        }
      }

      return response;
    } catch (err) {
      throw err;
    }
  };
}
