import React, { useState, useEffect } from 'react';
import { formatMMDDYYYY, toISO } from '../utils/dates';
import { Button, Input, Select, Space, Spin, Alert, Divider } from 'antd';
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
      const res = await fetch(`${API_BASE}/customers/${customerId}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch customer');
      const data = await res.json();
      setCustomer(data);
      // If user is not actively editing, keep edit fields in sync with server values.
      if (!isEditing) {
        const ln = data.last_name || data.lastName || '';
        const fn = data.first_name || data.firstName || '';
        const dobVal = data.date_of_birth || data.dob || data.dateOfBirth || '';
        setLastName(ln);
        setFirstName(fn);
        setDob(formatMMDDYYYY(dobVal) || '');
        setIdNumber((data.id_number != null ? String(data.id_number) : '') || '');
        setFIdNumber((data.f_id_number != null ? String(data.f_id_number) : '') || '');
        setActiveStatus(data.active_status || 'active');
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
          if (window.showToast) window.showToast({ message: 'DOB must be in MM-DD-YYYY (or YYYY-MM-DD)', type: 'error' });
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
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Spin />
            </div>
          )}

          {error && <Alert type="error" showIcon message="Error" description={error} />}

          {!loading && !error && customer && (
            <>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-sm text-gray-500">
                  Participant Details
                </div>
                {!isEditing ? (
                  <Button type="primary" onClick={beginEdit}>
                    Edit
                  </Button>
                ) : (
                  <Space>
                    <Button onClick={() => setIsEditing(false)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button type="primary" onClick={saveDetails} loading={saving}>
                      Save
                    </Button>
                  </Space>
                )}
              </div>

              <Divider style={{ margin: '12px 0' }} />

              {!isEditing ? (
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <strong>Name:</strong>{' '}
                    {(customer.last_name || customer.lastName ? (customer.last_name || customer.lastName) : '') +
                      ((customer.first_name || customer.firstName) ? (', ' + (customer.first_name || customer.firstName)) : '')}
                  </div>
                  <div>
                    <strong>DOB:</strong>{' '}
                    {formatMMDDYYYY(customer.date_of_birth || customer.dob || customer.dateOfBirth || '') || '—'}
                  </div>
                  <div>
                    <strong>ID #:</strong>{' '}
                    {(customer.id_number != null && customer.id_number !== '') ? customer.id_number : '—'}
                  </div>
                  <div>
                    <strong>F ID #:</strong>{' '}
                    {(customer.f_id_number != null && customer.f_id_number !== '') ? customer.f_id_number : '—'}
                  </div>
                  <div>
                    <strong>Status:</strong>{' '}
                    <span style={{
                      display: 'inline-block',
                      marginLeft: 8,
                      padding: '6px 10px',
                      borderRadius: '999px',
                      background: (customer.active_status || 'active') === 'active' ? '#e6ffed' : '#fff3f3',
                      color: (customer.active_status || 'active') === 'active' ? '#167d3b' : '#c92a2a',
                      border: (customer.active_status || 'active') === 'active' ? '1px solid #b8f4c6' : '1px solid #f1c0c0',
                      fontWeight: 600,
                      textTransform: 'capitalize'
                    }}>{(customer.active_status || 'active')}</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <strong>Last name</strong>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
                  </div>
                  <div>
                    <strong>First name</strong>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                  </div>
                  <div>
                    <strong>DOB</strong>
                    <Input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="MM-DD-YYYY" />
                  </div>
                  <div>
                    <strong>ID #</strong>
                    <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="ID #" />
                  </div>
                  <div>
                    <strong>F ID #</strong>
                    <Input value={fIdNumber} onChange={(e) => setFIdNumber(e.target.value)} placeholder="F ID #" />
                  </div>
                  <div>
                    <strong>Status</strong>
                    <Select
                      value={activeStatus || 'active'}
                      onChange={(val) => setActiveStatus(val)}
                      options={[
                        { value: 'active', label: 'Active' },
                        { value: 'inactive', label: 'Inactive' },
                      ]}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}