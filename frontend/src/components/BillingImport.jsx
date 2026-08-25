/**
 * Import Billing Data — upload + persistent import history from the database.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box, Paper, Button, ButtonGroup, LinearProgress, Alert, List, ListItem,
  Accordion, AccordionSummary, AccordionDetails, TextField, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TablePagination, IconButton,
  CircularProgress, Chip, Tooltip, Typography, Dialog, DialogTitle, DialogContent,
  DialogActions, Collapse, Link as MuiLink,
} from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import DescriptionIcon from '@mui/icons-material/Description';
import InboxIcon from '@mui/icons-material/Inbox';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import EditIcon from '@mui/icons-material/Edit';
import SyncIcon from '@mui/icons-material/Sync';
import GoogleIcon from '@mui/icons-material/Google';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
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

// ─── Level 3 — individual service entries inside a customer ──────────────────

function EntriesTable({ rows }) {
  const totalBilled = rows
    .filter((r) => !r._is_invalid)
    .reduce((s, e) => s + (Number(e.amount_billed) || 0), 0);
  const hasValid = rows.some((r) => !r._is_invalid);

  if (rows.length === 0) {
    return <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 0.75, display: 'block' }}>No entries.</Typography>;
  }

  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 80 }}>Service</TableCell>
            <TableCell sx={{ width: 130 }}>Start Date</TableCell>
            <TableCell sx={{ width: 100 }}>End Date</TableCell>
            <TableCell align="center" sx={{ width: 64 }}>Days/Units</TableCell>
            <TableCell align="center" sx={{ width: 80 }}>Rate/Day</TableCell>
            <TableCell align="center" sx={{ width: 110 }}>Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key} sx={r._is_invalid ? { bgcolor: '#fef2f2' } : undefined}>
              <TableCell sx={r._is_invalid ? { color: '#dc2626', fontWeight: 600 } : undefined}>
                {r.service_name}
              </TableCell>
              <TableCell
                sx={r._is_invalid ? { color: '#dc2626', fontFamily: 'monospace', fontSize: 12 } : undefined}
                title={r._is_invalid ? r._error : undefined}
              >
                {r._is_invalid ? r.start_date : fmtDate(r.start_date)}
              </TableCell>
              <TableCell sx={r._is_invalid ? { color: '#94a3b8' } : undefined}>
                {r._is_invalid ? '—' : fmtDate(r.end_date)}
              </TableCell>
              <TableCell align="center" sx={r._is_invalid ? { color: '#94a3b8' } : undefined}>
                {r._is_invalid ? '—' : ((r.units != null && r.units !== '') ? `${r.units}u` : r.days)}
              </TableCell>
              <TableCell align="center" sx={r._is_invalid ? { color: '#94a3b8' } : undefined}>
                {r._is_invalid ? '—' : fmtMoney(r.rate_per_day)}
              </TableCell>
              <TableCell align="center">
                {r._is_invalid
                  ? <Chip size="small" color="error" label="Invalid format" sx={{ fontSize: 11 }} />
                  : <Box component="span" sx={{ fontWeight: 600 }}>{fmtMoney(r.amount_billed)}</Box>}
              </TableCell>
            </TableRow>
          ))}
          {hasValid && (
            <TableRow>
              <TableCell colSpan={5} align="right" sx={{ borderBottom: 0 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={500}>Total</Typography>
              </TableCell>
              <TableCell align="center" sx={{ borderBottom: 0 }}>
                <Box component="span" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{fmtMoney(totalBilled)}</Box>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ─── Level 2 — customers inside one import session ────────────────────────────

function CustomerRow({ record, onEditInvalid }) {
  const [open, setOpen] = useState(false);
  const entryRows = buildCustomerEntryRows(record);

  return (
    <>
      <TableRow hover sx={hasInvalidEntries(record) ? { bgcolor: '#fefce8' } : undefined}>
        <TableCell sx={{ width: 32 }}>
          <IconButton size="small" onClick={() => setOpen((o) => !o)}>
            {open ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ fontWeight: 600 }}>{record.customer_name}</TableCell>
        <TableCell align="center">
          {record.is_new_customer
            ? <Chip size="small" color="success" label="New" />
            : <Chip size="small" color="info" label="Existing" />}
        </TableCell>
        <TableCell align="center">
          <Box component="span" sx={{ color: record.entries_added?.length > 0 ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
            {record.entries_added?.length ?? 0}
          </Box>
        </TableCell>
        <TableCell align="center">
          <Box component="span" sx={{ color: record.entries_skipped > 0 ? '#d97706' : '#94a3b8' }}>
            {record.entries_skipped}
          </Box>
        </TableCell>
        <TableCell align="center">
          {(record.entries_invalid?.length ?? 0) === 0
            ? <Box component="span" sx={{ color: '#94a3b8' }}>—</Box>
            : <Chip size="small" color="warning" label={`${record.entries_invalid.length} invalid`} sx={{ fontSize: 11 }} />}
        </TableCell>
        <TableCell align="center">
          <Box component="span" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
            {fmtMoney((record.entries_added || []).reduce((s, e) => s + (Number(e.amount_billed) || 0), 0))}
          </Box>
        </TableCell>
        <TableCell align="center">
          {hasInvalidEntries(record) && (
            <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={(e) => { e.stopPropagation(); onEditInvalid(record); }}>
              Edit
            </Button>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={8} sx={{ p: 0, borderBottom: open ? undefined : 0 }}>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ py: 1, px: 1 }}>
              <EntriesTable rows={entryRows} />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function CustomerLogsTable({ changed, onEditInvalid }) {
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 700 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 32 }} />
            <TableCell sx={{ width: 70 }}>Customer</TableCell>
            <TableCell align="center" sx={{ width: 75 }}>Status</TableCell>
            <TableCell align="center" sx={{ width: 58 }}>Added</TableCell>
            <TableCell align="center" sx={{ width: 60 }}>Existed</TableCell>
            <TableCell align="center" sx={{ width: 88 }}>Issues</TableCell>
            <TableCell align="center" sx={{ width: 110 }}>Total Billed</TableCell>
            <TableCell align="center" sx={{ width: 72 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {changed.map((l, i) => (
            <CustomerRow key={i} record={l} onEditInvalid={onEditInvalid} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ─── Level 1 — one row per import session ─────────────────────────────────────

function FileCell({ record }) {
  const isGoogle = record.source_type === 'google';
  const name = record.filename || 'Untitled';
  return (
    <Box sx={{ minWidth: 0 }}>
      <Tooltip title={`${isGoogle ? 'Google Sync' : 'Excel upload'} — ${name}`}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          {isGoogle
            ? <GoogleIcon fontSize="small" sx={{ color: '#0f9d58', flexShrink: 0 }} />
            : <DescriptionIcon fontSize="small" sx={{ color: '#1d6f42', flexShrink: 0 }} />}
          {isGoogle && (
            <Chip size="small" color="success" label="Google Sync" sx={{ fontSize: 10, height: 18, flexShrink: 0 }} />
          )}
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </Box>
        </Box>
      </Tooltip>
      {isGoogle && record.source_url && (
        <MuiLink
          href={record.source_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          sx={{
            display: 'block', fontSize: 11, mt: 0.25, ml: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260,
          }}
        >
          {record.source_url}
        </MuiLink>
      )}
    </Box>
  );
}

function HistoryRow({ record, expanded, onToggle, onEditInvalid }) {
  const changed = (record.customer_logs || []).filter(
    (l) => !l.is_error && ((l.entries_added?.length > 0) || hasInvalidEntries(l))
  );
  const invalidCellCount = changed.reduce((s, l) => s + (l.entries_invalid?.length ?? 0), 0);

  return (
    <>
      <TableRow hover>
        <TableCell sx={{ width: 32 }}>
          <IconButton size="small" onClick={onToggle}>
            {expanded ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ width: 160 }}>{fmtDateTime(record.imported_at)}</TableCell>
        <TableCell sx={{ width: 260 }}><FileCell record={record} /></TableCell>
        <TableCell align="center" sx={{ width: 50 }}>
          <Box component="span" sx={{ color: record.customers_new > 0 ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
            {record.customers_new}
          </Box>
        </TableCell>
        <TableCell align="center" sx={{ width: 58 }}>
          <Box component="span" sx={{ color: record.entries_added > 0 ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
            {record.entries_added}
          </Box>
        </TableCell>
        <TableCell align="center" sx={{ width: 62 }}>
          <Box component="span" sx={{ color: record.entries_skipped > 0 ? '#d97706' : '#94a3b8' }}>
            {record.entries_skipped}
          </Box>
        </TableCell>
        <TableCell align="center" sx={{ width: 68 }}>
          {countInvalidCells(record) === 0
            ? <Box component="span" sx={{ color: '#94a3b8' }}>—</Box>
            : <Chip size="small" color="warning" label={countInvalidCells(record)} sx={{ fontWeight: 600 }} />}
        </TableCell>
        <TableCell align="right" sx={{ width: 110 }}>
          <Box component="span" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{fmtMoney(record.total_billed)}</Box>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={8} sx={{ p: 0, borderBottom: expanded ? undefined : 0 }}>
          <Collapse in={expanded} unmountOnExit>
            <Box sx={{ py: 1 }}>
              {changed.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ ml: 5, my: 0.75 }}>
                  No new entries — all data already existed.
                </Typography>
              ) : (
                <>
                  {invalidCellCount > 0 && (
                    <Alert severity="warning" sx={{ mb: 1, fontSize: 13 }}>
                      {invalidCellCount} cell{invalidCellCount !== 1 ? 's' : ''} could not be parsed — use Edit to fix
                      (add year when start month &gt; end month, e.g. 12/5/2025-3/10/2026)
                    </Alert>
                  )}
                  <CustomerLogsTable changed={changed} onEditInvalid={(cust) => onEditInvalid(record, cust)} />
                </>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function HistoryTable({ rows, expandedKeys, onToggle, onEditInvalid, pagination }) {
  return (
    <Box>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 870 }} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 32 }} />
              <TableCell>Date &amp; Time (EST)</TableCell>
              <TableCell>File</TableCell>
              <TableCell align="center">New</TableCell>
              <TableCell align="center">Added</TableCell>
              <TableCell align="center">Existed</TableCell>
              <TableCell align="center">Invalid</TableCell>
              <TableCell align="right">Total Billed</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <HistoryRow
                key={r.key}
                record={r}
                expanded={expandedKeys.includes(r.key)}
                onToggle={() => onToggle(r.key)}
                onEditInvalid={onEditInvalid}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {pagination}
    </Box>
  );
}

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
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(20);

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
  // Once a link is saved/synced, hide the raw URL input behind a compact
  // "connected" state so the pasted link doesn't just sit there confusingly.
  const [syncUrlConfigured, setSyncUrlConfigured] = useState(false);

  useEffect(() => { loadHistory(); loadSyncConfig(); }, []);

  async function loadSyncConfig() {
    try {
      const res = await fetch(`${API_BASE}/billing/sync/config`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data?.sync_url) {
          setSyncUrl(data.sync_url);
          setSyncUrlConfigured(true);
        }
      }
    } catch (e) {
      console.warn('Could not load sync config', e);
    }
  }

  async function handleSync() {
    const url = syncUrl.trim();
    if (!url) { window.showToast?.({ message: 'Paste a Google Sheets or Drive link first.', type: 'warning' }); return; }
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
      setSyncUrlConfigured(true);
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
        window.showToast?.({ message: data.detail || 'Failed to save corrected entries', type: 'error' });
        return;
      }
      if (data.parse_errors?.length) {
        window.showToast?.({ message: `${data.parse_errors.length} row(s) still invalid — check format and year`, type: 'warning' });
      } else {
        window.showToast?.({
          message: `Added ${data.entries_added ?? 0} service entr${(data.entries_added ?? 0) === 1 ? 'y' : 'ies'}`,
          type: 'success',
        });
      }
      setEditModalOpen(false);
      setEditContext(null);
      await loadHistory();
    } catch (e) {
      window.showToast?.({ message: 'Failed to save corrected entries', type: 'error' });
    } finally {
      setEditSaving(false);
    }
  }

  function toggleHistoryKey(key) {
    setExpandedHistoryKeys((prev) => (
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    ));
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const historyRows = importHistory.map((r) => ({ ...r, key: String(r.id) }));
  const pagedHistoryRows = historyRows.slice(
    historyPage * historyRowsPerPage, historyPage * historyRowsPerPage + historyRowsPerPage
  );

  return (
    <Box sx={{ maxWidth: activeView === 'import' ? 720 : '100%', mx: 'auto', py: 2, px: activeView === 'import' ? 0 : { xs: 1, sm: 2, lg: 3 } }}>

      {/* ── View Toggle ──────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
        <ButtonGroup size="large">
          <Button
            variant={activeView === 'import' ? 'contained' : 'outlined'}
            startIcon={<UploadIcon />}
            onClick={() => setActiveView('import')}
          >
            Import Data
          </Button>
          <Button
            variant={activeView === 'history' ? 'contained' : 'outlined'}
            startIcon={<HistoryIcon />}
            onClick={() => setActiveView('history')}
          >
            History
          </Button>
        </ButtonGroup>
      </Box>

      {/* ── Google Sheets / Drive Sync Card ──────────────────────────────── */}
      {activeView === 'import' && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <GoogleIcon sx={{ color: '#0f9d58' }} />Sync from Google Sheets / Drive
          </Typography>

          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Paste a public Google&nbsp;Sheets or Drive file link. Click <strong>Sync</strong> to pull the
            latest data — only new or changed rows are added, so you can sync again any time you
            update the sheet.
          </Typography>

          {syncUrlConfigured ? (
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, p: 1.25,
              border: '1px solid #e2e8f0', borderRadius: 1.5, bgcolor: '#f8fafc',
            }}>
              <GoogleIcon fontSize="small" sx={{ color: '#0f9d58', flexShrink: 0 }} />
              <MuiLink
                href={syncUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {syncUrl}
              </MuiLink>
              <Button
                size="small"
                onClick={() => { setSyncUrl(''); setSyncUrlConfigured(false); }}
                sx={{ whiteSpace: 'nowrap' }}
              >
                Clear
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<SyncIcon sx={syncing ? { animation: 'spin 1s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } } : undefined} />}
                onClick={handleSync}
                loading={syncing}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {syncing ? 'Syncing…' : 'Sync'}
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              <TextField
                fullWidth
                value={syncUrl}
                onChange={(e) => setSyncUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSync()}
                disabled={syncing}
                autoFocus
                placeholder="https://docs.google.com/spreadsheets/d/…  or  https://drive.google.com/file/d/…"
                slotProps={{ input: { startAdornment: <GoogleIcon fontSize="small" sx={{ color: 'text.disabled', mr: 1 }} /> } }}
              />
              <Button
                variant="contained"
                startIcon={<SyncIcon sx={syncing ? { animation: 'spin 1s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } } : undefined} />}
                onClick={handleSync}
                loading={syncing}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {syncing ? 'Syncing…' : 'Sync'}
              </Button>
            </Box>
          )}

          {syncResult && (
            <Alert severity={syncResult.status} onClose={() => setSyncResult(null)} sx={{ mb: 1 }}>
              <Box>{syncResult.message}</Box>
              {syncResult.data && (
                <Box sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
                  {syncResult.data.filename && (
                    <Box sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <DescriptionIcon sx={{ fontSize: 14 }} />
                      <strong>{syncResult.data.filename}</strong>
                    </Box>
                  )}
                  New customers: {syncResult.data.customers_inserted ?? 0}
                  {' · '}Entries added: {syncResult.data.entries_inserted ?? 0}
                  {(syncResult.data.entries_invalid_count ?? 0) > 0 && (
                    <Box component="span" sx={{ color: '#d97706', fontWeight: 600 }}>
                      {' · '}Invalid cells: {syncResult.data.entries_invalid_count}
                    </Box>
                  )}
                </Box>
              )}
            </Alert>
          )}

          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
            The sheet must be shared as "Anyone with the link" (Viewer). The link is saved automatically for next time.
          </Typography>
        </Paper>
      )}

      {/* ── Upload Card ──────────────────────────────────────────────────── */}
      {activeView === 'import' && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>Import Billing Data</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Upload one or more files (.csv, .xlsx, .xls). Files are processed sequentially.
          </Typography>

          <Box
            sx={{
              border: '2px dashed #e5e7eb', borderRadius: 2, p: 3, mb: 2, bgcolor: '#f9fafb80',
              transition: 'border-color .2s', '&:hover': { borderColor: 'rgba(0,123,255,0.4)' },
            }}
          >
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange}
              disabled={uploading} multiple id="billing-file-input" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }} />
            <Box component="label" htmlFor="billing-file-input"
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', textAlign: 'center' }}>
              <InboxIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary" fontWeight={500}>
                {files.length ? `${files.length} file(s) selected` : 'Click or drag files here'}
              </Typography>
              <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>.csv, .xlsx, .xls</Typography>
            </Box>
          </Box>

          {files.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Box sx={{ mb: 0.5 }}>{files.length} file(s) selected</Box>
              <Box component="ul" sx={{ m: 0, pl: 2, fontSize: 14 }}>
                {files.map((f, i) => <li key={i}>{f.name} ({(f.size / 1024).toFixed(1)} KB)</li>)}
              </Box>
            </Alert>
          )}

          <Button
            variant="contained" fullWidth size="large" startIcon={<UploadIcon />}
            onClick={handleUpload} loading={uploading} disabled={!files.length} sx={{ mb: 2 }}
          >
            {uploading ? `Processing... ${currentFile || ''}` : `Upload ${files.length} file(s)`}
          </Button>

          {uploading && <Box sx={{ mb: 2 }}><LinearProgress variant="determinate" value={progress} /></Box>}

          {error && (
            <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>
          )}

          {results.length > 0 && (
            <List sx={{ mb: 2 }}>
              {results.map((result, idx) => {
                const invalidCount = result.data?.entries_invalid_count ?? 0;
                const severity = result.status === 'error' ? 'error' : invalidCount > 0 ? 'warning' : 'success';
                return (
                  <ListItem key={idx} sx={{ px: 0 }}>
                    <Alert severity={severity} sx={{ width: '100%' }}>
                      <Box sx={{ fontWeight: 600 }}>{result.status === 'success' ? '✓' : '✗'} {result.filename}</Box>
                      <Box>{result.message}</Box>
                      {result.data?.customers_inserted !== undefined && (
                        <Box sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
                          New customers: {result.data.customers_inserted}
                          {' · '}Entries added: {result.data.entries_inserted}
                          {invalidCount > 0 && (
                            <Box component="span" sx={{ color: '#d97706', fontWeight: 600 }}>
                              {' · '}Invalid cells: {invalidCount}
                            </Box>
                          )}
                        </Box>
                      )}
                    </Alert>
                  </ListItem>
                );
              })}
            </List>
          )}

          <Accordion
            expanded={showServiceManager}
            onChange={(_, expanded) => {
              if (expanded && !showServiceManager) fetchServices();
              setShowServiceManager(expanded);
            }}
            variant="outlined"
            sx={{ '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DescriptionIcon fontSize="small" />
                <Typography variant="body2">Manage Service Types &amp; Prices</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {servicesLoading ? (
                <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>
              ) : (
                <>
                  <TableContainer sx={{ mb: 1.5 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Name</TableCell>
                          <TableCell>Rate/Day ($)</TableCell>
                          <TableCell>Default Days</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {services.map((s, idx) => (
                          <TableRow key={s.id ?? `row-${idx}`}>
                            <TableCell>
                              <TextField
                                size="small" fullWidth value={s.name || ''}
                                onChange={(e) => handleServiceFieldChange(idx, 'name', e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <TextField
                                size="small" fullWidth type="number"
                                value={s.rate_per_day ?? s.ratePerDay ?? ''}
                                onChange={(e) => handleServiceFieldChange(idx, 'rate_per_day', e.target.value)}
                                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                              />
                            </TableCell>
                            <TableCell>
                              <TextField
                                size="small" fullWidth type="number"
                                value={s.default_days ?? s.defaultDays ?? ''}
                                onChange={(e) => handleServiceFieldChange(idx, 'default_days', e.target.value)}
                                slotProps={{ htmlInput: { min: 0 } }}
                              />
                            </TableCell>
                            <TableCell>
                              <Button size="small" variant="contained"
                                onClick={async () => { const ok = await saveService(s); if (ok) fetchServices(); }}>
                                Save
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" onClick={saveAllServices}>Save All</Button>
                    <Button variant="outlined" onClick={fetchServices}>Reload</Button>
                  </Box>
                </>
              )}
            </AccordionDetails>
          </Accordion>

          <Box component="ul" sx={{ fontSize: 14, color: 'text.secondary', mt: 2, pl: 2.5 }}>
            <li>Use Ctrl+Click (Windows) or Cmd+Click (Mac) to select multiple files</li>
            <li>Accepted formats: .csv, .xlsx, .xls</li>
          </Box>
        </Paper>
      )}

      {/* ── Import History Card ───────────────────────────────────────────── */}
      {activeView === 'history' && (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
            px: 2, py: 1.5, borderBottom: '1px solid #e2e8f0',
          }}>
            <Typography variant="body1" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <HistoryIcon fontSize="small" />Import History
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant={groupByDate ? 'contained' : 'outlined'}
                startIcon={groupByDate ? <ViewListIcon fontSize="small" /> : <GridViewIcon fontSize="small" />}
                onClick={() => setGroupByDate((g) => !g)}
              >
                {groupByDate ? 'List' : 'Group'}
              </Button>
              <Button size="small" variant="outlined" startIcon={<RefreshIcon fontSize="small" />}
                onClick={loadHistory} loading={historyLoading}>
                Refresh
              </Button>
            </Box>
          </Box>

          <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
            {historyLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><CircularProgress /></Box>
            ) : importHistory.length === 0 ? (
              <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
                <InboxIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography>No imports yet</Typography>
              </Box>
            ) : groupByDate ? (
              /* ── Grouped by date ── */
              groupHistoryByDate(importHistory).map((group) => (
                <Accordion key={group.dateKey} variant="outlined" sx={{ mb: 1, '&:before': { display: 'none' } }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <Typography fontWeight={600} sx={{ minWidth: 220 }}>{group.label}</Typography>
                      <Chip size="small" color="primary" label={`${group.importCount} import${group.importCount !== 1 ? 's' : ''}`} />
                      <Box component="span" sx={{ color: group.totalAdded > 0 ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
                        {group.totalAdded} added
                      </Box>
                      <Box component="span" sx={{ color: group.totalSkipped > 0 ? '#d97706' : '#94a3b8' }}>
                        {group.totalSkipped} existed
                      </Box>
                      {group.totalInvalid > 0 && (
                        <Box component="span" sx={{ color: '#d97706', fontWeight: 600 }}>{group.totalInvalid} invalid</Box>
                      )}
                      <Box component="span" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{fmtMoney(group.totalBilled)}</Box>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <HistoryTable
                      rows={group.items.map((r) => ({ ...r, key: String(r.id) }))}
                      expandedKeys={expandedHistoryKeys}
                      onToggle={toggleHistoryKey}
                      onEditInvalid={openEditInvalid}
                    />
                  </AccordionDetails>
                </Accordion>
              ))
            ) : (
              /* ── Flat list ── */
              <HistoryTable
                rows={pagedHistoryRows}
                expandedKeys={expandedHistoryKeys}
                onToggle={toggleHistoryKey}
                onEditInvalid={openEditInvalid}
                pagination={
                  <TablePagination
                    component="div"
                    count={historyRows.length}
                    page={historyPage}
                    onPageChange={(_, p) => setHistoryPage(p)}
                    rowsPerPage={historyRowsPerPage}
                    onRowsPerPageChange={(e) => { setHistoryRowsPerPage(parseInt(e.target.value, 10)); setHistoryPage(0); }}
                    rowsPerPageOptions={[20]}
                    labelDisplayedRows={({ from, to, count }) => `${from}-${to} of ${count} import${count !== 1 ? 's' : ''}`}
                  />
                }
              />
            )}
          </Box>
        </Paper>
      )}

      <Dialog open={editModalOpen} onClose={() => { setEditModalOpen(false); setEditContext(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editContext ? `Fix invalid data — ${editContext.customerName}` : 'Fix invalid data'}</DialogTitle>
        <DialogContent dividers>
          {editContext && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Correct each value below. Use M/D/YYYY or M/D/YYYY-M/D/YYYY when the start month
                is after the end month (e.g. 12/5/2025-3/10/2026). H0038 uses M/D-N (e.g. 3/5-2).
              </Typography>
              <TextField
                type="number"
                label="Default year (for M/D without year)"
                value={editContext.year}
                onChange={(e) => setEditContext((prev) => prev && { ...prev, year: Number(e.target.value) })}
                slotProps={{ htmlInput: { min: 2000, max: 2100 } }}
                sx={{ mb: 2, width: 320 }}
              />
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 90 }}>Service</TableCell>
                      <TableCell>Corrected value</TableCell>
                      <TableCell sx={{ width: 200 }}>Issue</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {editContext.rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell sx={{ fontWeight: 600 }}>{row.service_name}</TableCell>
                        <TableCell>
                          <TextField
                            fullWidth size="small"
                            value={row.raw_value}
                            onChange={(e) => updateEditRow(row.key, 'raw_value', e.target.value)}
                            placeholder="e.g. 3/15/2025 or 3/5-2"
                            color={row.error ? 'warning' : undefined}
                            focused={row.error ? true : undefined}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 11, color: '#b45309' }}>{row.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setEditModalOpen(false); setEditContext(null); }}>Cancel</Button>
          <Button variant="contained" onClick={saveInvalidFixes} loading={editSaving}>Save services</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
