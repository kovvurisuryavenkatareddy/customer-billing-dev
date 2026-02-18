/**
 * Registers global window.showToast to use Ant Design message API.
 * No DOM rendered; callers (api.js, pages) keep using window.showToast.
 */
import { useEffect } from 'react';
import { message } from 'antd';

export default function ToastContainer() {
  useEffect(() => {
    const durationSec = 4;
    // Keep messages visible under fixed header, above overlays.
    message.config({ top: 88, maxCount: 3, duration: durationSec });
    /**
     * Global toast helper.
     * Supports a `key` to update/replace an existing toast (useful for loading -> success/error).
     */
    window.showToast = ({ message: msg, type = 'info', duration = 4000, key } = {}) => {
      const sec = typeof duration === 'number' ? duration / 1000 : durationSec;
      const normalizedType = (type || 'info').toString();

      // When key is present, use message.open so it can be updated.
      if (key) {
        const openType =
          normalizedType === 'success' ? 'success'
          : normalizedType === 'error' ? 'error'
          : normalizedType === 'loading' ? 'loading'
          : 'info';
        message.open({ type: openType, content: msg, duration: sec, key });
        return;
      }

      if (normalizedType === 'success') message.success(msg, sec);
      else if (normalizedType === 'error') message.error(msg, sec);
      else if (normalizedType === 'loading') message.loading(msg, sec);
      else message.info(msg, sec);
    };
    return () => {
      try { delete window.showToast; } catch (e) {}
    };
  }, []);

  return null;
}
