import React, { useState, useEffect } from 'react';
import CustomerForm from '../components/form';
import { API_BASE, getAuthHeaders } from '../utils/api';

export default function AddCustomerPage({ onNavigate }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

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
    try {
      const res = await fetch(`${API_BASE}/customers/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create');
      if (window.showToast) window.showToast({ message: 'Customer created', type: 'success' });
      if (onNavigate) onNavigate('home');
    } catch (err) {
      console.error('Add customer failed', err);
      if (window.showToast) window.showToast({ message: 'Could not create customer', type: 'error' });
    }
  }

  return (
    <div className="card">
      <h2>Add Customer</h2>
      {loading ? <p>Loading services...</p> : <CustomerForm onSubmit={handleSubmit} services={services} />}
    </div>
  );
}
