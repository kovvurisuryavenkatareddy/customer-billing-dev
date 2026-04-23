import React, { useState, useEffect } from 'react';
import { Input, Card, Spin, Modal, Empty, Button } from 'antd';
import CustomerSearch from '../components/CustomerSearch';
import CustomerList from '../components/CustomerList';
import CustomerForm from '../components/form';
<<<<<<< HEAD
import QuickEntryModal from '../components/QuickEntryModal';
import { API_BASE, getAuthHeaders, handle401Error } from '../utils/api';
import { formatMMDDYYYY, toISO } from '../utils/dates';
=======
import ServiceForm from '../components/ServiceForm';
import { API_BASE, getAuthHeaders, handle401Error } from '../utils/api';
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400

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
    if (filters.dob) params.append('dob', filters.dob);
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
<<<<<<< HEAD
  const [batchEntries, setBatchEntries] = useState(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
  const [addingServiceFor, setAddingServiceFor] = useState(null);
  const [showAddCustomer, setShowAddCustomer] = useState(showAddForm);
  const [tableSearchText, setTableSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [servicesLoaded, setServicesLoaded] = useState(false);
<<<<<<< HEAD
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
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400

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
<<<<<<< HEAD
    (async () => {
      setSavingAddCustomer(true);
      if (window.showToast) {
        window.showToast({ key: 'add-customer', type: 'loading', message: 'Adding customer…', duration: 0 });
      }
=======
    // Try to send to server, otherwise store locally (append id)
    (async () => {
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
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
<<<<<<< HEAD
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
=======
        const created = await res.json();
        // Refresh the entire list to get the latest data
        await refreshCustomers();
        setNotFound(false);
        
        // Show success toast
        if (window.showToast) {
          window.showToast({ message: 'Customer added successfully!', type: 'success' });
        }
        
        // Navigate to home page
        if (onNavigate) {
          onNavigate('home');
        }
      } catch (err) {
        console.warn('Server not available or POST failed, adding locally', err);
        // local fallback: synthesize an entry
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
        const id = Date.now();
        const entry = {
          id,
          customer_code: payload.customer.customerCode,
          first_name: payload.customer.firstName,
          last_name: payload.customer.lastName,
          id_number: payload.customer.idNumber || null,
          f_id_number: payload.customer.fIdNumber || null,
<<<<<<< HEAD
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
=======
          service_name: payload.service.serviceName,
          start_date: payload.service.startDate,
          end_date: payload.service.endDate,
          days: payload.service.days,
          rate_per_day: payload.service.ratePerDay,
          amount_billed: payload.service.amountBilled,
          amount_paid: payload.service.amountPaid || 0,
          due: (payload.service.amountBilled || 0) - (payload.service.amountPaid || 0),
          active_status: payload.customer.activeStatus || 'active'
        };
        setCustomers(prev => [entry, ...prev]);
        setNotFound(false);
        
        // Show success toast (offline/local fallback)
        if (window.showToast) {
          window.showToast({ message: 'Customer added (offline)', type: 'info' });
        }
        
        // Navigate to home page
        if (onNavigate) {
          onNavigate('home');
        }
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      }
    })();
  }

  // Refresh customers using current filters (used after edits)
  async function refreshCustomers() {
    const data = await fetchCustomersFromServer(filters || {});
    if (data) setCustomers(data);
  }

<<<<<<< HEAD
  // Remove a saved service entry via API — called from the Remove button inside the edit form
  async function handleRemoveService(entryId, onSuccess) {
    const customerId = editingItem?.customer?.id;
    if (!customerId || !entryId) {
      window.showToast?.({ type: 'error', message: 'Cannot remove: missing entry ID.' });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/customers/${customerId}/services/${entryId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.status === 401) { handle401Error(); return; }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Delete failed: ${res.status} - ${errText}`);
      }
      window.showToast?.({ type: 'success', message: 'Service removed successfully.', duration: 3000 });
      // Update local editCustomerEntries so the form reflects the removal
      setEditCustomerEntries(prev => (prev || []).filter(e => e.id !== entryId));
      if (typeof onSuccess === 'function') onSuccess();
    } catch (err) {
      console.error('Failed to remove service', err);
      window.showToast?.({ type: 'error', message: 'Failed to remove service: ' + (err.message || 'Unknown error'), duration: 4000 });
    }
  }

  // When user clicks edit in list, receive { customer, service }
  function handleEdit(item) {
    setEditingItem(item);
    setOpeningEditModal(true);
=======
  // When user clicks edit in list, receive { customer, service }
  function handleEdit(item) {
    setEditingItem(item);
    // scroll to top or focus form could be added here
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleEditSubmit(payload) {
    if (!editingItem) return;
    const cust = editingItem.customer;
    
<<<<<<< HEAD
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
      
=======
    try {
      // Use the updated customer endpoint that handles both customer and service/entry updates
      // This endpoint now handles resubmission logic based on the isResubmission flag
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      const custRes = await fetch(`${API_BASE}/customers/${cust.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          customer: payload.customer,
<<<<<<< HEAD
          service: servicePayload,
=======
          service: payload.service,
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
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
<<<<<<< HEAD
    } finally {
      setSavingEditCustomer(false);
    }
  }

  async function handleEditCustomerSubmit(payload) {
    const cust = editingItem?.customer;
    if (!cust?.id) return;
    setSavingEditCustomer(true);
    const existingEntryIds = new Set((editCustomerEntries || []).map((e) => Number(e.id)).filter(Boolean));
    
    // OPTIMISTIC: close modal immediately
    setEditingItem(null);
    setEditCustomerEntries(null);
    
    try {
      if (window.showToast) {
        window.showToast({ key: 'edit-customer', type: 'loading', message: 'Saving changes…', duration: 0 });
      }
      const custRes = await fetch(`${API_BASE}/customers/${cust.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ customer: payload.customer }),
      });
      if (custRes.status === 401) {
        handle401Error();
        return;
      }
      if (!custRes.ok) throw new Error(`Customer update failed: ${custRes.status}`);
      const servicesList = payload.services || [];
      for (const s of servicesList) {
        const serviceBody = {
          serviceName: s.serviceName,
          days: Number(s.days) || 0,
          ratePerDay: s.ratePerDay,
          amountBilled: s.amountBilled ?? 0,
          amountPaid: s.amountPaid === '' ? 0 : Number(s.amountPaid),
          dateOfPayment: s.dateOfPayment || null,
          startDate: s.startDate || null,
          endDate: s.endDate || null,
          dateSubmitted: s.dateSubmitted || null,
          denialCodes: s.denialCodes && s.denialCodes.length ? s.denialCodes : null,
        };
        const entryId = s.id != null ? Number(s.id) : null;
        const isExisting = entryId && existingEntryIds.has(entryId);
        if (isExisting) {
          const res = await fetch(`${API_BASE}/customers/${cust.id}/services/${entryId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ service: serviceBody }),
          });
          if (res.status === 401) { handle401Error(); return; }
          if (!res.ok) throw new Error(`Service update failed: ${res.status}`);
        } else {
          const res = await fetch(`${API_BASE}/customers/${cust.id}/services`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ service: serviceBody }),
          });
          if (res.status === 401) { handle401Error(); return; }
          if (!res.ok) throw new Error(`Add service failed: ${res.status}`);
        }
      }
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
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
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
<<<<<<< HEAD
    const toastKey = `update-service-${serviceId}`;
    window.showToast?.({ key: toastKey, type: 'loading', message: 'Updating service…', duration: 0 });
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
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
<<<<<<< HEAD
      if (!res.ok) throw new Error(`Update failed: ${res.status}`);
      window.showToast?.({ key: toastKey, type: 'success', message: 'Service updated successfully.', duration: 3000 });
      await refreshCustomers();
    } catch (err) {
      console.error('Failed to update service inline', err);
      window.showToast?.({ key: toastKey, type: 'error', message: err.message || 'Failed to update service.', duration: 4000 });
=======
      await refreshCustomers();
    } catch (err) {
      console.error('Failed to update service inline', err);
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
    }
  }

  // Inline change of customer status (active/inactive) from the table
  async function handleChangeStatus(customerId, newStatus) {
<<<<<<< HEAD
    const label = newStatus === 'active' ? 'activated' : 'deactivated';
    const toastKey = `status-${customerId}`;
    window.showToast?.({ key: toastKey, type: 'loading', message: 'Updating status…', duration: 0 });
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
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
<<<<<<< HEAD
        throw new Error(`Status update failed: ${res.status}`);
      }
      window.showToast?.({ key: toastKey, type: 'success', message: `Participant ${label} successfully.`, duration: 3000 });
      await refreshCustomers();
    } catch (err) {
      console.error('Failed to update customer status', err);
      window.showToast?.({ key: toastKey, type: 'error', message: err.message || 'Failed to update status.', duration: 4000 });
=======
        console.error('Failed to update customer status', await res.text());
      }
      await refreshCustomers();
    } catch (err) {
      console.error('Failed to update customer status', err);
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
    }
  }

  function handleAddService(customer) {
    setAddingServiceFor(customer);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleAddServiceSubmit(payload) {
    if (!addingServiceFor) return;
<<<<<<< HEAD
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
      
=======
    try {
      const custId = addingServiceFor.id;
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      const res = await fetch(`${API_BASE}/customers/${custId}/services`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
<<<<<<< HEAD
      
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
=======
      if (res.status === 401) {
        handle401Error();
        return;
      }
      if (!res.ok) throw new Error('failed to add service');
      await refreshCustomers();
      setAddingServiceFor(null);
    } catch (err) {
      console.error('Failed to add service', err);
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
    }
  }

  function handleCancelAddService() {
    setAddingServiceFor(null);
  }

  function handleCancelEdit() {
    setEditingItem(null);
<<<<<<< HEAD
    setBatchEntries(null);
    setEditCustomerEntries(null);
    setOpeningEditModal(false);
  }

  // Clear opening-edit loading when batch has loaded or when edit-customer entries have loaded
  useEffect(() => {
    if (!editingItem) {
      setOpeningEditModal(false);
      return;
    }
    if (editingItem.batchId) {
      if (!loadingBatch) setOpeningEditModal(false);
      return;
    }
    if (!loadingEditEntries) setOpeningEditModal(false);
  }, [editingItem, loadingBatch, loadingEditEntries]);

  // Fetch batch entries when editing a batch (Edit flow: only this batch's services)
  useEffect(() => {
    if (!editingItem?.batchId || !editingItem?.customer?.id) {
      setBatchEntries(null);
      return;
    }
    let mounted = true;
    setLoadingBatch(true);
    setBatchEntries(null);
    fetch(`${API_BASE}/customers/${editingItem.customer.id}/batches/${editingItem.batchId}/entries`, {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (res.status === 401) {
          handle401Error();
          return null;
        }
        if (!res.ok) throw new Error('Failed to fetch batch');
        return res.json();
      })
      .then((data) => {
        if (mounted && data?.entries) setBatchEntries(data.entries);
      })
      .catch(() => {
        if (mounted) setBatchEntries([]);
      })
      .finally(() => {
        if (mounted) setLoadingBatch(false);
      });
    return () => { mounted = false; };
  }, [editingItem?.batchId, editingItem?.customer?.id]);

  // Fetch all entries for customer when opening Edit (non-batch): one customer record, all services in modal
  useEffect(() => {
    if (!editingItem?.customer?.id || editingItem?.batchId) {
      setEditCustomerEntries(null);
      return;
    }
    let mounted = true;
    setLoadingEditEntries(true);
    setEditCustomerEntries(null);
    fetch(`${API_BASE}/customers/${editingItem.customer.id}/entries`, { headers: getAuthHeaders() })
      .then((res) => {
        if (res.status === 401) {
          handle401Error();
          return null;
        }
        if (!res.ok) throw new Error('Failed to fetch entries');
        return res.json();
      })
      .then((data) => {
        if (mounted && data?.entries) setEditCustomerEntries(data.entries);
        else if (mounted) setEditCustomerEntries([]);
      })
      .catch(() => {
        if (mounted) setEditCustomerEntries([]);
      })
      .finally(() => {
        if (mounted) setLoadingEditEntries(false);
      });
    return () => { mounted = false; };
  }, [editingItem?.customer?.id, editingItem?.batchId]);

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
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
  }

  if (!servicesLoaded) {
    return (
      <div className="w-full max-w-full mx-auto p-6 md:p-8 min-h-[300px] flex items-center justify-center">
        <Spin size="large" tip="Loading services..." />
      </div>
    );
  }

  const editTitle = editingItem ? (() => {
    const c = editingItem?.customer || {};
    const first = c.first_name || c.firstName || '';
    const last = c.last_name || c.lastName || '';
    return last && first ? `Edit service for ${last}, ${first}` : `Edit service for ${first || last || 'Customer'}`;
  })() : '';

  return (
<<<<<<< HEAD
    <div className="w-full max-w-full mx-auto p-4 md:p-8 box-border overflow-x-hidden">
=======
    <div className="w-full max-w-full mx-auto p-4 md:p-8 box-border overflow-x-auto">
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      {!showAddCustomer && <CustomerSearch onSearch={handleSearch} status={statusFilter} onStatusChange={handleStatusChange} />}

      <div>
        {!showAddCustomer && (
          <Card
<<<<<<< HEAD
            className="mb-6 overflow-x-hidden"
            title={<span className="text-lg font-semibold">{statusFilter === 'active' ? 'Active' : statusFilter === 'inactive' ? 'Inactive' : 'All'} Participant Records</span>}
            extra={
              <div className="flex items-center gap-2">
                <Button
                  type="default"
                  disabled={quickEntryCustomers.length === 0}
                  onClick={() => setShowQuickEntry(true)}
                >
                  Quick Entry{quickEntryCustomers.length ? ` (${quickEntryCustomers.length})` : ''}
                </Button>
                <Input.Search
                  placeholder="Search by name, ID, or service"
                  allowClear
                  enterButton
                  size="middle"
                  value={tableSearchText}
                  onSearch={setTableSearchText}
                  onChange={(e) => setTableSearchText(e.target.value)}
                />
              </div>
=======
            className="mb-6 overflow-x-auto"
            title={<span className="text-lg font-semibold">{statusFilter === 'active' ? 'Active' : statusFilter === 'inactive' ? 'Inactive' : 'All'} Participant Records</span>}
            extra={
              <Input.Search
                placeholder="Search by name, ID, or service"
                allowClear
                enterButton
                size="middle"
                value={tableSearchText}
                onSearch={setTableSearchText}
                onChange={(e) => setTableSearchText(e.target.value)}
              />
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
            }
          >
            {notFound && customers.length === 0 ? (
              <Empty
                description="No customers found matching your search criteria."
                className="py-10"
              >
                <Button type="primary" onClick={() => onNavigate?.('add-customer')}>Add Customer</Button>
              </Empty>
            ) : (
              <div className="relative min-h-[200px]">
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 rounded">
                    <Spin tip="Loading customers..." />
                  </div>
                )}
                <CustomerList
                  customers={customers}
                  onEdit={handleEdit}
                  onUpdate={handleUpdate}
                  onAddService={handleAddService}
                  onChangeStatus={handleChangeStatus}
<<<<<<< HEAD
                  onSelectionChange={(selectedCustomers) => {
                    setQuickEntryCustomers(Array.isArray(selectedCustomers) ? selectedCustomers : []);
                  }}
                  onCustomerUpdated={(action, key) => {
                    if (action === 'optimistic-delete' && key) {
                      // Immediately remove the row from UI
                      setCustomers(prev => prev.filter(c => {
                        const rowKey = c.batch_id || (c.entry_id != null ? `legacy-${c.entry_id}` : `single-${c.id}-${c.entry_id}`);
                        return rowKey !== key;
                      }));
                    } else {
                      refreshCustomers();
                    }
                  }}
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
                  searchText={tableSearchText}
                />
              </div>
            )}
          </Card>
        )}

        <Modal
<<<<<<< HEAD
          open={showQuickEntry}
          title={`Quick Entry${quickEntryCustomers.length ? ` — ${quickEntryCustomers.length} customer(s)` : ''}`}
          onCancel={() => setShowQuickEntry(false)}
          footer={null}
          width={980}
          centered
          destroyOnClose
          styles={{ body: { maxHeight: '72vh', overflowY: 'auto', padding: 16, background: '#f8fafc' } }}
        >
          <QuickEntryModal
            selectedCustomers={quickEntryCustomers}
            servicesCatalog={services}
            onClose={() => setShowQuickEntry(false)}
          />
        </Modal>

        <Modal
          open={!!editingItem}
          title={
            editingItem?.batchId
              ? `Edit (${batchEntries?.length ?? 0} services) — ${editingItem?.customer?.first_name ?? ''} ${editingItem?.customer?.last_name ?? ''}`.trim()
              : editingItem?.customer
                ? `Edit Customer — ${editingItem.customer.first_name ?? ''} ${editingItem.customer.last_name ?? ''}`.trim()
                : editTitle
          }
          onCancel={handleCancelEdit}
          footer={null}
          width={800}
          centered
          destroyOnClose
          maskClosable={!savingEditService && !savingEditCustomer && !loadingBatch && !openingEditModal}
          closable={!savingEditService && !savingEditCustomer && !loadingBatch && !openingEditModal}
          styles={{ body: { maxHeight: '65vh', overflowY: 'auto', padding: 0, background: '#f8fafc' } }}
        >
          {editingItem?.batchId ? (
            // Edit batch: fetch entries by batch_id, show only those services
            <Spin
              spinning={openingEditModal || loadingBatch || savingEditCustomer}
              tip={openingEditModal && !loadingBatch ? 'Loading…' : loadingBatch ? 'Loading batch…' : 'Saving…'}
            >
              {!loadingBatch && batchEntries && (
                <CustomerForm
                  submitting={savingEditCustomer}
                  services={services}
                  onSubmit={async (payload) => {
                    const cust = editingItem.customer;
                    const entryIds = batchEntries.map((e) => e.id);
                    const allServices = payload.services || [];
                    const batchServicesPayload = allServices.slice(0, entryIds.length).map((s, i) => ({
                      id: entryIds[i],
                      serviceName: s.serviceName || s.serviceType,
                      days: Number(s.days) || 0,
                      ratePerDay: s.ratePerDay,
                      amountBilled: s.amountBilled ?? 0,
                      amountPaid: s.amountPaid === '' ? 0 : Number(s.amountPaid),
                      dateOfPayment: s.dateOfPayment ? toISO(s.dateOfPayment) : null,
                      startDate: s.startDate ? toISO(s.startDate) : null,
                      endDate: s.endDate ? toISO(s.endDate) : null,
                      dateSubmitted: s.dateSubmitted ? toISO(s.dateSubmitted) : null,
                      denialCodes: s.denialCodes && s.denialCodes.length ? s.denialCodes : null,
                    }));
                    const newServices = allServices.slice(entryIds.length);
                    try {
                      setSavingEditCustomer(true);
                      // OPTIMISTIC: close modal immediately, sync in background
                      setEditingItem(null);
                      setBatchEntries(null);
                      window.showToast?.({ key: 'edit-batch', type: 'loading', message: 'Saving services…', duration: 0 });
                      if (batchServicesPayload.length > 0) {
                        const res = await fetch(
                          `${API_BASE}/customers/${cust.id}/batches/${editingItem.batchId}`,
                          {
                            method: 'PUT',
                            headers: getAuthHeaders(),
                            body: JSON.stringify({ services: batchServicesPayload }),
                          }
                        );
                        if (res.status === 401) {
                          handle401Error();
                          return;
                        }
                        if (!res.ok) throw new Error(await res.text().catch(() => 'Update failed'));
                      }
                      for (const s of newServices) {
                        const serviceBody = {
                          serviceName: s.serviceName || s.serviceType,
                          days: Number(s.days) || 0,
                          ratePerDay: s.ratePerDay,
                          amountBilled: s.amountBilled ?? 0,
                          amountPaid: s.amountPaid === '' ? 0 : Number(s.amountPaid),
                          dateOfPayment: s.dateOfPayment ? toISO(s.dateOfPayment) : null,
                          startDate: s.startDate ? toISO(s.startDate) : null,
                          endDate: s.endDate ? toISO(s.endDate) : null,
                          dateSubmitted: s.dateSubmitted ? toISO(s.dateSubmitted) : null,
                          denialCodes: s.denialCodes && s.denialCodes.length ? s.denialCodes : null,
                          batchId: editingItem.batchId,
                        };
                        const addRes = await fetch(`${API_BASE}/customers/${cust.id}/services`, {
                          method: 'POST',
                          headers: getAuthHeaders(),
                          body: JSON.stringify({ service: serviceBody }),
                        });
                        if (addRes.status === 401) {
                          handle401Error();
                          return;
                        }
                        if (!addRes.ok) throw new Error(await addRes.text().catch(() => 'Add service failed'));
                      }
                      // Refresh in background after save
                      refreshCustomers();
                      window.showToast?.({ key: 'edit-batch', type: 'success', message: 'Services updated successfully.', duration: 3000 });
                    } catch (err) {
                      window.showToast?.({
                        key: 'edit-batch',
                        type: 'error',
                        message: 'Failed to save services: ' + (err.message || 'Unknown error'),
                        duration: 4500,
                      });
                    } finally {
                      setSavingEditCustomer(false);
                    }
                  }}
                  onCancel={handleCancelEdit}
                  initial={{
                    customer: editingItem.customer,
                    services: mapEntriesToForm(batchEntries),
                  }}
                  hideCustomerFields={true}
                  useCollapsibleServices={true}
                  onRemoveService={handleRemoveService}
                />
              )}
              {!loadingBatch && batchEntries && batchEntries.length === 0 && (
                <div className="p-4 text-gray-500">No entries in this batch.</div>
              )}
            </Spin>
          ) : editingItem && !editingItem.batchId && editingItem.customer ? (
            // Edit Customer: one customer record, all services; Add Service adds rows in modal
            <Spin
              spinning={openingEditModal || loadingEditEntries || savingEditCustomer}
              tip={openingEditModal || loadingEditEntries ? 'Loading…' : 'Saving…'}
            >
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
                  onRemoveService={handleRemoveService}
                />
              )}
            </Spin>
          ) : null}
=======
          open={!!editingItem}
          title={editTitle}
          onCancel={handleCancelEdit}
          footer={null}
          width={640}
          destroyOnClose
          styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}
        >
          {editingItem && <CustomerForm onSubmit={handleEditSubmit} onCancel={handleCancelEdit} services={services} initial={editingItem} />}
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
        </Modal>

        <Modal
          open={!!addingServiceFor}
<<<<<<< HEAD
          title={addingServiceFor ? `Add services for ${addingServiceFor.first_name} ${addingServiceFor.last_name}` : ''}
          onCancel={handleCancelAddService}
          footer={null}
          width={800}
          centered
          destroyOnClose
          maskClosable={!savingAddService}
          closable={!savingAddService}
          styles={{ body: { maxHeight: '70vh', overflowY: 'auto', padding: 0, background: '#f8fafc' } }}
        >
          {addingServiceFor && (
            <Spin spinning={savingAddService} tip="Saving services...">
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
            </Spin>
=======
          title={addingServiceFor ? `Add service for ${addingServiceFor.first_name} ${addingServiceFor.last_name}` : ''}
          onCancel={handleCancelAddService}
          footer={null}
          width={640}
          destroyOnClose
          styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}
        >
          {addingServiceFor && (
            <ServiceForm services={services} onSubmit={handleAddServiceSubmit} onCancel={handleCancelAddService} />
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
          )}
        </Modal>

        {showAddCustomer && (
          <Card title={<span className="text-xl font-bold text-[#1a253c]">Add New Customer</span>} className="mt-4 overflow-x-auto">
<<<<<<< HEAD
            <CustomerForm key={addFormKey} submitting={savingAddCustomer} onSubmit={handleSubmit} services={services} />
=======
            <CustomerForm onSubmit={handleSubmit} services={services} />
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
          </Card>
        )}
      </div>
    </div>
  );
}
