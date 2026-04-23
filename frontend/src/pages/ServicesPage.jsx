/**
 * Service Management: Card, Table, Modal, Popconfirm, Spin, Empty.
 */
import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Popconfirm, Form, Input, Alert, Spin, Empty } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { API_BASE, getAuthHeaders } from '../utils/api';

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [deletePendingId, setDeletePendingId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form] = Form.useForm();

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

  const handleAddService = async (values) => {
    try {
<<<<<<< HEAD
      window.showToast?.({ key: 'services-save', type: 'loading', message: 'Adding service…', duration: 0 });
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      const response = await fetch(`${API_BASE}/services/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: values.name,
          rate_per_day: Number(values.rate_per_day),
          default_days: Number(values.default_days),
        }),
      });
      if (!response.ok) throw new Error('Failed to add service');
      await fetchServices();
      form.resetFields();
      setShowAddForm(false);
<<<<<<< HEAD
      window.showToast?.({ key: 'services-save', message: 'Service added', type: 'success' });
    } catch (err) {
      setError(err.message);
      window.showToast?.({ key: 'services-save', message: err.message || 'Failed to add service', type: 'error' });
=======
      if (window.showToast) window.showToast({ message: 'Service added', type: 'success' });
    } catch (err) {
      setError(err.message);
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
    }
  };

  const handleEditService = async (values) => {
    if (!editingService) return;
    try {
<<<<<<< HEAD
      window.showToast?.({ key: 'services-save', type: 'loading', message: 'Updating service…', duration: 0 });
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      const response = await fetch(`${API_BASE}/services/${editingService.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: values.name,
          rate_per_day: Number(values.rate_per_day),
          default_days: Number(values.default_days),
        }),
      });
      if (!response.ok) throw new Error('Failed to update service');
      await fetchServices();
      form.resetFields();
      setEditingService(null);
<<<<<<< HEAD
      window.showToast?.({ key: 'services-save', message: 'Service updated', type: 'success' });
    } catch (err) {
      setError(err.message);
      window.showToast?.({ key: 'services-save', message: err.message || 'Failed to update service', type: 'error' });
=======
      if (window.showToast) window.showToast({ message: 'Service updated', type: 'success' });
    } catch (err) {
      setError(err.message);
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
    }
  };

  const performDeleteService = async () => {
    if (!deletePendingId) return;
    setDeleting(true);
    try {
<<<<<<< HEAD
      window.showToast?.({ key: `services-delete-${deletePendingId}`, type: 'loading', message: 'Deleting service…', duration: 0 });
=======
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
      const response = await fetch(`${API_BASE}/services/${deletePendingId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (response?.status === 204 || response?.ok) {
<<<<<<< HEAD
        window.showToast?.({ key: `services-delete-${deletePendingId}`, message: 'Service deleted', type: 'success' });
=======
        if (window.showToast) window.showToast({ message: 'Service deleted', type: 'info' });
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
        await fetchServices();
      } else {
        let msg = 'Failed to delete service';
        try {
          const body = await response.json();
          msg = body.detail || body.message || msg;
        } catch (e) {}
        setError(msg);
<<<<<<< HEAD
        window.showToast?.({ key: `services-delete-${deletePendingId}`, message: msg, type: 'error' });
      }
    } catch (err) {
      setError(err.message || 'Failed to delete service');
      window.showToast?.({ key: `services-delete-${deletePendingId}`, message: err.message || 'Failed to delete service', type: 'error' });
=======
        if (window.showToast) window.showToast({ message: msg, type: 'error' });
      }
    } catch (err) {
      setError(err.message || 'Failed to delete service');
      if (window.showToast) window.showToast({ message: err.message || 'Failed to delete service', type: 'error' });
>>>>>>> 1f2e4a5f786650f7b5002f0154e176ad619d9400
    } finally {
      setDeletePendingId(null);
      setDeleting(false);
    }
  };

  const startEdit = (service) => {
    setEditingService(service);
    form.setFieldsValue({
      name: service.name,
      rate_per_day: service.rate_per_day,
      default_days: service.default_days,
    });
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    form.resetFields();
    setShowAddForm(false);
    setEditingService(null);
  };

  const columns = [
    { title: 'Service Name', dataIndex: 'name', key: 'name', ellipsis: true },
    {
      title: 'Rate per Day',
      dataIndex: 'rate_per_day',
      key: 'rate_per_day',
      width: 120,
      align: 'right',
      render: (val) => (val != null ? `$${Number(val).toFixed(2)}` : '–'),
    },
    {
      title: 'Default Days',
      dataIndex: 'default_days',
      key: 'default_days',
      width: 120,
      align: 'right',
      render: (val) => (val != null ? val : '–'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <div className="flex gap-2">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => startEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this service?"
            description="This action cannot be undone."
            onConfirm={performDeleteService}
            okButtonProps={{ danger: true, loading: deleting }}
            onCancel={() => setDeletePendingId(null)}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => setDeletePendingId(record.id)}
            >
              Delete
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <Card className="shadow-sm">
          <div className="py-20 flex flex-col items-center justify-center">
            <Spin size="large" tip="Loading services..." />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <Card
        title={
          <span className="flex items-center gap-2">
            <SettingOutlined className="text-[#007bff]" />
            <span className="text-xl font-semibold">Service Management</span>
          </span>
        }
        className="shadow-sm"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setShowAddForm(true);
              form.resetFields();
              setEditingService(null);
            }}
          >
            Add Service
          </Button>
        }
      >
        <p className="text-gray-500 mb-4 mt-0">
          Manage service types, rates per day, and default days. These are used when adding or editing customers.
        </p>

        {error && (
          <Alert
            type="error"
            message={error}
            showIcon
            className="mb-4"
            closable
            onClose={() => setError(null)}
          />
        )}

        <Table
          rowKey="id"
          columns={columns}
          dataSource={services}
          pagination={false}
          size="middle"
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No services yet. Add one to get started."
              />
            ),
          }}
        />
      </Card>

      <Modal
        open={showAddForm || !!editingService}
        title={editingService ? 'Edit Service' : 'Add New Service'}
        onCancel={cancelEdit}
        footer={null}
        destroyOnClose
        width={400}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={editingService ? handleEditService : handleAddService}
          initialValues={{ name: '', rate_per_day: '', default_days: '' }}
        >
          <Form.Item name="name" label="Service Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Respite Care" />
          </Form.Item>
          <Form.Item name="rate_per_day" label="Rate per Day ($)" rules={[{ required: true, message: 'Required' }]}>
            <Input type="number" min={0} step={0.01} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="default_days" label="Default Days" rules={[{ required: true, message: 'Required' }]}>
            <Input type="number" min={1} placeholder="1" />
          </Form.Item>
          <Form.Item className="mb-0 mt-6">
            <Button type="primary" htmlType="submit" className="mr-2">
              {editingService ? 'Update' : 'Add Service'}
            </Button>
            <Button onClick={cancelEdit}>Cancel</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
