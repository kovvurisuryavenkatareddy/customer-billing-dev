import React, { useState, useEffect } from 'react';
import '../styles/toast.css';

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    // expose a simple global helper to show toasts
    window.showToast = ({ message, type = 'info', duration = 4000 }) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, duration);
    };
    return () => {
      try { delete window.showToast; } catch (e) {}
    };
  }, []);

  return (
    <div className="toast-root" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-item toast-${t.type}`}>
          <div className="toast-message">{t.message}</div>
        </div>
      ))}
    </div>
  );
}
