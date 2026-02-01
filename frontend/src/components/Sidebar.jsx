/**
 * App sidebar: fixed below header, Ant Design Menu. Stays at top when scrolling.
 */
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, Typography } from 'antd';
import {
  HomeOutlined,
  UserAddOutlined,
  ImportOutlined,
  SettingOutlined,
  CloseOutlined,
} from '@ant-design/icons';

const items = [
  { key: 'home', icon: <HomeOutlined />, label: 'Home' },
  { key: 'add-customer', icon: <UserAddOutlined />, label: 'Add Customer' },
  { key: 'data-import', icon: <ImportOutlined />, label: 'Data Import' },
  { key: 'services', icon: <SettingOutlined />, label: 'Services' },
];

export default function Sidebar({ currentPage, onNavigate, open = false, onClose, top = 72, width = 260 }) {
  useEffect(() => {
    if (open && window.innerWidth <= 900) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('sidebar-open-mobile');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('sidebar-open-mobile');
    }
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('sidebar-open-mobile');
    };
  }, [open]);

  const location = useLocation();
  const pathToKey = {
    '/': 'home',
    '/add-customer': 'add-customer',
    '/data-import': 'data-import',
    '/services': 'services',
  };
  const selectedKey = pathToKey[location.pathname] || currentPage || 'home';

  const navigate = useNavigate();

  const handleMenuClick = ({ key }) => {
    onNavigate?.(key);
    const path = key === 'home' ? '/' : `/${key}`;
    navigate(path);
    onClose?.();
  };

  return (
    <>
      <aside
        role="navigation"
        aria-label="Main navigation"
        style={{
          position: 'fixed',
          left: 0,
          top,
          bottom: 0,
          width,
          zIndex: 999,
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
          boxShadow: open ? '4px 0 12px rgba(0,0,0,0.08)' : 'none',
          pointerEvents: open ? 'auto' : 'none',
        }}
        className="sidebar-container"
      >
        <div className="flex flex-col h-full overflow-y-auto">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100">
            <Typography.Text type="secondary" strong className="text-xs uppercase tracking-wider">
              Menu
            </Typography.Text>
            <button
              type="button"
              onClick={onClose}
              className="md:hidden p-1.5 rounded hover:bg-gray-100 text-gray-500"
              aria-label="Close menu"
            >
              <CloseOutlined />
            </button>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={items}
            onClick={handleMenuClick}
            className="border-0 flex-1 pt-2"
            style={{ fontSize: 14, paddingLeft: 8, paddingRight: 8 }}
            inlineIndent={12}
          />
          <div className="px-4 py-3 border-t border-gray-100">
            <Typography.Text type="secondary" className="text-xs">
              Misha House Billing · v1.0
            </Typography.Text>
          </div>
        </div>
      </aside>
      {open && (
        <div
          role="button"
          tabIndex={0}
          className="fixed inset-0 md:hidden bg-black/30 z-[998]"
          style={{ top }}
          onClick={() => onClose?.()}
          onKeyDown={(e) => e.key === 'Escape' && onClose?.()}
          aria-label="Close sidebar overlay"
        />
      )}
    </>
  );
}
