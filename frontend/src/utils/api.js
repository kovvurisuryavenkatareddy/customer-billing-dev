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
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
}

export function handle401Error() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  // Emit a sessionExpired event so React can update its state
  try {
    if (typeof window !== 'undefined') {
      const ev = new Event('sessionExpired');
      window.dispatchEvent(ev);
    }
  } catch (e) {
    // ignore
  }

  // Programmatic navigation via helper if available
  try {
    navigateToLogin();
  } catch (e) {
    if (typeof window !== 'undefined') window.location.hash = '#login';
  }

  if (window.showToast) {
    window.showToast({ message: 'Session expired. Please login again.', type: 'error' });
  }
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
