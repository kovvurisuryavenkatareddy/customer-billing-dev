import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './sidebar.css';

export default function Sidebar({ currentPage, onNavigate, open = false, onClose }) {
  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (open && window.innerWidth <= 900) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const navigate = useNavigate();

  const handleNavClick = (page) => {
    // keep local app state in sync
    onNavigate && onNavigate(page);

    // map page keys to router paths
    let path = '/';
    if (page === 'add-customer') path = '/add-customer';
    else if (page === 'data-import') path = '/data-import';
    else if (page === 'services') path = '/services';

    navigate(path);

    if (onClose) onClose();
  };

  return (
    <>
      <aside className={`app-sidebar ${open ? 'open' : 'closed'}`} aria-hidden={!open}>
        <nav className="sidebar-nav">
          <button 
            className={currentPage === 'home' ? 'side-active' : 'side-btn'} 
            onClick={() => handleNavClick('home')}
          >
            Home
          </button>
          <button 
            className={currentPage === 'add-customer' ? 'side-active' : 'side-btn'} 
            onClick={() => handleNavClick('add-customer')}
          >
            Add Customer
          </button>
          <button 
            className={currentPage === 'data-import' ? 'side-active' : 'side-btn'} 
            onClick={() => handleNavClick('data-import')}
          >
            Data Import
          </button>
          <button 
            className={currentPage === 'services' ? 'side-active' : 'side-btn'} 
            onClick={() => handleNavClick('services')}
          >
            Services
          </button>
        </nav>

        <div className="sidebar-footer">v1.0</div>
      </aside>
      {/* overlay for small screens when sidebar open */}
      {open && (
        <div 
          className="sidebar-overlay visible" 
          onClick={() => onClose && onClose()}
          aria-label="Close sidebar"
        />
      )}
    </>
  );
}
