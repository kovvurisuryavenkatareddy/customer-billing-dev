/**
 * Service Management: Table, Dialog, delete confirmation.
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Paper, CardHeader, CardContent, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, CircularProgress, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import { API_BASE, getAuthHeaders } from '../utils/api';

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [deletePendingId, setDeletePendingId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [formValues, setFormValues] = useState({ name: '', rate_per_day: '', default_days: '' });

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/services/`, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error('Failed to fetch services');
      const data = await response.json();
      setServices(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (editingService) await handleEditService(formValues);
    else await handleAddService(formValues);
  };

  const handleAddService = async (values) => {
    try {
      window.showToast?.({ key: 'services-save', type: 'loading', message: 'Adding service…', duration: 0 });
      const response = await fetch(`${API_BASE}/services/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: values.name,
          rate_per_day: Number(values.rate_per_day),
          default_days: Number(values.default_days),
        }),
      });
      if (!response.ok) throw new Error('Failed to add service');
      await fetchServices();
      setFormValues({ name: '', rate_per_day: '', default_days: '' });
      setShowAddForm(false);
      window.showToast?.({ key: 'services-save', message: 'Service added', type: 'success' });
    } catch (err) {
      setError(err.message);
      window.showToast?.({ key: 'services-save', message: err.message || 'Failed to add service', type: 'error' });
    }
  };

  const handleEditService = async (values) => {
    if (!editingService) return;
    try {
      window.showToast?.({ key: 'services-save', type: 'loading', message: 'Updating service…', duration: 0 });
      const response = await fetch(`${API_BASE}/services/${editingService.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: values.name,
          rate_per_day: Number(values.rate_per_day),
          default_days: Number(values.default_days),
        }),
      });
      if (!response.ok) throw new Error('Failed to update service');
      await fetchServices();
      setFormValues({ name: '', rate_per_day: '', default_days: '' });
      setEditingService(null);
      window.showToast?.({ key: 'services-save', message: 'Service updated', type: 'success' });
    } catch (err) {
      setError(err.message);
      window.showToast?.({ key: 'services-save', message: err.message || 'Failed to update service', type: 'error' });
    }
  };

  const performDeleteService = async () => {
    if (!deletePendingId) return;
    setDeleting(true);
    try {
      window.showToast?.({ key: `services-delete-${deletePendingId}`, type: 'loading', message: 'Deleting service…', duration: 0 });
      const response = await fetch(`${API_BASE}/services/${deletePendingId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (response?.status === 204 || response?.ok) {
        window.showToast?.({ key: `services-delete-${deletePendingId}`, message: 'Service deleted', type: 'success' });
        await fetchServices();
      } else {
        let msg = 'Failed to delete service';
        try {
          const body = await response.json();
          msg = body.detail || body.message || msg;
        } catch (e) {}
        setError(msg);
        window.showToast?.({ key: `services-delete-${deletePendingId}`, message: msg, type: 'error' });
      }
    } catch (err) {
      setError(err.message || 'Failed to delete service');
      window.showToast?.({ key: `services-delete-${deletePendingId}`, message: err.message || 'Failed to delete service', type: 'error' });
    } finally {
      setDeletePendingId(null);
      setDeleting(false);
    }
  };

  const startEdit = (service) => {
    setEditingService(service);
    setFormValues({
      name: service.name || '',
      rate_per_day: service.rate_per_day ?? '',
      default_days: service.default_days ?? '',
    });
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    setFormValues({ name: '', rate_per_day: '', default_days: '' });
    setShowAddForm(false);
    setEditingService(null);
  };

  if (loading) {
    return (
      <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 3 } }}>
        <Paper variant="outlined">
          <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 3 } }}>
      <Paper variant="outlined">
        <CardHeader
          title={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SettingsIcon sx={{ color: '#007bff' }} />
              <Typography variant="h6" fontWeight={600}>Service Management</Typography>
            </Box>
          }
          action={
            <Button
              variant="contained" startIcon={<AddIcon />}
              onClick={() => { setShowAddForm(true); setFormValues({ name: '', rate_per_day: '', default_days: '' }); setEditingService(null); }}
            >
              Add Service
            </Button>
          }
        />
        <CardContent sx={{ pt: 0 }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Manage service types, rates per day, and default days. These are used when adding or editing customers.
          </Typography>

          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>
          )}

          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow>
                  <TableCell>Service Name</TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>Rate per Day</TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>Default Days</TableCell>
                  <TableCell sx={{ width: 160 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {services.map((record) => (
                  <TableRow key={record.id} hover>
                    <TableCell sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {record.name}
                    </TableCell>
                    <TableCell align="right">
                      {record.rate_per_day != null ? `$${Number(record.rate_per_day).toFixed(2)}` : '–'}
                    </TableCell>
                    <TableCell align="right">{record.default_days != null ? record.default_days : '–'}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => startEdit(record)}>
                          Edit
                        </Button>
                        <Button size="small" color="error" startIcon={<DeleteIcon fontSize="small" />} onClick={() => setDeletePendingId(record.id)}>
                          Delete
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {services.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                      No services yet. Add one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Paper>

      {/* Add / Edit dialog */}
      <Dialog open={showAddForm || !!editingService} onClose={cancelEdit} maxWidth="xs" fullWidth>
        <DialogTitle>{editingService ? 'Edit Service' : 'Add New Service'}</DialogTitle>
        <Box component="form" onSubmit={handleFormSubmit}>
          <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              required fullWidth label="Service Name" placeholder="e.g. Respite Care"
              value={formValues.name}
              onChange={(e) => setFormValues((v) => ({ ...v, name: e.target.value }))}
            />
            <TextField
              required fullWidth type="number" label="Rate per Day ($)" placeholder="0.00"
              value={formValues.rate_per_day}
              onChange={(e) => setFormValues((v) => ({ ...v, rate_per_day: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            />
            <TextField
              required fullWidth type="number" label="Default Days" placeholder="1"
              value={formValues.default_days}
              onChange={(e) => setFormValues((v) => ({ ...v, default_days: e.target.value }))}
              slotProps={{ htmlInput: { min: 1 } }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={cancelEdit}>Cancel</Button>
            <Button type="submit" variant="contained">{editingService ? 'Update' : 'Add Service'}</Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deletePendingId} onClose={() => setDeletePendingId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete this service?</DialogTitle>
        <DialogContent dividers>
          <Typography color="text.secondary">This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletePendingId(null)} disabled={deleting}>Cancel</Button>
          <Button color="error" variant="contained" onClick={performDeleteService} loading={deleting}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
