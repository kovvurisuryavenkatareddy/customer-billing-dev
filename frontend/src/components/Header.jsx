/**
 * App navbar using Ant Design Layout.Header, Dropdown, Avatar, Button.
 */
import React from 'react';
import { Layout, Button, Avatar, Dropdown, Space, Typography } from 'antd';
import { MenuOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

export default function Header({ currentPage, onNavigate, user, onLogout, onToggleSidebar, style: styleProp }) {
  const initials = user ? `${(user.first_name || '').charAt(0)}${(user.last_name || '').charAt(0)}`.toUpperCase() : '';

  const userMenuItems = [
    {
      key: 'user-info',
      label: (
        <div className="py-1 px-0">
          <Text strong className="block">{user ? `${user.first_name} ${user.last_name}` : ''}</Text>
          <Text type="secondary" className="text-xs">{user?.email}</Text>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: false,
      onClick: onLogout,
    },
  ];

  return (
    <AntHeader
      style={{ height: 72, lineHeight: '72px', padding: '0 24px', ...styleProp }}
      className="flex items-center justify-between bg-[#007bff] text-white shadow-md z-[1300]"
    >
      <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
        <Button
          type="text"
          icon={<MenuOutlined className="text-white text-xl" />}
          onClick={() => onToggleSidebar?.()}
          aria-label="Toggle sidebar"
          className="flex items-center justify-center text-white hover:bg-white/20 hover:text-white border-0 h-10 w-10"
        />
        <img src="/logo192.png" alt="Logo" className="w-10 h-10 md:w-11 md:h-11 rounded-lg object-cover shrink-0 shadow-sm" />
        <div className="min-w-0 overflow-hidden">
          <h1 className="m-0 text-lg md:text-2xl font-semibold text-white truncate">Misha House Billing</h1>
          <p className="m-0 opacity-90 text-xs md:text-[13px] truncate hidden md:block">Manage services, invoices & customers</p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4 ml-auto shrink-0">
        {user && (
          <Dropdown
            menu={{ items: userMenuItems }}
            trigger={['click']}
            placement="bottomRight"
            overlayClassName="navbar-user-dropdown"
            dropdownRender={(menu) => (
              <div className="bg-white rounded-lg shadow-lg border border-gray-100 min-w-[200px] py-1">
                {menu}
              </div>
            )}
          >
            <button
              type="button"
              className="flex items-center gap-2 md:gap-3 rounded-lg px-2 py-1.5 hover:bg-white/15 transition-colors border-0 cursor-pointer text-left"
              aria-label="User menu"
            >
              <Avatar
                size={{ xs: 36, md: 40 }}
                className="bg-white/25 text-white shrink-0"
                icon={!initials ? <UserOutlined /> : undefined}
              >
                {initials || null}
              </Avatar>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-white font-medium text-sm truncate max-w-[140px]">
                  {user.first_name} {user.last_name}
                </span>
                <span className="text-white/80 text-xs truncate max-w-[140px]">{user.email}</span>
              </div>
            </button>
          </Dropdown>
        )}
      </div>
    </AntHeader>
  );
}
