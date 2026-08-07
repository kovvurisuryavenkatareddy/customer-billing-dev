import React, { useState, useEffect } from 'react';
import { formatMMDDYYYY, toISO } from '../utils/dates';
import {
  Dialog, DialogTitle, DialogContent, IconButton, Button, TextField, MenuItem,
  Box, CircularProgress, Alert, Divider, Typography, Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { API_BASE, getAuthHeaders } from '../utils/api';

export default function CustomerEntryModal({ customerId, customerCode, onClose, onUpdated }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields (participant details)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [fIdNumber, setFIdNumber] = useState('');
  const [activeStatus, setActiveStatus] = useState('active');

  useEffect(() => {
    if (customerId) {
      fetchCustomer();
    }
  }, [customerId]);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = getAuthHeaders();
      // Fetch entries without ID in path — use customer_id query param instead
      const res = await fetch(`${API_BASE}/customers/entries/all?customer_id=${customerId}&status=all`, { headers });
      if (!res.ok) throw new Error('Failed to fetch customer');
      const rows = await res.json();
      const flatRows = Array.isArray(rows) ? rows : [];
      // Extract customer fields from first row; map entry rows (non-null entry_id) to entries list
      const firstRow = flatRows[0] || null;
      const cust = firstRow
        ? {
            id: firstRow.id,
            first_name: firstRow.first_name,
            last_name: firstRow.last_name,
            date_of_birth: firstRow.date_of_birth,
            id_number: firstRow.id_number,
            f_id_number: firstRow.f_id_number,
            active_status: firstRow.active_status,
          }
        : null;
      const allEntries = flatRows
        .filter(r => r.entry_id != null)
        .map(r => ({
          id: r.entry_id,
          service_name: r.service_name,
          start_date: r.start_date,
          end_date: r.end_date,
          days: r.days,
          units: r.units,
          rate_per_day: r.rate_per_day,
          amount_billed: r.amount_billed,
          amount_paid: r.amount_paid,
          denial_codes: r.denial_codes,
        }));
      setCustomer({ ...cust, services: allEntries });
      if (!isEditing && cust) {
        const ln = cust.last_name || cust.lastName || '';
        const fn = cust.first_name || cust.firstName || '';
        const dobVal = cust.date_of_birth || cust.dob || cust.dateOfBirth || '';
        setLastName(ln);
        setFirstName(fn);
        setDob(formatMMDDYYYY(dobVal) || '');
        setIdNumber((cust.id_number != null ? String(cust.id_number) : '') || '');
        setFIdNumber((cust.f_id_number != null ? String(cust.f_id_number) : '') || '');
        setActiveStatus(cust.active_status || 'active');
      }
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const beginEdit = () => {
    if (!customer) return;
    const ln = customer.last_name || customer.lastName || '';
    const fn = customer.first_name || customer.firstName || '';
    const dobVal = customer.date_of_birth || customer.dob || customer.dateOfBirth || '';
    setLastName(ln);
    setFirstName(fn);
    setDob(formatMMDDYYYY(dobVal) || '');
    setIdNumber((customer.id_number != null ? String(customer.id_number) : '') || '');
    setFIdNumber((customer.f_id_number != null ? String(customer.f_id_number) : '') || '');
    setActiveStatus(customer.active_status || 'active');
    setIsEditing(true);
  };

  const saveDetails = async () => {
    if (!customer) return;
    try {
      setSaving(true);
      const headers = getAuthHeaders();

      const trimmedLast = (lastName || '').trim();
      const trimmedFirst = (firstName || '').trim();
      if (!trimmedLast || !trimmedFirst) {
        if (window.showToast) window.showToast({ message: 'First name and last name are required', type: 'error' });
        return;
      }

      // DOB: allow blank; validate when provided.
      let dobIsoOrNull = null;
      if ((dob || '').trim() !== '') {
        const iso = toISO(dob);
        if (!iso) {
          if (window.showToast) window.showToast({ message: 'DOB must be in MM/DD/YYYY (or YYYY-MM-DD)', type: 'error' });
          return;
        }
        dobIsoOrNull = iso;
      }

      const res = await fetch(`${API_BASE}/customers/${customerId}`, {
        method: 'PUT',
        headers: { ...headers },
        body: JSON.stringify({
          customer: {
            lastName: trimmedLast,
            firstName: trimmedFirst,
            dateOfBirth: dobIsoOrNull,
            idNumber: (idNumber || '').trim() === '' ? null : String(idNumber).trim(),
            fIdNumber: (fIdNumber || '').trim() === '' ? null : String(fIdNumber).trim(),
            activeStatus: activeStatus || 'active',
          }
        })
      });
      if (!res.ok) throw new Error('Failed to save customer details');

      // Update local view immediately, then refresh list in background.
      setCustomer(prev => ({
        ...(prev || {}),
        last_name: trimmedLast,
        first_name: trimmedFirst,
        date_of_birth: dobIsoOrNull,
        id_number: (idNumber || '').trim() === '' ? null : String(idNumber).trim(),
        f_id_number: (fIdNumber || '').trim() === '' ? null : String(fIdNumber).trim(),
        active_status: activeStatus || 'active',
      }));

      setIsEditing(false);
      if (window.showToast) window.showToast({ message: 'Participant details updated', type: 'success' });
      if (typeof onUpdated === 'function') {
        try { await onUpdated(); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('Failed to save participant details', err);
      if (window.showToast) window.showToast({ message: err.message || 'Failed to update participant', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!customerId) return null;

  const title = customer
    ? `${(customer.last_name || customer.lastName || '').trim()}${(customer.first_name || customer.firstName) ? (', ' + ((customer.first_name || customer.firstName || '').trim())) : ''}`.trim()
    : 'Participant Details';

  return (
    <Dialog open={Boolean(customerId)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f8f9fa' }}>
        <Typography variant="h6" component="span" sx={{ color: '#1a253c' }}>{title}</Typography>
        <IconButton onClick={onClose} aria-label="Close" size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ maxHeight: '65vh' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && customer && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.5 }}>
              <Typography variant="body2" color="text.secondary">Participant Details</Typography>
              {!isEditing ? (
                <Button variant="contained" size="small" onClick={beginEdit}>Edit</Button>
              ) : (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" onClick={() => setIsEditing(false)} disabled={saving}>Cancel</Button>
                  <Button variant="contained" size="small" onClick={saveDetails} loading={saving}>Save</Button>
                </Box>
              )}
            </Box>

            <Divider sx={{ my: 1.5 }} />

            {!isEditing ? (
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                <Box>
                  <strong>Name:</strong>{' '}
                  {(customer.last_name || customer.lastName ? (customer.last_name || customer.lastName) : '') +
                    ((customer.first_name || customer.firstName) ? (', ' + (customer.first_name || customer.firstName)) : '')}
                </Box>
                <Box>
                  <strong>DOB:</strong>{' '}
                  {formatMMDDYYYY(customer.date_of_birth || customer.dob || customer.dateOfBirth || '') || '—'}
                </Box>
                <Box>
                  <strong>ID #:</strong>{' '}
                  {(customer.id_number != null && customer.id_number !== '') ? customer.id_number : '—'}
                </Box>
                <Box>
                  <strong>F ID #:</strong>{' '}
                  {(customer.f_id_number != null && customer.f_id_number !== '') ? customer.f_id_number : '—'}
                </Box>
                <Box>
                  <strong>Status:</strong>{' '}
                  <Chip
                    size="small"
                    label={(customer.active_status || 'active')}
                    sx={{
                      ml: 1, textTransform: 'capitalize', fontWeight: 600,
                      bgcolor: (customer.active_status || 'active') === 'active' ? '#e6ffed' : '#fff3f3',
                      color: (customer.active_status || 'active') === 'active' ? '#167d3b' : '#c92a2a',
                      border: (customer.active_status || 'active') === 'active' ? '1px solid #b8f4c6' : '1px solid #f1c0c0',
                    }}
                  />
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gap: 2 }}>
                <TextField fullWidth label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
                <TextField fullWidth label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                <TextField fullWidth label="DOB" value={dob} onChange={(e) => setDob(e.target.value)} placeholder="MM/DD/YYYY" />
                <TextField fullWidth label="ID #" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="ID #" />
                <TextField fullWidth label="F ID #" value={fIdNumber} onChange={(e) => setFIdNumber(e.target.value)} placeholder="F ID #" />
                <TextField select fullWidth label="Status" value={activeStatus || 'active'} onChange={(e) => setActiveStatus(e.target.value)}>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </TextField>
              </Box>
            )}

            {/* Services: read-only, professional card layout */}
            <Divider sx={{ mt: 2, mb: 1 }} />
            <Typography variant="body2" fontWeight={500} color="#495057" sx={{ mb: 1.5 }}>Services</Typography>
            {Array.isArray(customer.services) && customer.services.length > 0 ? (() => {
              const totalBilled = customer.services.reduce((s, e) => s + (Number(e.amount_billed ?? e.amountBilled ?? 0)), 0);
              const totalPaid = customer.services.reduce((s, e) => s + (Number(e.amount_paid ?? e.amountPaid ?? 0)), 0);
              const totalDue = totalBilled - totalPaid;
              return (
              <>
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 3, mb: 2, px: 2, py: 1.25,
                  background: 'linear-gradient(to right, #f1f5f9, #e2e8f0)', borderRadius: 1.5,
                  border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600,
                }}>
                  <Box component="span" sx={{ color: '#475569' }}>
                    Grand Total: <Box component="span" sx={{ color: '#1e293b' }}>${totalBilled.toFixed(2)}</Box>
                  </Box>
                  <Box component="span" sx={{ color: '#475569', pl: 2, borderLeft: '1px solid #cbd5e1' }}>
                    Total Paid: <Box component="span" sx={{ color: '#1e293b' }}>${totalPaid.toFixed(2)}</Box>
                  </Box>
                  <Box component="span" sx={{ pl: 2, borderLeft: '1px solid #cbd5e1' }}>
                    Total Due: <Box component="span" sx={{ color: totalDue > 0 ? '#dc2626' : '#64748b' }}>${totalDue.toFixed(2)}</Box>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {customer.services.map((s, idx) => {
                    const billed = Number(s.amount_billed ?? s.amountBilled ?? 0);
                    const paid = Number(s.amount_paid ?? s.amountPaid ?? 0);
                    const due = billed - paid;
                    const rate = Number(s.rate_per_day ?? s.ratePerDay ?? 0);
                    const days = s.days != null ? s.days : '—';
                    const units = s.units ?? s.unitsCount;
                    const denialList = Array.isArray(s.denial_codes) ? s.denial_codes : (s.denialCodes || (typeof s.denial_codes === 'string' && s.denial_codes ? s.denial_codes.split(',') : []));
                    return (
                      <Box key={s.id || `svc-${idx}`} sx={{ borderRadius: 1.5, border: '1px solid #e9ecef', bgcolor: '#fafbfc', px: 2, py: 1.5 }}>
                        <Typography sx={{ color: '#1a253c', fontWeight: 600, fontSize: 15, mb: 1 }}>
                          {s.service_name || s.serviceName || '—'}
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 3, rowGap: 0.75, fontSize: 14 }}>
                          <Box sx={{ color: '#6c757d' }}>
                            <Box component="span" sx={{ color: '#495057' }}>Rate/day</Box>{' '}
                            <Box component="span" sx={{ fontWeight: 500 }}>${rate.toFixed(2)}</Box>
                          </Box>
                          <Box sx={{ color: '#6c757d' }}>
                            <Box component="span" sx={{ color: '#495057' }}>Days</Box>{' '}
                            <Box component="span" sx={{ fontWeight: 500 }}>{days}</Box>
                          </Box>
                          {units != null && units !== '' && (
                            <Box sx={{ color: '#6c757d' }}>
                              <Box component="span" sx={{ color: '#495057' }}>Units</Box>{' '}
                              <Box component="span" sx={{ fontWeight: 500 }}>{units}</Box>
                            </Box>
                          )}
                          <Box sx={{ color: '#6c757d' }}>
                            <Box component="span" sx={{ color: '#495057' }}>Billed</Box>{' '}
                            <Box component="span" sx={{ fontWeight: 500 }}>${billed.toFixed(2)}</Box>
                          </Box>
                          <Box sx={{ color: '#6c757d' }}>
                            <Box component="span" sx={{ color: '#495057' }}>Paid</Box>{' '}
                            <Box component="span" sx={{ fontWeight: 500 }}>${paid.toFixed(2)}</Box>
                          </Box>
                          <Box sx={{ color: '#6c757d' }}>
                            <Box component="span" sx={{ color: '#495057' }}>Due</Box>{' '}
                            <Box component="span" sx={{ fontWeight: 500, color: due > 0 ? '#c92a2a' : '#495057' }}>
                              ${due.toFixed(2)}
                            </Box>
                          </Box>
                          <Box sx={{ color: '#6c757d' }}>
                            <Box component="span" sx={{ color: '#495057' }}>Period</Box>{' '}
                            <Box component="span">
                              {(() => {
                                const startStr = formatMMDDYYYY(s.start_date || s.startDate || '') || '';
                                const endStr = formatMMDDYYYY(s.end_date || s.endDate || '') || '';
                                if (!startStr && !endStr) return '—';
                                if (startStr && endStr) return `${startStr} - ${endStr}`;
                                return startStr || endStr;
                              })()}
                            </Box>
                          </Box>
                          {denialList.length > 0 && (
                            <Box sx={{ gridColumn: '1 / -1', color: '#6c757d' }}>
                              <Box component="span" sx={{ color: '#495057' }}>Denial codes</Box>{' '}
                              <Box component="span" sx={{ fontWeight: 500 }}>{denialList.join(', ')}</Box>
                            </Box>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </>
              );
            })() : (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No services for this participant.</Typography>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
