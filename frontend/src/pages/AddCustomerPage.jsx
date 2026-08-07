/**
 * Add Customer page: Card layout, loading spinner, back link.
 */
import React, { useState, useEffect } from 'react';
import { Box, Paper, CardHeader, CardContent, CircularProgress, Button, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useNavigate } from 'react-router-dom';
import CustomerForm from '../components/form';
import { API_BASE, getAuthHeaders } from '../utils/api';

export default function AddCustomerPage({ onNavigate }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/services/`, { headers: getAuthHeaders() });
        if (res.ok) {
          const js = await res.json();
          setServices(js);
        }
      } catch (e) {
        console.warn('Could not load services', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubmit(payload) {
    if (saving) return;
    const toastKey = 'add-customer';
    try {
      setSaving(true);
      window.showToast?.({ key: toastKey, type: 'loading', message: 'Adding customer…', duration: 0 });
      const res = await fetch(`${API_BASE}/customers/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create');
      window.showToast?.({ key: toastKey, message: 'Customer added successfully.', type: 'success' });
      setFormKey((k) => k + 1);
      if (onNavigate) onNavigate('home');
      else navigate('/');
    } catch (err) {
      console.error('Add customer failed', err);
      window.showToast?.({ key: toastKey, message: 'Could not create customer', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 900, mx: 'auto', p: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 2 }}>
        <Button
          size="small"
          startIcon={<ArrowBackIcon fontSize="small" />}
          onClick={() => { navigate('/'); onNavigate?.('home'); }}
          sx={{ ml: -1 }}
        >
          Back
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
        <CardHeader
          title={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonAddIcon sx={{ color: '#007bff' }} />
              <Typography variant="h6" fontWeight={600}>Add Customer</Typography>
            </Box>
          }
        />
        <CardContent sx={{ pt: 0 }}>
          <Typography color="text.secondary" sx={{ mb: 2.5 }}>
            Add a new participant with customer details and service information.
          </Typography>

          {loading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : (
            <CustomerForm key={formKey} onSubmit={handleSubmit} services={services} submitting={saving} />
          )}
        </CardContent>
      </Paper>
    </Box>
  );
}
