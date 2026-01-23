import React, { useState } from 'react';
import axios from 'axios';
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
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    setResults([]);
    setError('');
    setProgress(0);
    setCurrentFile('');
  };

  const fetchServices = async () => {
    setServicesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/services/`);
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
    setServices(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const saveService = async (service) => {
    try {
      const token = localStorage.getItem('token');
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
    const results = await Promise.all(services.map(s => s.id ? saveService(s) : addService(s)));
    const failed = results.filter(r => !r).length;
    if (failed === 0) {
      setError('All services saved successfully.');
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
      setProgress(Math.round((i / files.length) * 100));
      
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await axios.post(`${API_BASE}/billing/import`, formData, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
        
        uploadResults.push({
          filename: file.name,
          status: 'success',
          message: res.data.message || 'Import successful!',
          data: res.data
        });
        
      } catch (err) {
        uploadResults.push({
          filename: file.name,
          status: 'error',
          message: err.response?.data?.detail || 'Upload failed.',
          error: err.response?.data
        });
      }
    }
    
    setProgress(100);
    setCurrentFile('');
    setResults(uploadResults);
    setUploading(false);
  };

  return (
    <div className="billing-import-container" style={{maxWidth: 600, margin: '40px auto', padding: 24, border: '1px solid #eee', borderRadius: 8, background: '#fafcff'}}>
      <h2>Import Billing Data (Multiple Files)</h2>
      
      <input 
        type="file" 
        accept=".csv,.xlsx,.xls" 
        onChange={handleFileChange} 
        disabled={uploading} 
        multiple
        style={{marginBottom: 12, width: '100%'}} 
      />
      
      {files.length > 0 && (
        <div style={{marginBottom: 12, padding: 8, background: '#f0f8ff', borderRadius: 4}}>
          <div style={{fontWeight: 'bold', marginBottom: 4}}>Selected Files ({files.length}):</div>
          {files.map((file, index) => (
            <div key={index} style={{fontSize: 12, color: '#555'}}>
              • {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          ))}
        </div>
      )}
      
      <button 
        onClick={handleUpload} 
        disabled={uploading || !files.length} 
        style={{
          marginBottom: 12, 
          width: '100%', 
          padding: '8px 0', 
          background: uploading ? '#ccc' : '#007bff', 
          color: '#fff', 
          border: 'none', 
          borderRadius: 4, 
          fontWeight: 'bold', 
          cursor: uploading ? 'not-allowed' : 'pointer'
        }}
      >
        {uploading ? `Processing ${files.length} files...` : `Upload ${files.length} file(s)`}
      </button>
      
      {uploading && (
        <div style={{marginBottom: 12}}>
          <div style={{fontSize: 12, color: '#555', marginBottom: 4}}>
            {currentFile ? `Processing: ${currentFile}` : 'Preparing upload...'}
          </div>
          <div style={{height: 8, background: '#e0e0e0', borderRadius: 4}}>
            <div style={{width: `${progress}%`, height: 8, background: '#007bff', borderRadius: 4, transition: 'width 0.3s'}}></div>
          </div>
          <div style={{fontSize: 12, color: '#555', marginTop: 4}}>{progress}%</div>
        </div>
      )}
      
      {error && <div style={{color: 'red', marginBottom: 12, padding: 8, background: '#ffe6e6', borderRadius: 4}}>{error}</div>}
      
      {results.length > 0 && (
        <div style={{marginBottom: 12}}>
          <h3 style={{fontSize: 16, marginBottom: 8}}>Upload Results:</h3>
          {results.map((result, index) => (
            <div 
              key={index} 
              style={{
                padding: 8, 
                marginBottom: 8, 
                borderRadius: 4, 
                background: result.status === 'success' ? '#e6f7e6' : '#ffe6e6',
                border: `1px solid ${result.status === 'success' ? '#4caf50' : '#f44336'}`
              }}
            >
              <div style={{fontWeight: 'bold', fontSize: 14}}>
                {result.status === 'success' ? '✓' : '✗'} {result.filename}
              </div>
              <div style={{fontSize: 12, color: '#555', marginTop: 4}}>
                {result.message}
              </div>
              {result.data && result.data.customers_inserted !== undefined && (
                <div style={{fontSize: 11, color: '#666', marginTop: 2}}>
                  Customers: {result.data.customers_inserted} | Entries: {result.data.entries_inserted}
                  {result.data.errors && result.data.errors.length > 0 && (
                    <span> | Errors: {result.data.errors.length}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Service manager - allow updating service types and prices */}
      <div style={{marginTop: 12}}>
        <button
          onClick={() => {
            if (!showServiceManager) fetchServices();
            setShowServiceManager(s => !s);
          }}
          style={{marginBottom: 12, padding: '8px 12px', borderRadius: 4, background: '#0069d9', color: '#fff', border: 'none', cursor: 'pointer'}}
        >
          {showServiceManager ? 'Hide Service Manager' : 'Manage Service Types & Prices'}
        </button>

        {showServiceManager && (
          <div style={{padding: 12, border: '1px solid #eee', borderRadius: 6, background: '#fff'}}>
            <h3 style={{marginTop: 0}}>Service Types</h3>
            {servicesLoading ? (
              <div>Loading services...</div>
            ) : (
              <div style={{overflowX: 'auto'}}>
                <table style={{width: '100%', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr>
                      <th style={{textAlign: 'left', padding: 8}}>Name</th>
                      <th style={{textAlign: 'right', padding: 8}}>Rate per Day ($)</th>
                      <th style={{textAlign: 'right', padding: 8}}>Default Days</th>
                      <th style={{padding: 8}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((svc, idx) => (
                      <tr key={svc.id || idx} style={{borderTop: '1px solid #f0f0f0'}}>
                        <td style={{padding: 8}}>
                          <input value={svc.name || ''} onChange={(e) => handleServiceFieldChange(idx, 'name', e.target.value)} style={{width: '100%'}} />
                        </td>
                        <td style={{padding: 8}}>
                          <input type="number" min="0" step="0.01" value={svc.rate_per_day ?? svc.ratePerDay ?? ''} onChange={(e) => handleServiceFieldChange(idx, 'rate_per_day', e.target.value)} style={{width: '100%', textAlign: 'right'}} />
                        </td>
                        <td style={{padding: 8}}>
                          <input type="number" min="0" value={svc.default_days ?? svc.defaultDays ?? ''} onChange={(e) => handleServiceFieldChange(idx, 'default_days', e.target.value)} style={{width: '100%', textAlign: 'right'}} />
                        </td>
                        <td style={{padding: 8}}>
                          <button onClick={async () => { const ok = await saveService(svc); if (ok) fetchServices(); }} style={{marginRight: 8}}>Save</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{marginTop: 12, display: 'flex', gap: 8}}>
                  <button onClick={saveAllServices} style={{padding: '8px 12px', background: '#28a745', color: '#fff', border: 'none', borderRadius: 4}}>Save All</button>
                  <button onClick={() => { setServices([]); fetchServices(); }} style={{padding: '8px 12px'}}>Reload</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <ul style={{fontSize: 13, color: '#666', marginTop: 16}}>
        <li>Select multiple files using Ctrl+Click (Windows) or Cmd+Click (Mac)</li>
        <li>Accepted formats: <b>.csv</b>, <b>.xlsx</b>, <b>.xls</b></li>
        <li>Files are processed sequentially, one at a time</li>
        <li>Each file sends a separate API request</li>
        <li>Progress shows current file being processed</li>
      </ul>
    </div>
  );
}
