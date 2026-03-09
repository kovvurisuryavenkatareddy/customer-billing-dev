import React, { useState, useEffect } from 'react';
import { formatMMDDYYYY, toISO } from '../utils/dates';
import { Button, Input, Select, Space, Spin, Alert, Divider } from 'antd';
import { API_BASE, getAuthHeaders } from '../utils/api';

export default function CustomerEntryModal({ customerId, batchId, customerCode, onClose, onUpdated }) {
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
  }, [customerId, batchId]);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = getAuthHeaders();
      let cust;
      // When batchId is set (clicked from a row), show only that batch's services; otherwise all entries
      if (batchId) {
        const [custRes, batchRes] = await Promise.all([
          fetch(`${API_BASE}/customers/${customerId}`, { headers }),
          fetch(`${API_BASE}/customers/${customerId}/batches/${batchId}/entries`, { headers }),
        ]);
        if (!custRes.ok) throw new Error('Failed to fetch customer');
        if (!batchRes.ok) throw new Error('Failed to fetch services');
        cust = await custRes.json();
        const batchData = await batchRes.json();
        const batchEntries = Array.isArray(batchData.entries) ? batchData.entries : [];
        setCustomer({ ...cust, services: batchEntries });
      } else {
        const res = await fetch(`${API_BASE}/customers/${customerId}/entries`, { headers });
        if (!res.ok) throw new Error('Failed to fetch customer');
        const data = await res.json();
        cust = data.customer || data;
        const allEntries = Array.isArray(data.entries) ? data.entries : [];
        setCustomer({ ...cust, services: allEntries });
      }
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
                    <Input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="MM/DD/YYYY" />
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

              {/* Services: read-only, professional card layout */}
              <Divider style={{ margin: '16px 0 8px' }} />
              <div className="text-sm font-medium text-[#495057] mb-3">Services</div>
              {Array.isArray(customer.services) && customer.services.length > 0 ? (() => {
                const totalBilled = customer.services.reduce((s, e) => s + (Number(e.amount_billed ?? e.amountBilled ?? 0)), 0);
                const totalPaid = customer.services.reduce((s, e) => s + (Number(e.amount_paid ?? e.amountPaid ?? 0)), 0);
                const totalDue = totalBilled - totalPaid;
                return (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1.5rem',
                      marginBottom: '1rem',
                      padding: '10px 16px',
                      background: 'linear-gradient(to right, #f1f5f9, #e2e8f0)',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ color: '#475569' }}>
                      Grand Total: <span className="tabular-nums" style={{ color: '#1e293b' }}>${totalBilled.toFixed(2)}</span>
                    </span>
                    <span style={{ color: '#475569', paddingLeft: '1rem', borderLeft: '1px solid #cbd5e1' }}>
                      Total Paid: <span className="tabular-nums" style={{ color: '#1e293b' }}>${totalPaid.toFixed(2)}</span>
                    </span>
                    <span style={{ paddingLeft: '1rem', borderLeft: '1px solid #cbd5e1' }}>
                      Total Due: <span className="tabular-nums" style={{ color: totalDue > 0 ? '#dc2626' : '#64748b' }}>${totalDue.toFixed(2)}</span>
                    </span>
                  </div>
                  <div className="space-y-3">
                    {customer.services.map((s, idx) => {
                      const billed = Number(s.amount_billed ?? s.amountBilled ?? 0);
                      const paid = Number(s.amount_paid ?? s.amountPaid ?? 0);
                      const due = billed - paid;
                      const rate = Number(s.rate_per_day ?? s.ratePerDay ?? 0);
                      const days = s.days != null ? s.days : '—';
                      const denialList = Array.isArray(s.denial_codes) ? s.denial_codes : (s.denialCodes || (typeof s.denial_codes === 'string' && s.denial_codes ? s.denial_codes.split(',') : []));
                      return (
                        <div
                          key={s.id || `svc-${idx}`}
                          className="rounded-lg border border-[#e9ecef] bg-[#fafbfc] px-4 py-3"
                        >
                          <div className="text-[#1a253c] font-semibold text-[15px] mb-2">
                            {s.service_name || s.serviceName || '—'}
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                            <div className="text-[#6c757d]">
                              <span className="text-[#495057]">Rate/day</span>{' '}
                              <span className="font-medium tabular-nums">${rate.toFixed(2)}</span>
                            </div>
                            <div className="text-[#6c757d]">
                              <span className="text-[#495057]">Days</span>{' '}
                              <span className="font-medium tabular-nums">{days}</span>
                            </div>
                            <div className="text-[#6c757d]">
                              <span className="text-[#495057]">Billed</span>{' '}
                              <span className="font-medium tabular-nums">${billed.toFixed(2)}</span>
                            </div>
                            <div className="text-[#6c757d]">
                              <span className="text-[#495057]">Paid</span>{' '}
                              <span className="font-medium tabular-nums">${paid.toFixed(2)}</span>
                            </div>
                            <div className="text-[#6c757d]">
                              <span className="text-[#495057]">Due</span>{' '}
                              <span className={`font-medium tabular-nums ${due > 0 ? 'text-[#c92a2a]' : 'text-[#495057]'}`}>
                                ${due.toFixed(2)}
                              </span>
                            </div>
                            <div className="text-[#6c757d]">
                              <span className="text-[#495057]">Period</span>{' '}
                              <span className="tabular-nums">
                                {formatMMDDYYYY(s.start_date || s.startDate) || '—'} - {formatMMDDYYYY(s.end_date || s.endDate) || '—'}
                              </span>
                            </div>
                            {denialList.length > 0 && (
                              <div className="col-span-2 text-[#6c757d]">
                                <span className="text-[#495057]">Denial codes</span>{' '}
                                <span className="font-medium">{denialList.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
                );
              })() : (
                <p className="text-[#6c757d] text-sm py-2">No services for this participant.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}