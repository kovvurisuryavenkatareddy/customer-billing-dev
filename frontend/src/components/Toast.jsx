/**
<<<<<<< HEAD
 * Custom Toast notification system.
 * Renders toasts in a fixed portal at the top-right, always above modals.
 * Registers window.showToast for global use.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

// Icons for each type
const ICONS = {
  success: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#22c55e" />
      <path d="M6 10.5l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#ef4444" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  loading: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="animate-spin">
      <circle cx="10" cy="10" r="8" stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="40 12" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#3b82f6" />
      <path d="M10 9v5M10 7v.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  warning: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2L18.66 17H1.34L10 2z" fill="#f59e0b" />
      <path d="M10 8v4M10 14v.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

const BG = {
  success: '#f0fdf4',
  error:   '#fef2f2',
  loading: '#eff6ff',
  info:    '#eff6ff',
  warning: '#fffbeb',
};

const BORDER = {
  success: '#86efac',
  error:   '#fca5a5',
  loading: '#93c5fd',
  info:    '#93c5fd',
  warning: '#fcd34d',
};

const TEXT = {
  success: '#15803d',
  error:   '#b91c1c',
  loading: '#1d4ed8',
  info:    '#1d4ed8',
  warning: '#92400e',
};

let _setToasts = null; // reference to state setter, set when component mounts

function ToastItem({ toast, onRemove }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => onRemove(toast.id), 300);
  }, [toast.id, onRemove]);

  // Auto-dismiss after duration (0 = stay until replaced)
  useEffect(() => {
    if (!toast.duration || toast.duration === 0) return;
    const t = setTimeout(dismiss, toast.duration);
    return () => clearTimeout(t);
  }, [toast.duration, dismiss]);

  const type = toast.type || 'info';

  return (
    <div
      onClick={toast.type !== 'loading' ? dismiss : undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '12px 16px',
        borderRadius: '10px',
        border: `1px solid ${BORDER[type] || BORDER.info}`,
        background: BG[type] || BG.info,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        minWidth: '280px',
        maxWidth: '380px',
        cursor: toast.type !== 'loading' ? 'pointer' : 'default',
        transition: 'all 0.3s ease',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(40px)',
        marginBottom: '8px',
      }}
      title={toast.type !== 'loading' ? 'Click to dismiss' : undefined}
    >
      <div style={{ flexShrink: 0, marginTop: '1px' }}>
        {ICONS[type] || ICONS.info}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '14px',
          fontWeight: 500,
          color: TEXT[type] || TEXT.info,
          lineHeight: '1.4',
          wordBreak: 'break-word',
        }}>
          {toast.message}
        </div>
      </div>
      {toast.type !== 'loading' && (
        <button
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 0 0 4px',
            color: TEXT[type] || TEXT.info,
            opacity: 0.6,
            fontSize: '16px',
            lineHeight: 1,
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}

function ToastPortal() {
  const [toasts, setToasts] = useState([]);
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  useEffect(() => {
    _setToasts = setToasts;
    return () => { _setToasts = null; };
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: '80px',
        right: '20px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      {toasts.map(toast => (
        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem toast={toast} onRemove={removeToast} />
        </div>
      ))}
    </div>,
    document.body
  );
}

export default function ToastContainer() {
  useEffect(() => {
    /**
     * window.showToast({ message, type, duration, key })
     * - type: 'success' | 'error' | 'loading' | 'info' | 'warning'
     * - duration: ms (0 = stay until replaced by same key)
     * - key: if provided, replaces existing toast with same key
     */
    window.showToast = ({ message: msg, type = 'info', duration, key } = {}) => {
      if (!_setToasts) return;

      // Default durations per type
      const defaultDuration = type === 'loading' ? 0 : type === 'error' ? 5000 : 3000;
      const finalDuration = typeof duration === 'number' ? duration : defaultDuration;

      const id = key || `toast-${Date.now()}-${Math.random()}`;

      _setToasts(prev => {
        // If key exists, replace that toast
        if (key) {
          const exists = prev.find(t => t.id === key);
          if (exists) {
            return prev.map(t => t.id === key
              ? { ...t, message: msg, type, duration: finalDuration }
              : t
            );
          }
        }
        // Add new toast, keep max 5
        const next = [...prev, { id, message: msg, type, duration: finalDuration }];
        return next.slice(-5);
      });
    };

=======
 * Registers global window.showToast to use Ant Design message API.
 * No DOM rendered; callers (api.js, pages) keep using window.showToast.
 */
import { useEffect } from 'react';
import { message } from 'antd';

export default function ToastContainer() {
  useEffect(() => {
    const durationSec = 4;
    window.showToast = ({ message: msg, type = 'info', duration = 4000 }) => {
      const sec = typeof duration === 'number' ? duration / 1000 : durationSec;
      if (type === 'success') message.success(msg, sec);
      else if (type === 'error') message.error(msg, sec);
      else message.info(msg, sec);
    };
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
    return () => {
      try { delete window.showToast; } catch (e) {}
    };
  }, []);

<<<<<<< HEAD
  return <ToastPortal />;
=======
  return null;
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
}
