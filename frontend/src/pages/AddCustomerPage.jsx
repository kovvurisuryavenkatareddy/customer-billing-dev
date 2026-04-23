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
<<<<<<< HEAD
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
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
<<<<<<< HEAD
    if (saving) return;
    const toastKey = 'add-customer';
    try {
      setSaving(true);
      window.showToast?.({ key: toastKey, type: 'loading', message: 'Adding customer…', duration: 0 });
=======
    try {
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      const res = await fetch(`${API_BASE}/customers/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create');
<<<<<<< HEAD
      window.showToast?.({ key: toastKey, message: 'Customer added successfully.', type: 'success' });
      setFormKey((k) => k + 1);
=======
      if (window.showToast) window.showToast({ message: 'Customer created', type: 'success' });
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      if (onNavigate) onNavigate('home');
      else navigate('/');
    } catch (err) {
      console.error('Add customer failed', err);
<<<<<<< HEAD
      window.showToast?.({ key: toastKey, message: 'Could not create customer', type: 'error' });
    } finally {
      setSaving(false);
=======
      if (window.showToast) window.showToast({ message: 'Could not create customer', type: 'error' });
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
    }
  }

  return (
<<<<<<< HEAD
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
          <CustomerForm key={formKey} onSubmit={handleSubmit} services={services} submitting={saving} />
=======
    <div className="max-w-4xl mx-auto">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => {
          navigate('/');
          onNavigate?.('home');
        }}
        className="mb-4 -ml-1 text-gray-700 hover:text-[#007bff]"
      >
        Back to Home
      </Button>
      <Card
        title={
          <span className="flex items-center gap-2">
            <UserAddOutlined className="text-[#007bff]" />
            <span className="text-xl font-semibold">Add Customer</span>
          </span>
        }
        className="shadow-sm"
        styles={{ body: { padding: '24px 24px 32px' } }}
      >
        <p className="text-gray-500 mb-6 mt-0">
          Add a new participant with customer details and service information.
        </p>
        {loading ? (
          <div className="py-16 flex justify-center">
            <Spin size="large" tip="Loading services..." />
          </div>
        ) : (
          <CustomerForm onSubmit={handleSubmit} services={services} />
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
        )}
      </Card>
    </div>
  );
}
