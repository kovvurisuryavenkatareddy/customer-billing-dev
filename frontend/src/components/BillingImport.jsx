/**
 * Import Billing Data: Card layout, Upload area, Progress, Results, Service Manager.
 */
import React, { useState } from 'react';
import axios from 'axios';
import { Card, Button, Progress, Alert, List, Collapse, InputNumber, Table, Spin, Space } from 'antd';
import { UploadOutlined, FileExcelOutlined, InboxOutlined } from '@ant-design/icons';
import { API_BASE, getAuthHeaders } from '../utils/api';

export default function BillingImport() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [showServiceManager, setShowServiceManager] = useState(false);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(selectedFiles);
    setResults([]);
    setError('');
    setProgress(0);
    setCurrentFile('');
  };

  const fetchServices = async () => {
    setServicesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/services/`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch services');
      const data = await res.json();
      setServices(data);
    } catch (err) {
      console.error('Error fetching services', err);
      setError('Failed to load services');
    } finally {
      setServicesLoading(false);
    }
  };

  const handleServiceFieldChange = (index, field, value) => {
    setServices((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const saveService = async (service) => {
    try {
      const res = await fetch(`${API_BASE}/services/${service.id}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: service.name,
          rate_per_day: Number(service.rate_per_day || 0),
          default_days: Number(service.default_days || 0),
        }),
      });
      if (!res.ok) throw new Error('Failed to update service');
      return true;
    } catch (err) {
      console.error('Error saving service', err);
      return false;
    }
  };

  const addService = async (service) => {
    try {
      const res = await fetch(`${API_BASE}/services/`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: service.name,
          rate_per_day: Number(service.rate_per_day || 0),
          default_days: Number(service.default_days || 0),
        }),
      });
      if (!res.ok) throw new Error('Failed to add service');
      return true;
    } catch (err) {
      console.error('Error adding service', err);
      return false;
    }
  };

  const saveAllServices = async () => {
    const saveResults = await Promise.all(services.map((s) => (s.id ? saveService(s) : addService(s))));
    const failed = saveResults.filter((r) => !r).length;
    if (failed === 0) {
      setError('');
      if (window.showToast) window.showToast({ message: 'All services saved.', type: 'success' });
      fetchServices();
    } else {
      setError(`${failed} services failed to save.`);
    }
  };

  const handleUpload = async () => {
    if (!files.length) {
      setError('Please select at least one file.');
      return;
    }
    setUploading(true);
    setError('');
    setResults([]);
    const token = localStorage.getItem('token');
    const uploadResults = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentFile(file.name);
      setProgress(Math.round(((i + 0.5) / files.length) * 100));
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await axios.post(`${API_BASE}/billing/import`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
        uploadResults.push({
          filename: file.name,
          status: 'success',
          message: res.data.message || 'Import successful!',
          data: res.data,
        });
      } catch (err) {
        uploadResults.push({
          filename: file.name,
          status: 'error',
          message: err.response?.data?.detail || 'Upload failed.',
          error: err.response?.data,
        });
      }
    }
    setProgress(100);
    setCurrentFile('');
    setResults(uploadResults);
    setUploading(false);
  };

  const serviceColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (val, record, idx) => (
        <input
          className="w-full border border-gray-300 rounded px-2 py-1"
          value={val || ''}
          onChange={(e) => handleServiceFieldChange(idx, 'name', e.target.value)}
        />
      ),
    },
    {
      title: 'Rate/Day ($)',
      dataIndex: 'rate_per_day',
      key: 'rate_per_day',
      render: (val, record, idx) => (
        <InputNumber
          min={0}
          step={0.01}
          className="w-full"
          value={val ?? record.ratePerDay ?? ''}
          onChange={(v) => handleServiceFieldChange(idx, 'rate_per_day', v)}
        />
      ),
    },
    {
      title: 'Default Days',
      dataIndex: 'default_days',
      key: 'default_days',
      render: (val, record, idx) => (
        <InputNumber
          min={0}
          className="w-full"
          value={val ?? record.defaultDays ?? ''}
          onChange={(v) => handleServiceFieldChange(idx, 'default_days', v)}
        />
      ),
    },
    {
      title: '',
      key: 'save',
      render: (_, record) => (
        <Button
          size="small"
          type="primary"
          onClick={async () => {
            const ok = await saveService(record);
            if (ok) fetchServices();
          }}
        >
          Save
        </Button>
      ),
    },
  ];

  return (
    <div className="max-w-[640px] mx-auto">
      <Card
        title={<span className="text-xl font-semibold">Import Billing Data</span>}
        className="shadow-sm mb-6"
        styles={{ body: { padding: 24 } }}
      >
        <p className="text-gray-500 mb-4 mt-0">
          Upload one or more files (.csv, .xlsx, .xls). Files are processed sequentially.
        </p>

        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 mb-4 bg-gray-50/50 hover:border-[#007bff]/40 transition-colors">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={uploading}
            multiple
            id="billing-file-input"
            className="sr-only"
          />
          <label
            htmlFor="billing-file-input"
            className="flex flex-col items-center justify-center cursor-pointer text-center"
          >
            <InboxOutlined className="text-4xl text-gray-400 mb-2" />
            <span className="text-gray-600 font-medium">
              {files.length ? `${files.length} file(s) selected` : 'Click or drag files here'}
            </span>
            <span className="text-sm text-gray-400 mt-1">.csv, .xlsx, .xls</span>
          </label>
        </div>

        {files.length > 0 && (
          <Alert
            type="info"
            message={`${files.length} file(s) selected`}
            description={
              <ul className="list-disc pl-4 mb-0 mt-1 text-sm">
                {files.map((f, i) => (
                  <li key={i}>{f.name} ({(f.size / 1024).toFixed(1)} KB)</li>
                ))}
              </ul>
            }
            className="mb-4"
          />
        )}

        <Button
          type="primary"
          icon={<UploadOutlined />}
          onClick={handleUpload}
          loading={uploading}
          disabled={!files.length}
          block
          size="large"
          className="mb-4"
        >
          {uploading ? `Processing... ${currentFile || ''}` : `Upload ${files.length} file(s)`}
        </Button>

        {uploading && (
          <div className="mb-4">
            <Progress percent={progress} showInfo status="active" />
          </div>
        )}

        {error && (
          <Alert type="error" message={error} showIcon className="mb-4" closable onClose={() => setError('')} />
        )}

        {results.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold mb-2">Results</h4>
            <List
              dataSource={results}
              renderItem={(result) => (
                <List.Item>
                  <Alert
                    type={result.status === 'success' ? 'success' : 'error'}
                    message={`${result.status === 'success' ? '✓' : '✗'} ${result.filename}`}
                    description={
                      <>
                        <div>{result.message}</div>
                        {result.data?.customers_inserted !== undefined && (
                          <div className="text-xs text-gray-500 mt-1">
                            Customers: {result.data.customers_inserted} · Entries: {result.data.entries_inserted}
                          </div>
                        )}
                      </>
                    }
                    showIcon
                    className="w-full"
                  />
                </List.Item>
              )}
            />
          </div>
        )}

        <Collapse
          items={[
            {
              key: 'services',
              label: (
                <span className="flex items-center gap-2">
                  <FileExcelOutlined />
                  Manage Service Types & Prices
                </span>
              ),
              children: (
                <>
                  {servicesLoading ? (
                    <div className="py-8 text-center">
                      <Spin tip="Loading services..." />
                    </div>
                  ) : (
                    <>
                      <Table
                        dataSource={services}
                        rowKey={(r, i) => r.id ?? `row-${i}`}
                        columns={serviceColumns}
                        pagination={false}
                        size="small"
                        className="mb-3"
                      />
                      <Space>
                        <Button type="primary" onClick={saveAllServices}>
                          Save All
                        </Button>
                        <Button onClick={fetchServices}>Reload</Button>
                      </Space>
                    </>
                  )}
                </>
              ),
            },
          ]}
          onChange={(keys) => {
            if (keys.includes('services') && !showServiceManager) fetchServices();
            setShowServiceManager(keys.includes('services'));
          }}
          className="mb-0"
        />

        <ul className="text-sm text-gray-500 mt-4 list-disc pl-5 space-y-1">
          <li>Use Ctrl+Click (Windows) or Cmd+Click (Mac) to select multiple files</li>
          <li>Accepted formats: .csv, .xlsx, .xls</li>
        </ul>
      </Card>
    </div>
  );
}
