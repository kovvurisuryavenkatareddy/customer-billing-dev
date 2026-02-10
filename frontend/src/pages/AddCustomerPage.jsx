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
    try {
      const res = await fetch(`${API_BASE}/customers/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create');
      if (window.showToast) window.showToast({ message: 'Customer created', type: 'success' });
      if (onNavigate) onNavigate('home');
      else navigate('/');
    } catch (err) {
      console.error('Add customer failed', err);
      if (window.showToast) window.showToast({ message: 'Could not create customer', type: 'error' });
    }
  }

  return (
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
        )}
      </Card>
    </div>
  );
}
