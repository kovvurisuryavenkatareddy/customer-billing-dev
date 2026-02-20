import React, { useState, useEffect } from 'react';
import { Input, Card, Spin, Modal, Empty, Button } from 'antd';
import CustomerSearch from '../components/CustomerSearch';
import CustomerList from '../components/CustomerList';
import CustomerForm from '../components/form';
import ServiceForm from '../components/ServiceForm';
import { API_BASE, getAuthHeaders, handle401Error } from '../utils/api';
import { formatMMDDYYYY, toISO } from '../utils/dates';

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
  const [batchEntries, setBatchEntries] = useState(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
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
          window.showToast({ key: 'add-customer', message: 'Customer added successfully.', type: 'success' });
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
      await refreshCustomers();
    } catch (err) {
      console.error('Failed to update service inline', err);
    }
  }

  // Inline change of customer status (active/inactive) from the table
  async function handleChangeStatus(customerId, newStatus) {
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
        console.error('Failed to update customer status', await res.text());
      }
      await refreshCustomers();
    } catch (err) {
      console.error('Failed to update customer status', err);
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
    try {
      const custId = addingServiceFor.id;
      console.log('=== ADDING SERVICE ===');
      console.log('Customer ID:', custId);
      console.log('Payload:', JSON.stringify(payload, null, 2));

      window.showToast?.({ key: toastKey, type: 'loading', message: 'Adding service…', duration: 0 });
      
      const res = await fetch(`${API_BASE}/customers/${custId}/services`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      
      console.log('Response status:', res.status);
      
      if (res.status === 401) {
        handle401Error();
        return;
      }
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to add service: ${res.status} - ${errorText}`);
      }
      
      const result = await res.json();
      console.log('Service added successfully:', result);
      
      await refreshCustomers();
      setAddingServiceFor(null);

      window.showToast?.({ key: toastKey, type: 'success', message: 'Service added successfully.', duration: 3000 });
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
    setBatchEntries(null);
    setOpeningEditModal(false);
  }

  // Clear opening-edit loading when batch has loaded or after brief delay for non-batch edit
  useEffect(() => {
    if (!editingItem) {
      setOpeningEditModal(false);
      return;
    }
    if (editingItem.batchId) {
      if (!loadingBatch) setOpeningEditModal(false);
      return;
    }
    const t = setTimeout(() => setOpeningEditModal(false), 200);
    return () => clearTimeout(t);
  }, [editingItem, loadingBatch]);

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
    <div className="w-full max-w-full mx-auto p-4 md:p-8 box-border overflow-x-hidden">
      {!showAddCustomer && <CustomerSearch onSearch={handleSearch} status={statusFilter} onStatusChange={handleStatusChange} />}

      <div>
        {!showAddCustomer && (
          <Card
            className="mb-6 overflow-x-hidden"
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
                  onCustomerUpdated={refreshCustomers}
                  searchText={tableSearchText}
                />
              </div>
            )}
          </Card>
        )}

        <Modal
          open={!!editingItem}
          title={
            editingItem?.batchId
              ? `Edit (${batchEntries?.length ?? 0} services) — ${editingItem?.customer?.first_name ?? ''} ${editingItem?.customer?.last_name ?? ''}`.trim()
              : editingItem?.service?.id
                ? `Edit service for ${editingItem?.customer?.first_name} ${editingItem?.customer?.last_name}`
                : editTitle
          }
          onCancel={handleCancelEdit}
          footer={null}
          width={editingItem?.batchId ? 800 : 640}
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
                    const servicesPayload = (payload.services || []).map((s, i) => ({
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
                    try {
                      setSavingEditCustomer(true);
                      window.showToast?.({ key: 'edit-batch', type: 'loading', message: 'Updating batch…', duration: 0 });
                      const res = await fetch(
                        `${API_BASE}/customers/${cust.id}/batches/${editingItem.batchId}`,
                        {
                          method: 'PUT',
                          headers: getAuthHeaders(),
                          body: JSON.stringify({ services: servicesPayload }),
                        }
                      );
                      if (res.status === 401) {
                        handle401Error();
                        return;
                      }
                      if (!res.ok) throw new Error(await res.text().catch(() => 'Update failed'));
                      await refreshCustomers();
                      setEditingItem(null);
                      setBatchEntries(null);
                      window.showToast?.({ key: 'edit-batch', type: 'success', message: 'Batch updated.', duration: 3000 });
                    } catch (err) {
                      window.showToast?.({
                        key: 'edit-batch',
                        type: 'error',
                        message: err.message || 'Failed to update batch',
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
                />
              )}
              {!loadingBatch && batchEntries && batchEntries.length === 0 && (
                <div className="p-4 text-gray-500">No entries in this batch.</div>
              )}
            </Spin>
          ) : editingItem && editingItem.service?.id && !editingItem.batchId ? (
            <Spin spinning={openingEditModal || savingEditService} tip={openingEditModal ? 'Loading…' : 'Saving service...'}>
              <ServiceForm
                submitting={savingEditService}
                services={services}
                onSubmit={async (payload) => {
                  const entryId = editingItem?.service?.id ?? editingItem?.service?.entryId ?? editingItem?.service?.entry_id;
                  if (!entryId) {
                    window.showToast?.({ type: 'error', message: 'Entry ID not found.', duration: 4500 });
                    return;
                  }
                  try {
                    setSavingEditService(true);
                    window.showToast?.({ key: 'edit-svc', type: 'loading', message: 'Updating service…', duration: 0 });
                    const res = await fetch(`${API_BASE}/customers/${editingItem.customer.id}/services/${entryId}`, {
                      method: 'PUT',
                      headers: getAuthHeaders(),
                      body: JSON.stringify(payload),
                    });
                    if (res.status === 401) {
                      handle401Error();
                      return;
                    }
                    if (!res.ok) throw new Error(await res.text().catch(() => 'Update failed'));
                    await refreshCustomers();
                    setEditingItem(null);
                    window.showToast?.({ key: 'edit-svc', type: 'success', message: 'Service updated.', duration: 3000 });
                  } catch (err) {
                    window.showToast?.({ key: 'edit-svc', type: 'error', message: err.message || 'Update failed', duration: 4500 });
                  } finally {
                    setSavingEditService(false);
                  }
                }}
                onCancel={handleCancelEdit}
                initial={editingItem.service}
              />
            </Spin>
          ) : editingItem && !editingItem.batchId && editingItem.customer ? (
            // Customer with no entries: show empty Add Service form (first batch)
            <Spin spinning={openingEditModal || savingEditCustomer} tip={openingEditModal ? 'Loading…' : 'Saving…'}>
            <CustomerForm
              submitting={savingEditCustomer}
              services={services}
              onSubmit={async (payload) => {
                const servicesToAdd = payload.services || [];
                if (servicesToAdd.length === 0) {
                  window.showToast?.({ type: 'error', message: 'Add at least one service.', duration: 3500 });
                  return;
                }
                const cust = editingItem.customer;
                try {
                  setSavingEditCustomer(true);
                  window.showToast?.({ key: 'add-first-batch', type: 'loading', message: 'Adding services…', duration: 0 });
                  const res = await fetch(`${API_BASE}/customers/${cust.id}/batches`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ services: servicesToAdd }),
                  });
                  if (res.status === 401) {
                    handle401Error();
                    return;
                  }
                  if (!res.ok) throw new Error(await res.text().catch(() => 'Failed'));
                  await refreshCustomers();
                  setEditingItem(null);
                  setBatchEntries(null);
                  window.showToast?.({ key: 'add-first-batch', type: 'success', message: `Added ${servicesToAdd.length} service(s).`, duration: 3500 });
                } catch (err) {
                  window.showToast?.({ key: 'add-first-batch', type: 'error', message: err.message || 'Failed to add services', duration: 4500 });
                } finally {
                  setSavingEditCustomer(false);
                }
              }}
              onCancel={handleCancelEdit}
              initial={{ customer: editingItem.customer, services: [] }}
              hideCustomerFields={true}
            />
            </Spin>
          ) : editingItem ? (
            <Spin spinning={openingEditModal || savingEditCustomer} tip={openingEditModal ? 'Loading…' : 'Saving…'}>
            <CustomerForm
              submitting={savingEditCustomer}
              onSubmit={handleEditSubmit}
              onCancel={handleCancelEdit}
              services={services}
              initial={editingItem}
            />
            </Spin>
          ) : null}
        </Modal>

        <Modal
          open={!!addingServiceFor}
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
                  window.showToast?.({ key: toastKey, type: 'loading', message: 'Adding batch…', duration: 0 });
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
                    message: `Added ${servicesToAdd.length} service(s) as new batch.`,
                    duration: 3500,
                  });
                } catch (err) {
                  window.showToast?.({
                    key: `add-batch-${addingServiceFor.id}`,
                    type: 'error',
                    message: err.message || 'Failed to add services',
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
          )}
        </Modal>

        {showAddCustomer && (
          <Card title={<span className="text-xl font-bold text-[#1a253c]">Add New Customer</span>} className="mt-4 overflow-x-auto">
            <CustomerForm key={addFormKey} submitting={savingAddCustomer} onSubmit={handleSubmit} services={services} />
          </Card>
        )}
      </div>
    </div>
  );
}
