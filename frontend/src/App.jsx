import { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import CustomersPage from './pages/CustomersPage';
import AddCustomerPage from './pages/AddCustomerPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ToastContainer from './components/Toast';
import BillingImport from './components/BillingImport';
import ServicesPage from './pages/ServicesPage';
import ReportsPage from './pages/ReportsPage';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useNavigate, Navigate } from 'react-router-dom';
import { setNavigator } from './utils/router';
import { refreshToken } from './utils/api';

function getInitialAuth() {
  const tokenRaw = localStorage.getItem('token');
  const token = (tokenRaw && tokenRaw !== 'undefined' && tokenRaw !== 'null') ? tokenRaw : '';
  const savedUser = localStorage.getItem('user');
  if (!token || !savedUser) return { isAuthenticated: false, user: null };
  try {
    return { isAuthenticated: true, user: JSON.parse(savedUser) };
  } catch {
    return { isAuthenticated: false, user: null };
  }
}

function pathToPage(pathname) {
  if (pathname === '/' || pathname === '') return 'home';
  if (pathname.startsWith('/add-customer')) return 'add-customer';
  if (pathname.startsWith('/data-import')) return 'data-import';
  if (pathname.startsWith('/services')) return 'services';
  if (pathname.startsWith('/reports')) return 'reports';
  return 'home';
}

function App() {
  const [currentPage, setCurrentPage] = useState(() =>
    typeof window !== 'undefined' ? pathToPage(window.location.pathname) : 'home'
  );
  const [authState, setAuthState] = useState(() => getInitialAuth());
  const isAuthenticated = authState.isAuthenticated;
  const user = authState.user;
  const [authPage, setAuthPage] = useState('login');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = () => setSidebarOpen(s => !s);
  const location = useLocation();

  // Sync currentPage with URL on load and when location changes (e.g. refresh on /add-customer)
  useEffect(() => {
    setCurrentPage(pathToPage(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1);
      if (hash === 'signup' || hash === 'login') setAuthPage(hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useNavigate();
  useEffect(() => {
    setNavigator(navigate);
    const onSessionExpired = () => {
      setAuthState({ isAuthenticated: false, user: null });
      navigate('/login');
    };
    window.addEventListener('sessionExpired', onSessionExpired);
    return () => window.removeEventListener('sessionExpired', onSessionExpired);
  }, [navigate]);

  // Keep the session alive while the user is actively working: refresh the
  // token on an interval, and again on tab refocus if it's been a while
  // (e.g. laptop was asleep), so a long working session never hits expiry.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
    let lastRefresh = Date.now();

    const doRefresh = () => {
      lastRefresh = Date.now();
      refreshToken();
    };

    const intervalId = setInterval(doRefresh, REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh > REFRESH_INTERVAL_MS) {
        doRefresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAuthenticated]);

  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  const handleLoginSuccess = (userData) => {
    setAuthState({ isAuthenticated: true, user: userData });
    setCurrentPage('home');
  };

  const handleSignupSuccess = (userData) => {
    setAuthState({ isAuthenticated: true, user: userData });
    setCurrentPage('home');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuthState({ isAuthenticated: false, user: null });
    setCurrentPage('home');
  };

  const HEADER_HEIGHT = 72;
  const SIDEBAR_WIDTH = 260;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4f7f9', overflowX: 'hidden' }}>
      {isAuthenticated && (
        <Header
          currentPage={currentPage}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
          style={{ position: 'fixed', top: 0, left: 0, right: 0 }}
        />
      )}
      <Box sx={{ display: 'flex', ...(isAuthenticated ? { pt: `${HEADER_HEIGHT}px`, minHeight: '100vh' } : {}) }}>
        {isAuthenticated && (
          <Sidebar
            currentPage={currentPage}
            onNavigate={handleNavigate}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            top={HEADER_HEIGHT}
            width={SIDEBAR_WIDTH}
          />
        )}
        <Box
          component="main"
          sx={{
            minHeight: '100vh',
            flex: 1,
            minWidth: 0,
            bgcolor: '#f4f7f9',
            ...(isAuthenticated ? { pt: 2 } : {}),
          }}
        >
          <Routes>
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage onLoginSuccess={(userData) => { handleLoginSuccess(userData); navigate('/'); }} />} />
            <Route path="/signup" element={isAuthenticated ? <Navigate to="/" replace /> : <SignupPage onSignupSuccess={(userData) => { handleSignupSuccess(userData); navigate('/'); }} />} />
            <Route path="/" element={isAuthenticated ? <CustomersPage onNavigate={handleNavigate} /> : <Navigate to="/login" replace />} />
            <Route path="/add-customer" element={isAuthenticated ? <AddCustomerPage onNavigate={handleNavigate} /> : <Navigate to="/login" replace />} />
            <Route path="/data-import" element={isAuthenticated ? <BillingImport /> : <Navigate to="/login" replace />} />
            <Route path="/services" element={isAuthenticated ? <ServicesPage /> : <Navigate to="/login" replace />} />
            <Route path="/reports" element={isAuthenticated ? <ReportsPage /> : <Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
          </Routes>
        </Box>
      </Box>
      <ToastContainer />
    </Box>
  );
}


export default App;
