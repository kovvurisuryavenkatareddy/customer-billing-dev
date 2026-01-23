let _navigate = null;

export function setNavigator(navigate) {
  _navigate = navigate;
}

export function navigateToLogin() {
  if (_navigate) {
    _navigate('/login');
  } else if (typeof window !== 'undefined') {
    window.location.hash = '#login';
  }
}

export default {
  setNavigator,
  navigateToLogin,
};
