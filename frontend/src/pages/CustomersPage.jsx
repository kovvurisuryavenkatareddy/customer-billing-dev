import React, { useState, useEffect } from 'react';
import {
  TextField, InputAdornment, IconButton, Card as MuiCard, CardHeader, CardContent,
  CircularProgress, Dialog, DialogTitle, DialogContent, Box, Typography, Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import InboxIcon from '@mui/icons-material/Inbox';
import CustomerSearch from '../components/CustomerSearch';
import CustomerList from '../components/CustomerList';
import CustomerForm from '../components/form';
import QuickEntryModal from '../components/QuickEntryModal';
import { API_BASE, getAuthHeaders, handle401Error } from '../utils/api';
import { formatMMDDYYYY } from '../utils/dates';

// Simple in-memory client-side store with optional server calls
// accept optional AbortSignal to cancel in-flight fetches
async function fetchCustomersFromServer(filters, signal) {
  try {
    const params = new URLSearchParams();
    // Send firstName and lastName as separate parameters to backend
    if (filters.name) params.append('name', filters.name);
    if (filters.firstName) params.append('firstName', filters.firstName);
    if (filters.lastName) params.append('lastName', filters.lastName);
    if (filters.startDate) params.append('start_date', filters.startDate);
    if (filters.endDate) params.append('end_date', filters.endDate);
    if (filters.dob || filters.dateOfBirth) params.append('dob', filters.dob || filters.dateOfBirth);
    // Add status filter - default to 'active', but allow 'inactive' or 'all'
    const status = filters.status || 'active';
    params.append('status', status);
    const res = await fetch(`${API_BASE}/customers/entries/all?${params.toString()}`, {
      headers: getAuthHeaders(),
      signal,
    });
    if (res.status === 401) {
      handle401Error();
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();

    // New API returns processed data directly, minimal client-side filtering needed
    return data || [];
  } catch (err) {
    if (err.name === 'AbortError') {
      // fetch was aborted — caller likely triggered a newer request, silently return null
      return null;
    }
    console.warn('fetchCustomersFromServer failed', err);
    return null;
  }
}

export default function CustomersPage({ showAddForm = false, onNavigate }) {
  const [customers, setCustomers] = useState([]);
  const [filters, setFilters] = useState({ status: 'active' }); // Default to active customers
  const [notFound, setNotFound] = useState(false);
  const [services, setServices] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [addingServiceFor, setAddingServiceFor] = useState(null);
  const [showAddCustomer, setShowAddCustomer] = useState(showAddForm);
  const [tableSearchText, setTableSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [savingAddCustomer, setSavingAddCustomer] = useState(false);
  const [savingEditCustomer, setSavingEditCustomer] = useState(false);
  const [savingAddService, setSavingAddService] = useState(false);
  const [savingEditService, setSavingEditService] = useState(false);
  const [openingEditModal, setOpeningEditModal] = useState(false);
  const [addFormKey, setAddFormKey] = useState(0);
  const [editCustomerEntries, setEditCustomerEntries] = useState(null);
  const [loadingEditEntries, setLoadingEditEntries] = useState(false);
  const [quickEntryCustomers, setQuickEntryCustomers] = useState([]);
  const [showQuickEntry, setShowQuickEntry] = useState(false);

  useEffect(() => {
    // fetch services for forms (run once on mount)
    (async () => {
      try {
        const svcRes = await fetch(`${API_BASE}/services/`, {
          headers: getAuthHeaders(),
        });
        if (svcRes.status === 401) {
          handle401Error();
          return;
        }
        if (svcRes.ok) {
          const svcJson = await svcRes.json();
          setServices(svcJson);
        }
      } catch (e) {
        console.warn('Could not load services', e);
      } finally {
        setServicesLoaded(true);
      }
    })();
  }, []);

  // Debounced fetch when filters change. Uses AbortController to cancel previous request.
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const { signal } = controller;

    const timer = setTimeout(async () => {
      setLoading(true);
      const data = await fetchCustomersFromServer(filters || {}, signal);
      if (!mounted) return;
      if (data === null) {
        // server not available or request aborted -> do not overwrite current list
        setLoading(false);
        return;
      }
      if (Array.isArray(data)) {
        setCustomers(data);
        setNotFound(data.length === 0);
      }
      setLoading(false);
    }, 400);

    return () => {
      mounted = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters]);

  // H0038 has no separate `units` column on the server — `days` IS the unit
  // count. This mirrors form.jsx's check so the network payload can be
  // re-verified independently of whatever the form already computed.
  function isUnitsServiceName(name) {
    if (!name || !Array.isArray(services)) return false;
    const match = services.find(x => (x.name === name || x.serviceName === name || x.service_name === name));
    const code = (match?.code || match?.serviceCode || match?.service_code || '').toString().toUpperCase().trim();
    const catalogName = (match?.name || match?.serviceName || match?.service_name || '').toString().toUpperCase();
    if (match) return code.includes('H0038') || catalogName.includes('H0038');
    return String(name).toUpperCase().includes('H0038');
  }

  async function handleSearch(f) {
    // Only update filters here; a debounced effect will perform the fetch.
    // `f` includes status when provided by CustomerSearch
    setFilters({ ...f });
  }

  function handleStatusChange(newStatus) {
    setStatusFilter(newStatus);
    setFilters(prev => ({ ...prev, status: newStatus }));
  }

  function handleSubmit(payload) {
    (async () => {
      setSavingAddCustomer(true);
      if (window.showToast) {
        window.showToast({ key: 'add-customer', type: 'loading', message: 'Adding customer…', duration: 0 });
      }
      try {
        const res = await fetch(`${API_BASE}/customers/`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (res.status === 401) {
          handle401Error();
          return;
        }
        if (!res.ok) throw new Error('failed');
        await res.json();
        await refreshCustomers();
        setNotFound(false);
        if (window.showToast) {
          window.showToast({ key: 'add-customer', message: 'Customer added successfully.', type: 'success', duration: 3000 });
        }
        setAddFormKey((k) => k + 1);
        if (onNavigate) onNavigate('home');
      } catch (err) {
        console.warn('Server not available or POST failed, adding locally', err);
        const svc = payload.services?.[0] || payload.service;
        const id = Date.now();
        const entry = {
          id,
          customer_code: payload.customer.customerCode,
          first_name: payload.customer.firstName,
          last_name: payload.customer.lastName,
          id_number: payload.customer.idNumber || null,
          f_id_number: payload.customer.fIdNumber || null,
          service_name: svc?.serviceName ?? '—',
          start_date: svc?.startDate ?? null,
          end_date: svc?.endDate ?? null,
          days: svc?.days ?? 0,
          rate_per_day: svc?.ratePerDay ?? 0,
          amount_billed: svc?.amountBilled ?? 0,
          amount_paid: svc?.amountPaid ?? 0,
          due: (svc?.amountBilled ?? 0) - (svc?.amountPaid ?? 0),
          active_status: payload.customer.activeStatus || 'active',
        };
        setCustomers(prev => [entry, ...prev]);
        setNotFound(false);
        if (window.showToast) {
          window.showToast({ key: 'add-customer', message: 'Customer added (offline).', type: 'info' });
        }
        setAddFormKey((k) => k + 1);
        if (onNavigate) onNavigate('home');
      } finally {
        setSavingAddCustomer(false);
      }
    })();
  }

  // Refresh customers using current filters (used after edits)
  async function refreshCustomers() {
    const data = await fetchCustomersFromServer(filters || {});
    if (data) setCustomers(data);
  }

  // When user clicks edit in list, receive { customer, service }
  function handleEdit(item) {
    setEditingItem(item);
    setOpeningEditModal(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleEditSubmit(payload) {
    if (!editingItem) return;
    const cust = editingItem.customer;
    
    console.log('=== EDIT SUBMIT ===');
    console.log('editingItem:', editingItem);
    console.log('payload:', payload);
    
    setSavingEditCustomer(true);
    try {
      // Use the updated customer endpoint that handles both customer and service/entry updates
      // This endpoint now handles resubmission logic based on the isResubmission flag
      // Backend expects single "service"; form submits "services" array — send first service when editing.
      // Include the entry id from the selected table row so the backend updates the correct entry (not just the latest).
      const selectedEntryId =
        editingItem?.service?.id ??
        editingItem?.service?.entryId ??
        editingItem?.service?.entry_id ??
        null;
      
      console.log('selectedEntryId:', selectedEntryId);
      console.log('payload.services:', payload.services);
      console.log('payload.service:', payload.service);
      
      // Get the service data from payload (either from services array or service object)
      const serviceData = payload.services?.[0] ?? payload.service;
      
      // Create service payload, ensuring the entry ID is included if editing
      const servicePayload = {
        ...serviceData,
        // Always include the entry ID if we're editing an existing entry
        ...(selectedEntryId ? { id: selectedEntryId, entryId: selectedEntryId, entry_id: selectedEntryId } : {}),
      };
      
      console.log('Final servicePayload being sent:', servicePayload);
      
      const custRes = await fetch(`${API_BASE}/customers/${cust.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          customer: payload.customer,
          service: servicePayload,
          isResubmission: payload.isResubmission || false
        }),
      });
      
      if (custRes.status === 401) {
        handle401Error();
        return;
      }
      
      if (!custRes.ok) {
        throw new Error(`Server error: ${custRes.status}`);
      }
      
      const result = await custRes.json();

      // Show success message
      if (window.showToast) {
        const message = payload.isResubmission 
          ? 'Resubmission created successfully!' 
          : 'Customer updated successfully!';
        window.showToast({ message, type: 'success' });
      }

      // refresh list and clear editing state
      await refreshCustomers();
      setEditingItem(null);
    } catch (err) {
      console.error('Failed to update customer/service', err);
      if (window.showToast) {
        window.showToast({ 
          message: 'Failed to update customer: ' + (err.message || 'Unknown error'), 
          type: 'error' 
        });
      }
    } finally {
      setSavingEditCustomer(false);
    }
  }

  async function handleEditCustomerSubmit(payload) {
    const cust = editingItem?.customer;
    if (!cust?.id) return;
    setSavingEditCustomer(true);

    // OPTIMISTIC: close modal immediately
    setEditingItem(null);
    setEditCustomerEntries(null);

    try {
      if (window.showToast) {
        window.showToast({ key: 'edit-customer', type: 'loading', message: 'Saving changes…', duration: 0 });
      }

      const servicesList = (payload.services || []).map((s) => ({
        id: s.id != null && Number(s.id) < 1e12 ? Number(s.id) : null, // temp ids (Date.now()) are new rows
        serviceName: s.serviceName,
        days: Number(s.days) || 0,
        // H0038 (units-based): units drives amountBilled and is stored on
        // its own column, independent of days.
        units: isUnitsServiceName(s.serviceName) ? (Number(s.units) || 0) : undefined,
        ratePerDay: s.ratePerDay,
        amountBilled: s.amountBilled ?? 0,
        amountPaid: s.amountPaid === '' ? 0 : Number(s.amountPaid),
        dateOfPayment: s.dateOfPayment || null,
        startDate: s.startDate || null,
        endDate: s.endDate || null,
        dateSubmitted: s.dateSubmitted || null,
        denialCodes: s.denialCodes && s.denialCodes.length ? s.denialCodes : null,
      }));

      // Single call: updates the customer, upserts every service line, and
      // deletes any explicitly-removed ones — all in one backend transaction.
      const res = await fetch(`${API_BASE}/customers/${cust.id}/services`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          customer: payload.customer,
          services: servicesList,
          removedServiceIds: (payload.removedServiceIds || []).map(Number),
        }),
      });
      if (res.status === 401) {
        handle401Error();
        return;
      }
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);

      if (window.showToast) {
        window.showToast({ key: 'edit-customer', message: 'Customer updated successfully.', type: 'success', duration: 3000 });
      }
      // Refresh in background
      refreshCustomers();
    } catch (err) {
      console.error('Failed to update customer/service', err);
      if (window.showToast) {
        window.showToast({ key: 'edit-customer', message: 'Failed to save: ' + (err.message || 'Unknown error'), type: 'error', duration: 4500 });
      }
      // Refresh to restore correct state on error
      refreshCustomers();
    } finally {
      setSavingEditCustomer(false);
    }
  }

  // Function to refresh customer data
  async function fetchCustomers() {
    try {
      const data = await fetchCustomersFromServer(filters);
      if (data) {
        setCustomers(data);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
      setNotFound(true);
    }
  }

  // inline update handler for CustomerList
  async function handleUpdate(customerId, serviceId, body) {
    const toastKey = `update-service-${serviceId}`;
    window.showToast?.({ key: toastKey, type: 'loading', message: 'Updating service…', duration: 0 });
    try {
      const res = await fetch(`${API_BASE}/customers/${customerId}/services/${serviceId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        handle401Error();
        return;
      }
      if (!res.ok) throw new Error(`Update failed: ${res.status}`);
      window.showToast?.({ key: toastKey, type: 'success', message: 'Service updated successfully.', duration: 3000 });
      await refreshCustomers();
    } catch (err) {
      console.error('Failed to update service inline', err);
      window.showToast?.({ key: toastKey, type: 'error', message: err.message || 'Failed to update service.', duration: 4000 });
    }
  }

  // Inline change of customer status (active/inactive) from the table
  async function handleChangeStatus(customerId, newStatus) {
    const label = newStatus === 'active' ? 'activated' : 'deactivated';
    const toastKey = `status-${customerId}`;
    window.showToast?.({ key: toastKey, type: 'loading', message: 'Updating status…', duration: 0 });
    try {
      const res = await fetch(`${API_BASE}/customers/${customerId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ customer: { active_status: newStatus } }),
      });
      if (res.status === 401) {
        handle401Error();
        return;
      }
      if (!res.ok) {
        throw new Error(`Status update failed: ${res.status}`);
      }
      window.showToast?.({ key: toastKey, type: 'success', message: `Participant ${label} successfully.`, duration: 3000 });
      await refreshCustomers();
    } catch (err) {
      console.error('Failed to update customer status', err);
      window.showToast?.({ key: toastKey, type: 'error', message: err.message || 'Failed to update status.', duration: 4000 });
    }
  }

  function handleAddService(customer) {
    setAddingServiceFor(customer);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleAddServiceSubmit(payload) {
    if (!addingServiceFor) return;
    setSavingAddService(true);
    const toastKey = `add-service-${addingServiceFor.id}`;
    
    // OPTIMISTIC UPDATE: Immediately add to UI
    const tempId = `temp-${Date.now()}`;
    const optimisticEntry = {
      id: addingServiceFor.id,
      customer_id: addingServiceFor.id,
      entry_id: tempId,
      first_name: addingServiceFor.first_name,
      last_name: addingServiceFor.last_name,
      date_of_birth: addingServiceFor.date_of_birth,
      active_status: addingServiceFor.active_status,
      id_number: addingServiceFor.id_number,
      f_id_number: addingServiceFor.f_id_number,
      service_name: payload.service.serviceName,
      start_date: payload.service.startDate,
      end_date: payload.service.endDate,
      days: payload.service.days,
      rate_per_day: payload.service.ratePerDay,
      amount_billed: payload.service.amountBilled,
      amount_paid: payload.service.amountPaid || 0,
      date_of_payment: payload.service.dateOfPayment,
      date_submitted: payload.service.dateSubmitted,
      denial_codes: payload.service.denialCodes || [],
      is_resubmission: false,
      batch_id: null,
      created_at: new Date().toISOString(),
      _optimistic: true, // Flag to identify optimistic entries
    };
    
    // Add optimistic entry to customers list immediately
    setCustomers(prev => [optimisticEntry, ...prev]);
    
    // Close modal immediately for instant feedback
    setAddingServiceFor(null);
    
    try {
      const custId = addingServiceFor.id;
      console.log('=== ADDING SERVICE ===');
      console.log('Customer ID:', custId);
      console.log('Payload:', JSON.stringify(payload, null, 2));

      window.showToast?.({ key: toastKey, type: 'loading', message: 'Saving service…', duration: 0 });
      
      const res = await fetch(`${API_BASE}/customers/${custId}/services`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      
      console.log('Response status:', res.status);
      
      if (res.status === 401) {
        handle401Error();
        // Rollback optimistic update
        setCustomers(prev => prev.filter(c => c.entry_id !== tempId));
        return;
      }
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Error response:', errorText);
        // Rollback optimistic update
        setCustomers(prev => prev.filter(c => c.entry_id !== tempId));
        throw new Error(`Failed to add service: ${res.status} - ${errorText}`);
      }
      
      const result = await res.json();
      console.log('Service added successfully:', result);
      
      // Replace optimistic entry with real data from server
      setCustomers(prev => prev.map(c => 
        c.entry_id === tempId 
          ? { ...optimisticEntry, entry_id: result.entry_id || result.id, _optimistic: false }
          : c
      ));

      window.showToast?.({ key: toastKey, type: 'success', message: `Service "${payload.service.serviceName || 'Service'}" added successfully.`, duration: 3000 });
    } catch (err) {
      console.error('Failed to add service', err);
      window.showToast?.({
        key: toastKey,
        type: 'error',
        message: `Failed to add service: ${err.message || 'Unknown error'}`,
        duration: 4500,
      });
    } finally {
      setSavingAddService(false);
    }
  }

  function handleCancelAddService() {
    setAddingServiceFor(null);
  }

  function handleCancelEdit() {
    setEditingItem(null);
    setEditCustomerEntries(null);
    setOpeningEditModal(false);
  }

  // Clear opening-edit loading when edit-customer entries have loaded
  useEffect(() => {
    if (!editingItem) {
      setOpeningEditModal(false);
      return;
    }
    if (!loadingEditEntries) setOpeningEditModal(false);
  }, [editingItem, loadingEditEntries]);

  // Fetch all entries for customer when opening Edit (no ID in path — use query param)
  useEffect(() => {
    if (!editingItem?.customer?.id) {
      setEditCustomerEntries(null);
      return;
    }
    const id = editingItem.customer.id;
    let mounted = true;
    setLoadingEditEntries(true);
    setEditCustomerEntries(null);
    fetch(`${API_BASE}/customers/entries/all?customer_id=${id}&status=all`, { headers: getAuthHeaders() })
      .then((res) => {
        if (res.status === 401) {
          handle401Error();
          return null;
        }
        if (!res.ok) throw new Error('Failed to fetch entries');
        return res.json();
      })
      .then((rows) => {
        if (!mounted) return;
        const flat = Array.isArray(rows) ? rows : [];
        const entries = flat
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
            date_of_payment: r.date_of_payment,
            date_submitted: r.date_submitted,
            denial_codes: r.denial_codes,
          }));
        setEditCustomerEntries(entries);
      })
      .catch(() => {
        if (mounted) setEditCustomerEntries([]);
      })
      .finally(() => {
        if (mounted) setLoadingEditEntries(false);
      });
    return () => { mounted = false; };
  }, [editingItem?.customer?.id]);

  // Map API entries to form initial.services shape (use keys the form's useEffect expects)
  function mapEntriesToForm(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.map((e) => ({
      id: e.id,
      serviceName: e.service_name || e.serviceName || '',
      service_name: e.service_name || e.serviceName || '',
      serviceType: e.service_name || e.serviceName || '',
      days: e.days,
      numberOfDays: e.days != null ? String(e.days) : '',
      units: e.units ?? '',
      ratePerDay: e.rate_per_day ?? e.ratePerDay ?? 0,
      rate_per_day: e.rate_per_day ?? e.ratePerDay ?? 0,
      startDate: e.start_date || '',
      start_date: e.start_date || '',
      endDate: e.end_date || '',
      end_date: e.end_date || '',
      amountBilled: e.amount_billed ?? e.amountBilled ?? 0,
      amount_billed: e.amount_billed ?? e.amountBilled ?? 0,
      amountPaid: e.amount_paid ?? e.amountPaid ?? '',
      amount_paid: e.amount_paid ?? e.amountPaid ?? '',
      dateOfPayment: e.date_of_payment ? formatMMDDYYYY(e.date_of_payment) : '',
      dateSubmitted: e.date_submitted ? formatMMDDYYYY(e.date_submitted) : '',
      denialCodes: Array.isArray(e.denial_codes) ? e.denial_codes : [],
      denial_codes: Array.isArray(e.denial_codes) ? e.denial_codes : [],
    }));
  }

  if (!servicesLoaded) {
    return (
      <Box sx={{ width: '100%', maxWidth: '100%', mx: 'auto', p: { xs: 3, md: 4 }, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const editTitle = editingItem ? (() => {
    const c = editingItem?.customer || {};
    const first = c.first_name || c.firstName || '';
    const last = c.last_name || c.lastName || '';
    return last && first ? `Edit service for ${last}, ${first}` : `Edit service for ${first || last || 'Customer'}`;
  })() : '';

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', mx: 'auto', p: { xs: 2, md: 4 }, boxSizing: 'border-box', overflowX: 'hidden' }}>
      {!showAddCustomer && <CustomerSearch onSearch={handleSearch} status={statusFilter} onStatusChange={handleStatusChange} />}

      <Box>
        {!showAddCustomer && (
          <MuiCard variant="outlined" sx={{ mb: 3, overflowX: 'hidden' }}>
            <CardHeader
              title={
                <Typography variant="h6" fontWeight={600}>
                  {statusFilter === 'active' ? 'Active' : statusFilter === 'inactive' ? 'Inactive' : 'All'} Participant Records
                </Typography>
              }
              action={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    disabled={quickEntryCustomers.length === 0}
                    onClick={() => setShowQuickEntry(true)}
                  >
                    Quick Entry{quickEntryCustomers.length ? ` (${quickEntryCustomers.length})` : ''}
                  </Button>
                  <TextField
                    size="small"
                    placeholder="Search by name, ID, or service"
                    value={tableSearchText}
                    onChange={(e) => setTableSearchText(e.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                        endAdornment: tableSearchText ? (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setTableSearchText('')}><ClearIcon fontSize="small" /></IconButton>
                          </InputAdornment>
                        ) : null,
                      },
                    }}
                  />
                </Box>
              }
            />
            <CardContent sx={{ pt: 0 }}>
              {notFound && customers.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                  <InboxIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    No customers found matching your search criteria.
                  </Typography>
                  <Button variant="contained" onClick={() => onNavigate?.('add-customer')}>Add Customer</Button>
                </Box>
              ) : (
                <Box sx={{ position: 'relative', minHeight: 200 }}>
                  {loading && (
                    <Box sx={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: 'rgba(255,255,255,0.8)', zIndex: 10, borderRadius: 1,
                    }}>
                      <CircularProgress size={32} />
                    </Box>
                  )}
                  <CustomerList
                    customers={customers}
                    onEdit={handleEdit}
                    onUpdate={handleUpdate}
                    onAddService={handleAddService}
                    onChangeStatus={handleChangeStatus}
                    onSelectionChange={(selectedCustomers) => {
                      setQuickEntryCustomers(Array.isArray(selectedCustomers) ? selectedCustomers : []);
                    }}
                    onCustomerUpdated={(action, key) => {
                      if (action === 'optimistic-delete' && key) {
                        // Immediately remove the row from UI
                        setCustomers(prev => prev.filter(c => String(c.id) !== key));
                      } else {
                        refreshCustomers();
                      }
                    }}
                    searchText={tableSearchText}
                  />
                </Box>
              )}
            </CardContent>
          </MuiCard>
        )}

        <Dialog
          open={showQuickEntry}
          onClose={() => setShowQuickEntry(false)}
          maxWidth="md"
          fullWidth
          keepMounted={false}
        >
          <DialogTitle>
            Quick Entry{quickEntryCustomers.length ? ` — ${quickEntryCustomers.length} customer(s)` : ''}
          </DialogTitle>
          <DialogContent dividers sx={{ maxHeight: '72vh', bgcolor: '#f8fafc' }}>
            <QuickEntryModal
              selectedCustomers={quickEntryCustomers}
              servicesCatalog={services}
              onClose={() => setShowQuickEntry(false)}
            />
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!editingItem}
          onClose={savingEditService || savingEditCustomer || openingEditModal ? undefined : handleCancelEdit}
          maxWidth="sm"
          fullWidth
          keepMounted={false}
        >
          <DialogTitle>
            {editingItem?.customer
              ? `Edit Customer — ${editingItem.customer.first_name ?? ''} ${editingItem.customer.last_name ?? ''}`.trim()
              : editTitle}
          </DialogTitle>
          <DialogContent dividers sx={{ maxHeight: '65vh', p: 0, bgcolor: '#f8fafc' }}>
            {editingItem?.customer ? (
              // Edit Customer: one customer record, all services; Add Service adds rows in modal
              <Box sx={{ position: 'relative' }}>
                {(openingEditModal || loadingEditEntries || savingEditCustomer) && (
                  <Box sx={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 1, bgcolor: 'rgba(255,255,255,0.85)', zIndex: 5,
                  }}>
                    <CircularProgress size={28} />
                    <Typography variant="body2" color="text.secondary">
                      {openingEditModal || loadingEditEntries ? 'Loading…' : 'Saving…'}
                    </Typography>
                  </Box>
                )}
                {!loadingEditEntries && (
                  <CustomerForm
                    submitting={savingEditCustomer}
                    services={services}
                    onSubmit={handleEditCustomerSubmit}
                    onCancel={handleCancelEdit}
                    initial={{
                      customer: editingItem.customer,
                      services: mapEntriesToForm(editCustomerEntries || []),
                    }}
                    allowMultipleServicesInEdit={true}
                    useCollapsibleServices={true}
                  />
                )}
              </Box>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!addingServiceFor}
          onClose={savingAddService ? undefined : handleCancelAddService}
          maxWidth="sm"
          fullWidth
          keepMounted={false}
        >
          <DialogTitle>
            {addingServiceFor ? `Add services for ${addingServiceFor.first_name} ${addingServiceFor.last_name}` : ''}
          </DialogTitle>
          <DialogContent dividers sx={{ maxHeight: '70vh', p: 0, bgcolor: '#f8fafc' }}>
            {addingServiceFor && (
            <Box sx={{ position: 'relative' }}>
              {savingAddService && (
                <Box sx={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 1, bgcolor: 'rgba(255,255,255,0.85)', zIndex: 5,
                }}>
                  <CircularProgress size={28} />
                  <Typography variant="body2" color="text.secondary">Saving services...</Typography>
                </Box>
              )}
            <CustomerForm
              submitting={savingAddService}
              services={services}
              onSubmit={async (payload) => {
                const servicesToAdd = payload.services || [];
                if (servicesToAdd.length === 0) {
                  window.showToast?.({ type: 'error', message: 'Add at least one service.', duration: 3500 });
                  return;
                }
                try {
                  setSavingAddService(true);
                  const toastKey = `add-batch-${addingServiceFor.id}`;
                  window.showToast?.({ key: toastKey, type: 'loading', message: `Adding ${servicesToAdd.length} service(s)…`, duration: 0 });
                  const res = await fetch(`${API_BASE}/customers/${addingServiceFor.id}/batches`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ services: servicesToAdd }),
                  });
                  if (res.status === 401) {
                    handle401Error();
                    return;
                  }
                  if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    throw new Error(errText || `Failed: ${res.status}`);
                  }
                  await refreshCustomers();
                  setAddingServiceFor(null);
                  window.showToast?.({
                    key: toastKey,
                    type: 'success',
                    message: `${servicesToAdd.length} service(s) added successfully.`,
                    duration: 3000,
                  });
                } catch (err) {
                  window.showToast?.({
                    key: `add-batch-${addingServiceFor.id}`,
                    type: 'error',
                    message: 'Failed to add services: ' + (err.message || 'Unknown error'),
                    duration: 4500,
                  });
                } finally {
                  setSavingAddService(false);
                }
              }}
              onCancel={handleCancelAddService}
              initial={{
                customer: addingServiceFor,
                services: [],
              }}
              hideCustomerFields={true}
            />
            </Box>
            )}
          </DialogContent>
        </Dialog>

        {showAddCustomer && (
          <MuiCard variant="outlined" sx={{ mt: 2, overflowX: 'auto' }}>
            <CardHeader title={<Typography variant="h5" fontWeight={700} color="#1a253c">Add New Customer</Typography>} />
            <CardContent sx={{ pt: 0 }}>
              <CustomerForm key={addFormKey} submitting={savingAddCustomer} onSubmit={handleSubmit} services={services} />
            </CardContent>
          </MuiCard>
        )}
      </Box>
    </Box>
  );
}
