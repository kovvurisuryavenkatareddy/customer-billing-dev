import React, { useState, useEffect } from 'react';
import { Input, Card, Spin, Modal, Empty, Button } from 'antd';
import CustomerSearch from '../components/CustomerSearch';
import CustomerList from '../components/CustomerList';
import CustomerForm from '../components/form';
import ServiceForm from '../components/ServiceForm';
import { API_BASE, getAuthHeaders, handle401Error } from '../utils/api';

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
  const [addingServiceFor, setAddingServiceFor] = useState(null);
  const [showAddCustomer, setShowAddCustomer] = useState(showAddForm);
  const [tableSearchText, setTableSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [servicesLoaded, setServicesLoaded] = useState(false);

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
    // Try to send to server, otherwise store locally (append id)
    (async () => {
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
        const id = Date.now();
        const entry = {
          id,
          customer_code: payload.customer.customerCode,
          first_name: payload.customer.firstName,
          last_name: payload.customer.lastName,
          id_number: payload.customer.idNumber || null,
          f_id_number: payload.customer.fIdNumber || null,
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
    // scroll to top or focus form could be added here
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleEditSubmit(payload) {
    if (!editingItem) return;
    const cust = editingItem.customer;
    
    try {
      // Use the updated customer endpoint that handles both customer and service/entry updates
      // This endpoint now handles resubmission logic based on the isResubmission flag
      const custRes = await fetch(`${API_BASE}/customers/${cust.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          customer: payload.customer,
          service: payload.service,
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
    try {
      const custId = addingServiceFor.id;
      const res = await fetch(`${API_BASE}/customers/${custId}/services`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        handle401Error();
        return;
      }
      if (!res.ok) throw new Error('failed to add service');
      await refreshCustomers();
      setAddingServiceFor(null);
    } catch (err) {
      console.error('Failed to add service', err);
    }
  }

  function handleCancelAddService() {
    setAddingServiceFor(null);
  }

  function handleCancelEdit() {
    setEditingItem(null);
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
    <div className="w-full max-w-full mx-auto p-4 md:p-8 box-border overflow-x-auto">
      {!showAddCustomer && <CustomerSearch onSearch={handleSearch} status={statusFilter} onStatusChange={handleStatusChange} />}

      <div>
        {!showAddCustomer && (
          <Card
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
                  searchText={tableSearchText}
                />
              </div>
            )}
          </Card>
        )}

        <Modal
          open={!!editingItem}
          title={editTitle}
          onCancel={handleCancelEdit}
          footer={null}
          width={640}
          destroyOnClose
          styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}
        >
          {editingItem && <CustomerForm onSubmit={handleEditSubmit} onCancel={handleCancelEdit} services={services} initial={editingItem} />}
        </Modal>

        <Modal
          open={!!addingServiceFor}
          title={addingServiceFor ? `Add service for ${addingServiceFor.first_name} ${addingServiceFor.last_name}` : ''}
          onCancel={handleCancelAddService}
          footer={null}
          width={640}
          destroyOnClose
          styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}
        >
          {addingServiceFor && (
            <ServiceForm services={services} onSubmit={handleAddServiceSubmit} onCancel={handleCancelAddService} />
          )}
        </Modal>

        {showAddCustomer && (
          <Card title={<span className="text-xl font-bold text-[#1a253c]">Add New Customer</span>} className="mt-4 overflow-x-auto">
            <CustomerForm onSubmit={handleSubmit} services={services} />
          </Card>
        )}
      </div>
    </div>
  );
}
