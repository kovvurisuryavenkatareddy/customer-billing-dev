/**
 * Add Customer page: Card layout, Spin, optional back link.
 */
import React, { useState, useEffect } from 'react';
import { Card, Spin, Button } from 'antd';
import { ArrowLeftOutlined, UserAddOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import CustomerForm from '../components/form';
import { API_BASE, getAuthHeaders } from '../utils/api';

export default function AddCustomerPage({ onNavigate }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

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
    if (saving) return;
    const toastKey = 'add-customer';
    try {
      setSaving(true);
      window.showToast?.({ key: toastKey, type: 'loading', message: 'Creating customer…', duration: 0 });
      const res = await fetch(`${API_BASE}/customers/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create');
      window.showToast?.({ key: toastKey, message: 'Customer created', type: 'success' });
      if (onNavigate) onNavigate('home');
      else navigate('/');
    } catch (err) {
      console.error('Add customer failed', err);
      window.showToast?.({ key: toastKey, message: 'Could not create customer', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Button
          type="text"
          size="small"
          icon={<ArrowLeftOutlined />}
          onClick={() => {
            navigate('/');
            onNavigate?.('home');
          }}
          className="-ml-2 text-slate-700 hover:text-[#007bff]"
        >
          Back
        </Button>
      </div>

      <Card
        className="shadow-sm border border-slate-200 rounded-xl"
        styles={{
          header: { padding: '16px 20px' },
          body: { padding: '20px 20px 24px' },
        }}
        title={
          <span className="flex items-center gap-2">
            <UserAddOutlined className="text-[#007bff]" />
            <span className="text-lg font-semibold text-slate-900">Add Customer</span>
          </span>
        }
      >
        <p className="text-slate-500 mb-5 mt-0 text-sm">
          Add a new participant with customer details and service information.
        </p>

        {loading ? (
          <div className="py-14 flex justify-center">
            <Spin size="large" tip="Loading services..." />
          </div>
        ) : (
          <CustomerForm onSubmit={handleSubmit} services={services} submitting={saving} />
        )}
      </Card>
    </div>
  );
}
