/**
 * Login page using Material-UI Paper, TextField, Button, Alert.
 */
import React, { useState } from 'react';
import {
  Box, Paper, TextField, Button, Alert, Typography, InputAdornment, IconButton,
} from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { API_BASE } from '../utils/api';
import { Link } from 'react-router-dom';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const errs = {};
    if (!email.trim()) errs.email = 'Enter your email';
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Invalid email';
    if (!password) errs.password = 'Enter your password';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Login failed');
      if (!data?.access_token || typeof data.access_token !== 'string') {
        throw new Error('Login succeeded but token was missing. Please contact admin.');
      }
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      onLoginSuccess?.(data.user);
    } catch (err) {
      setError(err.message || 'Failed to login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh', width: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', p: 2.5,
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #007bff, #0056b3)',
      }}
    >
      <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <Box sx={{
          position: 'absolute', width: 400, height: 400, top: -96, left: -96,
          borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.15)', filter: 'blur(60px)',
        }} />
        <Box sx={{
          position: 'absolute', width: 350, height: 350, bottom: -96, right: -96,
          borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.15)', filter: 'blur(60px)',
        }} />
      </Box>

      <Paper elevation={8} sx={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 480, p: { xs: 3, md: 5 }, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#007bff" fillOpacity="0.2" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 17L12 22L22 17" stroke="#0056b3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 12L12 17L22 12" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Box>
        <Typography variant="h4" align="center" sx={{ fontWeight: 600, color: '#1a1f36', mb: 1 }}>
          Misha House Billing
        </Typography>
        <Typography align="center" sx={{ color: '#6b7280', mb: 4 }}>
          Please login to your account
        </Typography>

        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            fullWidth
            label="Email Address"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={Boolean(fieldErrors.email)}
            helperText={fieldErrors.email}
            disabled={loading}
            size="medium"
            margin="normal"
            slotProps={{ input: { startAdornment: (
              <InputAdornment position="start"><MailOutlineIcon sx={{ color: 'text.disabled' }} /></InputAdornment>
            ) } }}
          />
          <TextField
            fullWidth
            type={showPassword ? 'text' : 'password'}
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={Boolean(fieldErrors.password)}
            helperText={fieldErrors.password}
            disabled={loading}
            size="medium"
            margin="normal"
            slotProps={{ input: {
              startAdornment: (
                <InputAdornment position="start"><LockOutlinedIcon sx={{ color: 'text.disabled' }} /></InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword((s) => !s)}
                    edge="end"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    disabled={loading}
                  >
                    {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            } }}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            loading={loading}
            sx={{ mt: 4, py: 1.25 }}
          >
            Login
          </Button>
        </Box>

        <Box sx={{ mt: 4, pt: 3, textAlign: 'center', borderTop: '1px solid #e5e7eb' }}>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>
            Don&apos;t have an account?{' '}
            <Link to="/signup" style={{ color: '#007bff', fontWeight: 600, textDecoration: 'none' }}>
              Sign up here
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
