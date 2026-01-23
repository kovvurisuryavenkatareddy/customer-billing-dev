import './App.css';
import { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import CustomersPage from './pages/CustomersPage';
import AddCustomerPage from './pages/AddCustomerPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ToastContainer from './components/Toast';
import BillingImport from './components/BillingImport';
import ServicesPage from './pages/ServicesPage';
import { Routes, Route } from 'react-router-dom';
import { useNavigate, Navigate } from 'react-router-dom';
import { setNavigator } from './utils/router';

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [authPage, setAuthPage] = useState('login'); // 'login' or 'signup'

  // Sidebar closed by default, can be toggled
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = () => setSidebarOpen(s => !s);

  // Check if user is already logged in on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(savedUser));
    }

    // Listen for hash changes for auth page switching
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1);
      if (hash === 'signup' || hash === 'login') {
        setAuthPage(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Check initial hash

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useNavigate();
  useEffect(() => {
    // expose navigator to non-react modules (api.js)
    setNavigator(navigate);

    const onSessionExpired = () => {
      setIsAuthenticated(false);
      setUser(null);
      navigate('/login');
    };

    window.addEventListener('sessionExpired', onSessionExpired);
    return () => window.removeEventListener('sessionExpired', onSessionExpired);
  }, [navigate]);

  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  const handleLoginSuccess = (userData) => {
    setIsAuthenticated(true);
    setUser(userData);
    setCurrentPage('home');
  };

  const handleSignupSuccess = (userData) => {
    setIsAuthenticated(true);
    setUser(userData);
    setCurrentPage('home');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
    setCurrentPage('home');
  };

  // Render app wrapper always so ToastContainer is available on auth pages too
  return (
    <div className="App">
      {/* Only show header and sidebar if authenticated */}
      {isAuthenticated && (
        <Header 
          currentPage={currentPage} 
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
        />
      )}
      <div className={`app-layout ${isAuthenticated ? 'authenticated' : ''}`}>
        {isAuthenticated && (
          <Sidebar currentPage={currentPage} onNavigate={handleNavigate} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        )}
        <main className={isAuthenticated ? (sidebarOpen ? 'sidebar-open' : 'sidebar-closed') : 'no-sidebar'}>
          <Routes>
            <Route path="/login" element={<LoginPage onLoginSuccess={(userData) => { handleLoginSuccess(userData); navigate('/'); }} />} />
            <Route path="/signup" element={<SignupPage onSignupSuccess={(userData) => { handleSignupSuccess(userData); navigate('/'); }} />} />
            <Route path="/" element={isAuthenticated ? <CustomersPage onNavigate={handleNavigate} /> : <Navigate to="/login" replace />} />
            <Route path="/add-customer" element={isAuthenticated ? <AddCustomerPage onNavigate={handleNavigate} /> : <Navigate to="/login" replace />} />
            <Route path="/data-import" element={isAuthenticated ? <BillingImport /> : <Navigate to="/login" replace />} />
            <Route path="/services" element={isAuthenticated ? <ServicesPage /> : <Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
          </Routes>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

export default App;
