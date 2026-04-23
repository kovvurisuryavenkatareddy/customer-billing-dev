import { useState, useEffect } from 'react';
import { Layout } from 'antd';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import CustomersPage from './pages/CustomersPage';
import AddCustomerPage from './pages/AddCustomerPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ToastContainer from './components/Toast';
import BillingImport from './components/BillingImport';
import ServicesPage from './pages/ServicesPage';
<<<<<<< HEAD
import ReportsPage from './pages/ReportsPage';
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
import { Routes, Route, useLocation } from 'react-router-dom';
import { useNavigate, Navigate } from 'react-router-dom';
import { setNavigator } from './utils/router';

const { Content } = Layout;

function getInitialAuth() {
<<<<<<< HEAD
  const tokenRaw = localStorage.getItem('token');
  const token = (tokenRaw && tokenRaw !== 'undefined' && tokenRaw !== 'null') ? tokenRaw : '';
=======
  const token = localStorage.getItem('token');
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
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
<<<<<<< HEAD
  if (pathname.startsWith('/reports')) return 'reports';
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
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
    <Layout className="min-h-screen bg-[#f4f7f9] overflow-x-hidden">
      {isAuthenticated && (
        <Header
          currentPage={currentPage}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}
        />
      )}
      <Layout
        className="flex-row"
        style={isAuthenticated ? { paddingTop: HEADER_HEIGHT, minHeight: '100vh' } : {}}
      >
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
        <Content
          className={`min-h-screen transition-[margin-left] duration-300 bg-[#f4f7f9] overflow-x-hidden ${isAuthenticated && sidebarOpen ? 'md:ml-[260px]' : ''}`}
          style={isAuthenticated ? { paddingTop: 16 } : {}}
        >
          <Routes>
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage onLoginSuccess={(userData) => { handleLoginSuccess(userData); navigate('/'); }} />} />
            <Route path="/signup" element={isAuthenticated ? <Navigate to="/" replace /> : <SignupPage onSignupSuccess={(userData) => { handleSignupSuccess(userData); navigate('/'); }} />} />
            <Route path="/" element={isAuthenticated ? <CustomersPage onNavigate={handleNavigate} /> : <Navigate to="/login" replace />} />
            <Route path="/add-customer" element={isAuthenticated ? <AddCustomerPage onNavigate={handleNavigate} /> : <Navigate to="/login" replace />} />
            <Route path="/data-import" element={isAuthenticated ? <BillingImport /> : <Navigate to="/login" replace />} />
            <Route path="/services" element={isAuthenticated ? <ServicesPage /> : <Navigate to="/login" replace />} />
<<<<<<< HEAD
            <Route path="/reports" element={isAuthenticated ? <ReportsPage /> : <Navigate to="/login" replace />} />
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
            <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
          </Routes>
        </Content>
      </Layout>
      <ToastContainer />
    </Layout>
  );
}


export default App;
