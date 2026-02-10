/**
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
    return () => {
      try { delete window.showToast; } catch (e) {}
    };
  }, []);

  return null;
}
