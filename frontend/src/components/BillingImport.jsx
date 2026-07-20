/**
 * Import Billing Data — upload + persistent import history from the database.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Card, Button, Progress, Alert, List, Collapse, InputNumber,
  Table, Spin, Space, Tag, Empty, Modal, Input, Form, message, Tooltip,
} from 'antd';
import {
  UploadOutlined, FileExcelOutlined, InboxOutlined,
  ReloadOutlined, HistoryOutlined, AppstoreOutlined, BarsOutlined,
  EditOutlined, SyncOutlined, GoogleOutlined,
} from '@ant-design/icons';
import { API_BASE, getAuthHeaders, handle401Error } from '../utils/api';

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtGroupDate(dateKey) {
  if (!dateKey || dateKey === 'Unknown') return 'Unknown Date';
  const d = new Date(dateKey + 'T00:00:00');
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function groupHistoryByDate(history) {
  const groups = new Map();
  for (const item of history) {
    const dateKey = estDateKey(item.imported_at);
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey).push(item);
  }
  return Array.from(groups.entries()).map(([dateKey, items]) => ({
    dateKey,
    label: fmtGroupDate(dateKey),
    items,
    importCount: items.length,
    totalAdded:   items.reduce((s, i) => s + (i.entries_added  || 0), 0),
    totalSkipped: items.reduce((s, i) => s + (i.entries_skipped || 0), 0),
    totalInvalid: items.reduce((s, i) => s + countInvalidCells(i), 0),
    totalBilled:  items.reduce((s, i) => s + (Number(i.total_billed) || 0), 0),
  }));
}

function fmtDate(d) {
  if (!d) return '—';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[1]}/${p[2]}/${p[0]}` : d;
}

function fmtMoney(v) {
  return `$${Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

// All import timestamps are displayed in US Eastern time, regardless of the
// viewer's own timezone. The backend sends imported_at as UTC-marked ISO.
const EST_TZ = 'America/New_York';

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  // No timeZoneName — the column header already states the zone.
  return d.toLocaleString('en-US', {
    timeZone: EST_TZ,
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

/** YYYY-MM-DD for the given instant, in Eastern time (used for date grouping). */
function estDateKey(iso) {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unknown';
  // en-CA gives ISO-style YYYY-MM-DD
  return d.toLocaleDateString('en-CA', { timeZone: EST_TZ });
}

function hasInvalidEntries(cust) {
  return (cust.entries_invalid?.length ?? 0) > 0;
}

function countInvalidCells(record) {
  const stored = record?.entries_invalid;
  if (stored != null && stored > 0) return stored;
  return (record?.customer_logs || []).reduce(
    (s, l) => s + (l.entries_invalid?.length ?? 0), 0
  );
}

function mapInvalidEntryRows(invalidEntries) {
  return (invalidEntries || []).map((e, i) => ({
    key: `invalid-${i}`,
    _is_invalid: true,
    service_name: e.service_name,
    start_date: e.raw_value,
    _error: e.error,
  }));
}

function buildCustomerEntryRows(cust) {
  const valid = (cust.entries_added || []).map((e, i) => ({ ...e, key: `valid-${i}` }));
  return [...valid, ...mapInvalidEntryRows(cust.entries_invalid)];
}

// ─── Column definitions (defined once, outside the component) ────────────────

// Level 3 — individual service entries inside a customer
// Rows with _is_invalid=true are format-error rows; they render in red with the raw cell value.
const entrySubColumns = [
  {
    title: 'Service', dataIndex: 'service_name', key: 'service_name', width: 80, ellipsis: true,
    render: (v, r) => r._is_invalid
      ? <span style={{ color: '#dc2626', fontWeight: 600 }}>{v}</span>
      : v,
  },
  {
    title: 'Start Date', dataIndex: 'start_date', key: 'start_date', width: 130, ellipsis: true,
    render: (v, r) => r._is_invalid
      ? <span style={{ color: '#dc2626', fontFamily: 'monospace', fontSize: 12 }} title={r._error}>{v}</span>
      : fmtDate(v),
  },
  {
    title: 'End Date', dataIndex: 'end_date', key: 'end_date', width: 100,
    render: (v, r) => r._is_invalid ? <span style={{ color: '#94a3b8' }}>—</span> : fmtDate(v),
  },
  {
    title: 'Days', dataIndex: 'days', key: 'days', width: 48, align: 'center',
    render: (v, r) => r._is_invalid ? <span style={{ color: '#94a3b8' }}>—</span> : v,
  },
  {
    title: 'Rate/Day', dataIndex: 'rate_per_day', key: 'rate_per_day',
    width: 80, align: 'center',
    render: (v, r) => r._is_invalid ? <span style={{ color: '#94a3b8' }}>—</span> : fmtMoney(v),
  },
  {
    title: 'Amount', dataIndex: 'amount_billed', key: 'amount_billed',
    width: 110, align: 'center',
    render: (v, r) => r._is_invalid
      ? <Tag color="error" style={{ margin: 0, fontSize: 11 }}>Invalid format</Tag>
      : <span style={{ fontWeight: 600 }}>{fmtMoney(v)}</span>,
  },
];

// Level 2 — customers inside one import session
function buildCustomerColumns(onEditInvalid) {
  return [
    {
      title: 'Customer', dataIndex: 'customer_name', key: 'customer_name', width: 70, ellipsis: true,
      render: (n) => <span style={{ fontWeight: 600 }}>{n}</span>,
    },
    {
      title: 'Status', key: 'status', width: 75, align: 'center',
      render: (_, r) =>
        r.is_new_customer ? <Tag color="green">New</Tag> : <Tag color="blue">Existing</Tag>,
    },
    {
      title: 'Added', key: 'added', width: 58, align: 'center',
      render: (_, r) => (
        <span style={{ color: r.entries_added?.length > 0 ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
          {r.entries_added?.length ?? 0}
        </span>
      ),
    },
    {
      title: 'Existed', dataIndex: 'entries_skipped', key: 'skipped', width: 30, align: 'center',
      render: (v) => <span style={{ color: v > 0 ? '#d97706' : '#94a3b8' }}>{v}</span>,
    },
    {
      title: 'Issues', key: 'issues', width: 88, align: 'center',
      render: (_, r) => {
        const n = r.entries_invalid?.length ?? 0;
        if (n === 0) return <span style={{ color: '#94a3b8' }}>—</span>;
        return (
          <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>
            {n} invalid
          </Tag>
        );
      },
    },
    {
      title: 'Total Billed', key: 'total_billed', width: 110, align: 'center',
      render: (_, r) => {
        const t = (r.entries_added || []).reduce((s, e) => s + (Number(e.amount_billed) || 0), 0);
        return <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{fmtMoney(t)}</span>;
      },
    },
    {
      title: '', key: 'actions', width: 72, align: 'center',
      render: (_, r) => (
        hasInvalidEntries(r) ? (
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => { e.stopPropagation(); onEditInvalid(r); }}
          >
            Edit
          </Button>
        ) : null
      ),
    },
  ];
}

// Level 1 — one row per import session
const historyColumns = [
  {
    title: 'Date & Time (EST)', dataIndex: 'imported_at', key: 'imported_at',
    width: 160, ellipsis: true, render: fmtDateTime,
  },
  {
    // Source is shown inline rather than in its own column: Google syncs get a
    // green icon + "Google Sync" tag, uploads just get the Excel icon.
    title: 'File', dataIndex: 'filename', key: 'filename',
    width: 260,
    render: (v, r) => {
      const isGoogle = r.source_type === 'google';
      const name = v || 'Untitled';
      return (
        <Tooltip title={`${isGoogle ? 'Google Sync' : 'Excel upload'} — ${name}`}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {isGoogle
              ? <GoogleOutlined style={{ color: '#0f9d58', flexShrink: 0 }} />
              : <FileExcelOutlined style={{ color: '#1d6f42', flexShrink: 0 }} />}
            {isGoogle && (
              <Tag color="green" style={{ margin: 0, flexShrink: 0, fontSize: 10, lineHeight: '16px', padding: '0 5px' }}>
                Google Sync
              </Tag>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </span>
          </span>
        </Tooltip>
      );
    },
  },
  {
    title: 'New', dataIndex: 'customers_new', key: 'customers_new',
    width: 50, align: 'center',
    render: (v) => <span style={{ color: v > 0 ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>{v}</span>,
  },
  {
    title: 'Added', dataIndex: 'entries_added', key: 'entries_added',
    width: 58, align: 'center',
    render: (v) => <span style={{ color: v > 0 ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>{v}</span>,
  },
  {
    title: 'Existed', dataIndex: 'entries_skipped', key: 'entries_skipped',
    width: 62, align: 'center',
    render: (v) => <span style={{ color: v > 0 ? '#d97706' : '#94a3b8' }}>{v}</span>,
  },
  {
    title: 'Invalid', key: 'entries_invalid', width: 68, align: 'center',
    render: (_, r) => {
      const n = countInvalidCells(r);
      if (n === 0) return <span style={{ color: '#94a3b8' }}>—</span>;
      return (
        <Tag color="warning" style={{ margin: 0, fontWeight: 600 }}>
          {n}
        </Tag>
      );
    },
  },
  {
    title: 'Total Billed', dataIndex: 'total_billed', key: 'total_billed',
    width: 110, align: 'right',
    render: (v) => <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{fmtMoney(v)}</span>,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BillingImport() {
  // Upload states
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  // Persistent import history (DB-backed)
  const [importHistory, setImportHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedHistoryKeys, setExpandedHistoryKeys] = useState([]);
  const [groupByDate, setGroupByDate] = useState(false);
  const [activeView, setActiveView] = useState('import');

  // Service manager
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [showServiceManager, setShowServiceManager] = useState(false);

  // Fix invalid entries from history
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editContext, setEditContext] = useState(null);

  // Google Sheets / Drive sync
  const [syncUrl, setSyncUrl] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  useEffect(() => { loadHistory(); loadSyncConfig(); }, []);

  async function loadSyncConfig() {
    try {
      const res = await fetch(`${API_BASE}/billing/sync/config`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data?.sync_url) setSyncUrl(data.sync_url);
      }
    } catch (e) {
      console.warn('Could not load sync config', e);
    }
  }

  async function handleSync() {
    const url = syncUrl.trim();
    if (!url) { message.warning('Paste a Google Sheets or Drive link first.'); return; }
    setSyncing(true);
    setSyncResult(null);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/billing/sync`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_url: url }),
      });
      if (res.status === 401) { handle401Error(); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncResult({ status: 'error', message: data.detail || 'Sync failed.' });
        return;
      }
      const invalidCount = data.entries_invalid_count ?? 0;
      setSyncResult({
        status: invalidCount > 0 ? 'warning' : 'success',
        message: data.message || 'Sync complete.',
        data,
      });
      const newHistory = await loadHistory();
      if (newHistory.length > 0) {
        setExpandedHistoryKeys([String(newHistory[0].id)]);
      }
    } catch (e) {
      setSyncResult({ status: 'error', message: 'Sync failed — check the link and try again.' });
    } finally {
      setSyncing(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/billing/import/logs`, { headers: getAuthHeaders() });
      if (res.status === 401) { handle401Error(); return []; }
      if (res.ok) {
        const data = await res.json();
        setImportHistory(Array.isArray(data) ? data : []);
        return Array.isArray(data) ? data : [];
      }
    } catch (e) {
      console.warn('Could not load import logs', e);
    } finally {
      setHistoryLoading(false);
    }
    return [];
  }

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(selectedFiles);
    setResults([]);
    setError('');
    setProgress(0);
    setCurrentFile('');
  };

  const handleUpload = async () => {
    if (!files.length) { setError('Please select at least one file.'); return; }
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
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
        });
        uploadResults.push({
          filename: file.name, status: 'success',
          message: res.data.message || 'Import successful!',
          data: res.data,
        });
      } catch (err) {
        uploadResults.push({
          filename: file.name, status: 'error',
          message: err.response?.data?.detail || 'Upload failed.',
        });
      }
    }

    setProgress(100);
    setCurrentFile('');
    setResults(uploadResults);
    setUploading(false);

    // Reload history and auto-expand the newest entry
    const newHistory = await loadHistory();
    if (newHistory.length > 0) {
      setExpandedHistoryKeys([String(newHistory[0].id)]);
    }
  };

  // ── Service manager helpers ──────────────────────────────────────────────

  const fetchServices = async () => {
    setServicesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/services/`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch services');
      setServices(await res.json());
    } catch (err) {
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
      return res.ok;
    } catch { return false; }
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
      return res.ok;
    } catch { return false; }
  };

  const saveAllServices = async () => {
    const saveResults = await Promise.all(services.map((s) => (s.id ? saveService(s) : addService(s))));
    const failed = saveResults.filter((r) => !r).length;
    if (failed === 0) {
      setError('');
      window.showToast?.({ message: 'All services saved.', type: 'success' });
      fetchServices();
    } else {
      setError(`${failed} services failed to save.`);
    }
  };

  const serviceColumns = [
    {
      title: 'Name', dataIndex: 'name', key: 'name',
      render: (val, record, idx) => (
        <input className="w-full border border-gray-300 rounded px-2 py-1" value={val || ''}
          onChange={(e) => handleServiceFieldChange(idx, 'name', e.target.value)} />
      ),
    },
    {
      title: 'Rate/Day ($)', dataIndex: 'rate_per_day', key: 'rate_per_day',
      render: (val, record, idx) => (
        <InputNumber min={0} step={0.01} className="w-full" value={val ?? record.ratePerDay ?? ''}
          onChange={(v) => handleServiceFieldChange(idx, 'rate_per_day', v)} />
      ),
    },
    {
      title: 'Default Days', dataIndex: 'default_days', key: 'default_days',
      render: (val, record, idx) => (
        <InputNumber min={0} className="w-full" value={val ?? record.defaultDays ?? ''}
          onChange={(v) => handleServiceFieldChange(idx, 'default_days', v)} />
      ),
    },
    {
      title: '', key: 'save',
      render: (_, record) => (
        <Button size="small" type="primary"
          onClick={async () => { const ok = await saveService(record); if (ok) fetchServices(); }}>
          Save
        </Button>
      ),
    },
  ];

  function openEditInvalid(importLog, cust) {
    const importedYear = importLog.imported_at
      ? new Date(importLog.imported_at).getFullYear()
      : new Date().getFullYear();
    setEditContext({
      logId: importLog.id,
      customerId: cust.customer_id,
      customerName: cust.customer_name,
      year: importedYear,
      rows: (cust.entries_invalid || []).map((e, i) => ({
        key: String(i),
        service_name: e.service_name,
        original_raw_value: e.raw_value,
        raw_value: e.raw_value,
        error: e.error,
      })),
    });
    setEditModalOpen(true);
  }

  function updateEditRow(key, field, value) {
    setEditContext((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
      };
    });
  }

  async function saveInvalidFixes() {
    if (!editContext?.customerId || !editContext.rows?.length) return;
    setEditSaving(true);
    try {
      const res = await fetch(
        `${API_BASE}/billing/import/logs/${editContext.logId}/fix-invalid`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: editContext.customerId,
            year: editContext.year,
            fixes: editContext.rows.map((r) => ({
              service_name: r.service_name,
              raw_value: r.raw_value,
              original_raw_value: r.original_raw_value,
            })),
          }),
        },
      );
      if (res.status === 401) { handle401Error(); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(data.detail || 'Failed to save corrected entries');
        return;
      }
      if (data.parse_errors?.length) {
        message.warning(
          `${data.parse_errors.length} row(s) still invalid — check format and year`,
        );
      } else {
        message.success(
          `Added ${data.entries_added ?? 0} service entr${(data.entries_added ?? 0) === 1 ? 'y' : 'ies'}`,
        );
      }
      setEditModalOpen(false);
      setEditContext(null);
      await loadHistory();
    } catch (e) {
      message.error('Failed to save corrected entries');
    } finally {
      setEditSaving(false);
    }
  }

  // ── Expandable row renderer for the history table ────────────────────────

  function renderHistoryExpanded(record) {
    const changed = (record.customer_logs || []).filter(
      (l) => !l.is_error && ((l.entries_added?.length > 0) || hasInvalidEntries(l))
    );

    if (changed.length === 0) {
      return (
        <div style={{ margin: '6px 0 6px 40px', color: '#94a3b8', fontSize: 13 }}>
          No new entries — all data already existed.
        </div>
      );
    }

    const invalidCellCount = changed.reduce(
      (s, l) => s + (l.entries_invalid?.length ?? 0), 0
    );

    return (
      <div style={{ padding: '4px 0' }}>
        {invalidCellCount > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`${invalidCellCount} cell${invalidCellCount !== 1 ? 's' : ''} could not be parsed — use Edit to fix (add year when start month > end month, e.g. 12/5/2025-3/10/2026)`}
            style={{ marginBottom: 8, padding: '4px 12px', fontSize: 13 }}
          />
        )}
        <Table
          size="small"
          bordered
          dataSource={changed.map((l, i) => ({ ...l, key: i }))}
          columns={buildCustomerColumns((cust) => openEditInvalid(record, cust))}
          pagination={false}
          scroll={{ x: 700 }}
          onRow={(row) => (
            hasInvalidEntries(row) ? { style: { background: '#fefce8' } } : {}
          )}
          expandable={{
            expandedRowRender: (cust) => {
              const entryRows = buildCustomerEntryRows(cust);
              if (entryRows.length === 0) {
                return <div style={{ padding: '6px 8px', color: '#94a3b8', fontSize: 13 }}>No entries.</div>;
              }
              const totalBilled = (cust.entries_added || []).reduce(
                (s, e) => s + (Number(e.amount_billed) || 0), 0
              );
              const hasValid = (cust.entries_added?.length ?? 0) > 0;
              return (
                <Table
                  size="small"
                  bordered
                  dataSource={entryRows}
                  columns={entrySubColumns}
                  pagination={false}
                  scroll={{ x: 640 }}
                  onRow={(r) => (r._is_invalid ? { style: { background: '#fef2f2' } } : {})}
                  summary={hasValid ? () => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell colSpan={5} index={0} align="right">
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Total</span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="center">
                        <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{fmtMoney(totalBilled)}</span>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  ) : undefined}
                />
              );
            },
            rowExpandable: () => true,
          }}
        />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={activeView === 'import' ? 'max-w-[720px] mx-auto py-4' : 'w-full py-4 px-2 sm:px-4 lg:px-6'}>

      {/* ── View Toggle ──────────────────────────────────────────────────── */}
      <div className="flex justify-center mb-6">
        <Button.Group size="large">
          <Button
            type={activeView === 'import' ? 'primary' : 'default'}
            icon={<UploadOutlined />}
            onClick={() => setActiveView('import')}
          >
            Import Data
          </Button>
          <Button
            type={activeView === 'history' ? 'primary' : 'default'}
            icon={<HistoryOutlined />}
            onClick={() => { setActiveView('history'); }}
          >
            History
          </Button>
        </Button.Group>
      </div>

      {/* ── Google Sheets / Drive Sync Card ──────────────────────────────── */}
      {activeView === 'import' && <Card
        title={
          <span className="flex items-center gap-2 text-lg font-semibold">
            <GoogleOutlined style={{ color: '#0f9d58' }} />Sync from Google Sheets / Drive
          </span>
        }
        className="shadow-sm mb-6"
        styles={{ body: { padding: 24 } }}
      >
        <p className="text-gray-500 mb-3 mt-0">
          Paste a public Google&nbsp;Sheets or Drive file link. Click <b>Sync</b> to pull the
          latest data — only new or changed rows are added, so you can sync again any time you
          update the sheet.
        </p>

        <Space.Compact style={{ width: '100%' }} className="mb-3">
          <Input
            allowClear
            value={syncUrl}
            onChange={(e) => setSyncUrl(e.target.value)}
            onPressEnter={handleSync}
            disabled={syncing}
            placeholder="https://docs.google.com/spreadsheets/d/…  or  https://drive.google.com/file/d/…"
            prefix={<GoogleOutlined style={{ color: '#94a3b8' }} />}
          />
          <Button
            type="primary"
            icon={<SyncOutlined spin={syncing} />}
            onClick={handleSync}
            loading={syncing}
          >
            {syncing ? 'Syncing…' : 'Sync'}
          </Button>
        </Space.Compact>

        {syncResult && (
          <Alert
            type={syncResult.status}
            showIcon
            className="mb-1"
            closable
            onClose={() => setSyncResult(null)}
            message={syncResult.message}
            description={
              syncResult.data && (
                <div className="text-xs text-gray-500 mt-1">
                  {syncResult.data.filename && (
                    <div className="mb-1">
                      <FileExcelOutlined className="mr-1" />
                      <b>{syncResult.data.filename}</b>
                    </div>
                  )}
                  New customers: {syncResult.data.customers_inserted ?? 0}
                  {' · '}Entries added: {syncResult.data.entries_inserted ?? 0}
                  {(syncResult.data.entries_invalid_count ?? 0) > 0 && (
                    <span style={{ color: '#d97706', fontWeight: 600 }}>
                      {' · '}Invalid cells: {syncResult.data.entries_invalid_count}
                    </span>
                  )}
                </div>
              )
            }
          />
        )}

        <p className="text-xs text-gray-400 mt-2 mb-0">
          The sheet must be shared as “Anyone with the link” (Viewer). The link is saved
          automatically for next time.
        </p>
      </Card>}

      {/* ── Upload Card ──────────────────────────────────────────────────── */}
      {activeView === 'import' && <Card
        title={<span className="text-xl font-semibold">Import Billing Data</span>}
        className="shadow-sm mb-6"
        styles={{ body: { padding: 24 } }}
      >
        <p className="text-gray-500 mb-4 mt-0">
          Upload one or more files (.csv, .xlsx, .xls). Files are processed sequentially.
        </p>

        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 mb-4 bg-gray-50/50 hover:border-[#007bff]/40 transition-colors">
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange}
            disabled={uploading} multiple id="billing-file-input" className="sr-only" />
          <label htmlFor="billing-file-input"
            className="flex flex-col items-center justify-center cursor-pointer text-center">
            <InboxOutlined className="text-4xl text-gray-400 mb-2" />
            <span className="text-gray-600 font-medium">
              {files.length ? `${files.length} file(s) selected` : 'Click or drag files here'}
            </span>
            <span className="text-sm text-gray-400 mt-1">.csv, .xlsx, .xls</span>
          </label>
        </div>

        {files.length > 0 && (
          <Alert type="info" message={`${files.length} file(s) selected`}
            description={
              <ul className="list-disc pl-4 mb-0 mt-1 text-sm">
                {files.map((f, i) => <li key={i}>{f.name} ({(f.size / 1024).toFixed(1)} KB)</li>)}
              </ul>
            }
            className="mb-4"
          />
        )}

        <Button type="primary" icon={<UploadOutlined />} onClick={handleUpload}
          loading={uploading} disabled={!files.length} block size="large" className="mb-4">
          {uploading ? `Processing... ${currentFile || ''}` : `Upload ${files.length} file(s)`}
        </Button>

        {uploading && <div className="mb-4"><Progress percent={progress} showInfo status="active" /></div>}

        {error && (
          <Alert type="error" message={error} showIcon className="mb-4"
            closable onClose={() => setError('')} />
        )}

        {results.length > 0 && (
          <div className="mb-4">
            <List
              dataSource={results}
              renderItem={(result) => {
                const invalidCount = result.data?.entries_invalid_count ?? 0;
                const alertType = result.status === 'error'
                  ? 'error'
                  : invalidCount > 0
                    ? 'warning'
                    : 'success';
                return (
                <List.Item>
                  <Alert
                    type={alertType}
                    message={`${result.status === 'success' ? '✓' : '✗'} ${result.filename}`}
                    description={
                      <>
                        <div>{result.message}</div>
                        {result.data?.customers_inserted !== undefined && (
                          <div className="text-xs text-gray-500 mt-1">
                            New customers: {result.data.customers_inserted}
                            {' · '}Entries added: {result.data.entries_inserted}
                            {invalidCount > 0 && (
                              <span style={{ color: '#d97706', fontWeight: 600 }}>
                                {' · '}Invalid cells: {invalidCount}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    }
                    showIcon className="w-full"
                  />
                </List.Item>
                );
              }}
            />
          </div>
        )}

        <Collapse
          items={[{
            key: 'services',
            label: (
              <span className="flex items-center gap-2">
                <FileExcelOutlined />Manage Service Types & Prices
              </span>
            ),
            children: servicesLoading ? (
              <div className="py-8 text-center"><Spin tip="Loading services..." /></div>
            ) : (
              <>
                <Table dataSource={services} rowKey={(r, i) => r.id ?? `row-${i}`}
                  columns={serviceColumns} pagination={false} size="small" className="mb-3" />
                <Space>
                  <Button type="primary" onClick={saveAllServices}>Save All</Button>
                  <Button onClick={fetchServices}>Reload</Button>
                </Space>
              </>
            ),
          }]}
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
      </Card>}

      {/* ── Import History Card ───────────────────────────────────────────── */}
      {activeView === 'history' && <Card
        title={
          <span className="flex items-center gap-2 text-base font-semibold">
            <HistoryOutlined />Import History
          </span>
        }
        extra={
          <Space size={6}>
            <Button
              size="small"
              icon={groupByDate ? <BarsOutlined /> : <AppstoreOutlined />}
              type={groupByDate ? 'primary' : 'default'}
              onClick={() => setGroupByDate((g) => !g)}
            >
              {groupByDate ? 'List' : 'Group'}
            </Button>
            <Button icon={<ReloadOutlined />} size="small"
              onClick={loadHistory} loading={historyLoading}>
              Refresh
            </Button>
          </Space>
        }
        className="shadow-sm"
        style={{ overflow: 'hidden' }}
        styles={{ body: { padding: '12px 16px', overflowX: 'auto', width: '100%' } }}
      >
        {historyLoading ? (
          <div className="flex justify-center py-10"><Spin tip="Loading history..." /></div>
        ) : importHistory.length === 0 ? (
          <Empty description="No imports yet" className="py-10" />
        ) : groupByDate ? (
          /* ── Grouped by date ── */
          <Collapse accordion={false} size="small">
            {groupHistoryByDate(importHistory).map((group) => (
              <Collapse.Panel
                key={group.dateKey}
                header={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, minWidth: 220 }}>{group.label}</span>
                    <Tag color="geekblue">{group.importCount} import{group.importCount !== 1 ? 's' : ''}</Tag>
                    <span style={{ color: group.totalAdded > 0 ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
                      {group.totalAdded} added
                    </span>
                    <span style={{ color: group.totalSkipped > 0 ? '#d97706' : '#94a3b8' }}>
                      {group.totalSkipped} existed
                    </span>
                    {group.totalInvalid > 0 && (
                      <span style={{ color: '#d97706', fontWeight: 600 }}>
                        {group.totalInvalid} invalid
                      </span>
                    )}
                    <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                      {fmtMoney(group.totalBilled)}
                    </span>
                  </div>
                }
              >
                <div style={{ overflowX: 'auto' }}>
                  <Table
                    size="small"
                    bordered
                    dataSource={group.items.map((r) => ({ ...r, key: String(r.id) }))}
                    columns={historyColumns}
                    pagination={false}
                    scroll={{ x: 870 }}
                    expandable={{
                      expandedRowKeys: expandedHistoryKeys,
                      onExpandedRowsChange: (keys) => setExpandedHistoryKeys(keys),
                      expandedRowRender: renderHistoryExpanded,
                      rowExpandable: () => true,
                    }}
                  />
                </div>
              </Collapse.Panel>
            ))}
          </Collapse>
        ) : (
          /* ── Flat list ── */
          <Table
            size="small"
            bordered
            dataSource={importHistory.map((r) => ({ ...r, key: String(r.id) }))}
            columns={historyColumns}
            pagination={{
              pageSize: 20,
              showSizeChanger: false,
              showTotal: (t) => `${t} import${t !== 1 ? 's' : ''}`,
            }}
            scroll={{ x: 870 }}
            expandable={{
              expandedRowKeys: expandedHistoryKeys,
              onExpandedRowsChange: (keys) => setExpandedHistoryKeys(keys),
              expandedRowRender: renderHistoryExpanded,
              rowExpandable: () => true,
            }}
          />
        )}
      </Card>}

      <Modal
        title={editContext ? `Fix invalid data — ${editContext.customerName}` : 'Fix invalid data'}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setEditContext(null); }}
        onOk={saveInvalidFixes}
        okText="Save services"
        confirmLoading={editSaving}
        width={640}
        destroyOnClose
      >
        {editContext && (
          <>
            <p className="text-gray-500 text-sm mt-0 mb-3">
              Correct each value below. Use M/D/YYYY or M/D/YYYY-M/D/YYYY when the start month
              is after the end month (e.g. 12/5/2025-3/10/2026). H0038 uses M/D-N (e.g. 3/5-2).
            </p>
            <Form layout="inline" className="mb-4">
              <Form.Item label="Default year (for M/D without year)">
                <InputNumber
                  min={2000}
                  max={2100}
                  value={editContext.year}
                  onChange={(v) => setEditContext((prev) => prev && { ...prev, year: v })}
                />
              </Form.Item>
            </Form>
            <Table
              size="small"
              bordered
              pagination={false}
              dataSource={editContext.rows}
              rowKey="key"
              columns={[
                {
                  title: 'Service',
                  dataIndex: 'service_name',
                  width: 90,
                  render: (v) => <span style={{ fontWeight: 600 }}>{v}</span>,
                },
                {
                  title: 'Corrected value',
                  dataIndex: 'raw_value',
                  render: (v, row) => (
                    <Input
                      value={v}
                      onChange={(e) => updateEditRow(row.key, 'raw_value', e.target.value)}
                      placeholder="e.g. 3/15/2025 or 3/5-2"
                      status={row.error ? 'warning' : undefined}
                    />
                  ),
                },
                {
                  title: 'Issue',
                  dataIndex: 'error',
                  width: 200,
                  ellipsis: true,
                  render: (v) => (
                    <span style={{ fontSize: 11, color: '#b45309' }}>{v}</span>
                  ),
                },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}