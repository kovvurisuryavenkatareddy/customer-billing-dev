import React, { useState, useEffect } from 'react';
import { formatMMDDYYYY } from '../utils/dates';
import { API_BASE, getAuthHeaders } from '../utils/api';

export default function CustomerEntryModal({ customerId, customerCode, onClose }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingStatus, setEditingStatus] = useState(false);
  const [saving, setSaving] = useState(false);

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
      const res = await fetch(`${API_BASE}/customers/${customerId}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch customer');
      const data = await res.json();
      setCustomer(data);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const saveStatus = async (newStatus) => {
    if (!customer) return;
    try {
      setSaving(true);
      const headers = getAuthHeaders();
      const res = await fetch(`${API_BASE}/customers/${customerId}`, {
        method: 'PUT',
        headers: { ...headers },
        body: JSON.stringify({ customer: { active_status: newStatus } })
      });
      if (!res.ok) throw new Error('Failed to save status');
      setCustomer(prev => ({ ...prev, active_status: newStatus }));
      setEditingStatus(false);
      if (window.showToast) window.showToast({ message: 'Status updated', type: 'success' });
    } catch (err) {
      console.error('Failed to save status', err);
      if (window.showToast) window.showToast({ message: 'Failed to update status', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!customerId) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-[1000]" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[600px] max-h-[80vh] overflow-auto bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#e9ecef] bg-gradient-to-br from-[#f8f9fa] to-[#e9ecef]">
          <h3 className="m-0 text-xl text-[#1a253c]">
            {customer ? `${(customer.last_name || customer.lastName || '').trim()}${(customer.first_name || customer.firstName) ? (', ' + ((customer.first_name || customer.firstName || '').trim())) : ''}`.trim() : 'Participant Details'}
          </h3>
          <button type="button" className="bg-transparent border-0 text-2xl cursor-pointer text-gray-500 p-0 w-8 h-8 flex items-center justify-center hover:text-gray-800 focus:outline-none" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="p-5 max-h-[65vh] overflow-y-auto overflow-x-hidden">
          {loading && <div style={{ textAlign: 'center', padding: '20px' }}>Loading...</div>}

          {error && (
            <div style={{ color: '#dc3545', background: '#f8d7da', border: '1px solid #f5c6cb', padding: '10px', borderRadius: '4px', marginBottom: '20px' }}>
              Error: {error}
            </div>
          )}

          {!loading && !error && customer && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <strong>Name:</strong> {(customer.last_name || customer.lastName ? (customer.last_name || customer.lastName) : '') + ((customer.first_name || customer.firstName) ? (', ' + (customer.first_name || customer.firstName)) : '')}
              </div>
              <div>
                <strong>DOB:</strong> {formatMMDDYYYY(customer.date_of_birth || customer.dob || customer.dateOfBirth || '') || '—'}
              </div>
              <div>
                <strong>ID #:</strong> {(customer.id_number != null && customer.id_number !== '') ? customer.id_number : '—'}
              </div>
              <div>
                <strong>F ID #:</strong> {(customer.f_id_number != null && customer.f_id_number !== '') ? customer.f_id_number : '—'}
              </div>
              <div>
                <strong>Status:</strong>
                {!editingStatus ? (
                  <span style={{ marginLeft: 8 }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '6px 10px',
                      borderRadius: '999px',
                      background: (customer.active_status || 'active') === 'active' ? '#e6ffed' : '#fff3f3',
                      color: (customer.active_status || 'active') === 'active' ? '#167d3b' : '#c92a2a',
                      border: (customer.active_status || 'active') === 'active' ? '1px solid #b8f4c6' : '1px solid #f1c0c0',
                      fontWeight: 600,
                      textTransform: 'capitalize'
                    }}>{(customer.active_status || 'active')}</span>
                    <button onClick={() => setEditingStatus(true)} style={{ marginLeft: 12, padding: '6px 10px' }}>Change</button>
                  </span>
                ) : (
                  <span style={{ marginLeft: 8 }}>
                    <select disabled={saving} value={customer.active_status || 'active'} onChange={(e) => saveStatus(e.target.value)}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <button onClick={() => setEditingStatus(false)} style={{ marginLeft: 8 }} disabled={saving}>Cancel</button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}