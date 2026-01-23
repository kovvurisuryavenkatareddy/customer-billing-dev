import React, { useState, useEffect } from 'react';
import '../styles/customers.css';
import { API_BASE, getAuthHeaders } from '../utils/api';

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingService, setEditingService] = useState(null);

  const [deletePendingId, setDeletePendingId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [ratePerDay, setRatePerDay] = useState('');
  const [defaultDays, setDefaultDays] = useState('');

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

  const handleAddService = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/services/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name,
          rate_per_day: Number(ratePerDay),
          default_days: Number(defaultDays),
        }),
      });
      if (!response.ok) throw new Error('Failed to add service');
      await fetchServices();
      resetForm();
      setShowAddForm(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEditService = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/services/${editingService.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name,
          rate_per_day: Number(ratePerDay),
          default_days: Number(defaultDays),
        }),
      });
      if (!response.ok) throw new Error('Failed to update service');
      await fetchServices();
      resetForm();
      setEditingService(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteService = async (id) => {
    // open our custom confirmation modal
    setDeletePendingId(id);
  };

  const performDeleteService = async () => {
    if (!deletePendingId) return;
    setDeleting(true);
    try {
      const response = await fetch(`${API_BASE}/services/${deletePendingId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (response && (response.status === 204 || response.ok)) {
        window.showToast && window.showToast({ message: 'Service deleted', type: 'info' });
        await fetchServices();
      } else {
        let msg = 'Failed to delete service';
        try {
          const body = await response.json();
          msg = body.detail || body.message || msg;
        } catch (e) {}
        setError(msg);
        window.showToast && window.showToast({ message: msg, type: 'error' });
      }
    } catch (err) {
      setError(err.message || 'Failed to delete service');
      window.showToast && window.showToast({ message: err.message || 'Failed to delete service', type: 'error' });
    } finally {
      setDeletePendingId(null);
      setDeleting(false);
    }
  };

  const startEdit = (service) => {
    setEditingService(service);
    setName(service.name);
    setRatePerDay(service.rate_per_day);
    setDefaultDays(service.default_days);
    setShowAddForm(false);
  };

  const resetForm = () => {
    setName('');
    setRatePerDay('');
    setDefaultDays('');
    setEditingService(null);
  };

  const cancelEdit = () => {
    resetForm();
    setShowAddForm(false);
  };

  if (loading) return <div className="customers-container">Loading services...</div>;

  return (
    <div className="customers-container">
      <h1>Service Management</h1>

      {error && <div className="error-message">{error}</div>}

      {/* Services List */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>Available Services</h2>
          <button onClick={() => { setShowAddForm(true); resetForm(); }}>Add New Service</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Service Name</th>
              <th>Rate per Day</th>
              <th>Default Days</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map(service => (
              <tr key={service.id}>
                <td>{service.name}</td>
                <td>${service.rate_per_day}</td>
                <td>{service.default_days}</td>
                <td>
                  <div className="action-buttons">
                    <button className="edit-btn" onClick={() => startEdit(service)}>Edit</button>
                    <button 
                      className="edit-btn" 
                      style={{ 
                        background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                        boxShadow: '0 2px 8px rgba(220, 53, 69, 0.3)'
                      }} 
                      onClick={() => handleDeleteService(service.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Service Form */}
      {(showAddForm || editingService) && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && cancelEdit()}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editingService ? 'Edit Service' : 'Add New Service'}</h3>
              <button className="modal-close" onClick={cancelEdit}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={editingService ? handleEditService : handleAddService}>
                <div className="form-row">
                  <label>Service Name</label>
                  <input 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    required 
                  />
                </div>

                <div className="form-row">
                  <label>Rate per Day ($)</label>
                  <input 
                    type="number" 
                    min="0" 
                    step="0.01"
                    value={ratePerDay} 
                    onChange={(e) => setRatePerDay(e.target.value)} 
                    required 
                  />
                </div>

                <div className="form-row">
                  <label>Default Days</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={defaultDays} 
                    onChange={(e) => setDefaultDays(e.target.value)} 
                    required 
                  />
                </div>

                <div className="actions">
                  <button type="submit">{editingService ? 'Update Service' : 'Add Service'}</button>
                  <button type="button" className="secondary" onClick={cancelEdit}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

        {/* Delete confirmation modal */}
        {deletePendingId && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDeletePendingId(null)}>
            <div className="modal">
              <div className="modal-header">
                <h3>Confirm Delete</h3>
                <button className="modal-close" onClick={() => setDeletePendingId(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete this service?</p>
                <div className="actions">
                  <button onClick={performDeleteService} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
                  <button type="button" className="secondary" onClick={() => setDeletePendingId(null)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
