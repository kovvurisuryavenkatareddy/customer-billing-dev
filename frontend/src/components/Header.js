import React from 'react';

export default function Header({ currentPage, onNavigate, user, onLogout, onToggleSidebar, sidebarOpen }) {
  const initials = user ? `${(user.first_name||'').charAt(0)}${(user.last_name||'').charAt(0)}`.toUpperCase() : '';

  return (
    <header className="App-header">
      <div className="header-left">
        <button
          className="sidebar-toggle"
          aria-label="Toggle sidebar"
          onClick={() => onToggleSidebar && onToggleSidebar()}
        >
          <span />
          <span />
          <span />
        </button>
        <img src="/logo192.png" alt="logo" className="header-logo" />
        <div className="header-title-group">
          <h1>Misha House Billing</h1>
          <p>Manage services, invoices & customers</p>
        </div>
      </div>

      <nav className="header-nav">
        <div className="nav-right">
          {user && (
            <div className="user-block">
              <div className="avatar" title={`${user.first_name} ${user.last_name}`}>{initials}</div>
              <div className="user-info">
                <div className="user-name">{user.first_name} {user.last_name}</div>
                <div className="user-email">{user.email}</div>
              </div>
              <button className="logout-btn" onClick={onLogout}>Logout</button>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
