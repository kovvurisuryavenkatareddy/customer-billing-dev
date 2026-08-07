/**
 * Reports page: filter service entries and export to Excel (.xlsx).
 * Uses the same base filters as Home and adds Service Code + Export Settings.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, CardHeader, CardContent, Button, FormControlLabel, Checkbox,
  Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, CircularProgress, Typography,
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import * as XLSX from 'xlsx';
import CustomerSearch from '../components/CustomerSearch';
import { API_BASE, getAuthHeaders, handle401Error } from '../utils/api';
import { formatMMDDYYYY } from '../utils/dates';

function normalizeForSearch(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fuzzyIncludes(haystack, needle) {
  const h = normalizeForSearch(haystack);
  const n = normalizeForSearch(needle);
  if (!n) return true;
  return h.includes(n);
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ReportsPage() {
  const [filters, setFilters] = useState({ status: 'active' });
  const [serviceName, setServiceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Fetch all entries (one row per entry) with server-side base filters (status/name/dob/date range).
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const { signal } = controller;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.firstName) params.append('firstName', filters.firstName);
        if (filters.lastName) params.append('lastName', filters.lastName);
        if (filters.startDate) params.append('start_date', filters.startDate);
        if (filters.endDate) params.append('end_date', filters.endDate);
        if (filters.dob) params.append('dob', filters.dob);
        params.append('status', filters.status || 'active');

        const res = await fetch(`${API_BASE}/customers/entries/all?${params.toString()}`, {
          headers: getAuthHeaders(),
          signal,
        });
        if (res.status === 401) {
          handle401Error();
          return;
        }
        if (!res.ok) throw new Error('Failed to load report data');
        const data = await res.json();
        if (!mounted) return;
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!mounted) return;
        if (e?.name === 'AbortError') return;
        console.warn('Reports fetch failed', e);
        setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }, 250);

    return () => {
      mounted = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (serviceName) {
      result = result.filter((r) =>
        fuzzyIncludes(r.service_name || r.serviceName || '', serviceName)
      );
    }
    if (selectedCustomerIds.length > 0) {
      const allowed = new Set(selectedCustomerIds.map((x) => Number(x)));
      result = result.filter((r) => allowed.has(Number(r.id)));
    }
    return result;
  }, [rows, serviceName, selectedCustomerIds]);

  const customerOptions = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const id = r.id;
      const first = (r.first_name || '').trim();
      const last = (r.last_name || '').trim();
      const label = `${first}${last ? ' ' + last : ''}`.trim() || `Customer ${id}`;
      if (id != null && !map.has(id)) map.set(id, { value: id, label });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const exportFieldDefs = useMemo(() => ([
    {
      key: 'customerName',
      label: 'Customer Name',
      required: true,
      get: (r) => `${(r.first_name || '').trim()} ${(r.last_name || '').trim()}`.trim(),
    },
    { key: 'dob', label: 'DOB', get: (r) => formatMMDDYYYY(r.date_of_birth || r.dob || r.dateOfBirth || '') },
    { key: 'status', label: 'Status', get: (r) => r.active_status || r.activeStatus || '' },
    { key: 'idNumber', label: 'ID #', get: (r) => r.id_number || '' },
    { key: 'fIdNumber', label: 'F ID #', get: (r) => r.f_id_number || '' },
    { key: 'serviceName', label: 'Service Name', get: (r) => r.service_name || r.serviceName || '' },
    { key: 'startDate', label: 'Start Date', get: (r) => formatMMDDYYYY(r.start_date || r.startDate || '') },
    { key: 'endDate', label: 'End Date', get: (r) => formatMMDDYYYY(r.end_date || r.endDate || '') },
    { key: 'days', label: 'Days', get: (r) => (r.days != null ? safeNumber(r.days) : '') },
    { key: 'ratePerDay', label: 'Rate/Day', get: (r) => safeNumber(r.rate_per_day ?? r.ratePerDay) },
    { key: 'amountBilled', label: 'Amount Billed', get: (r) => safeNumber(r.amount_billed ?? r.amountBilled) },
    { key: 'amountPaid', label: 'Amount Paid', get: (r) => safeNumber(r.amount_paid ?? r.amountPaid) },
    { key: 'due', label: 'Due', get: (r) => (safeNumber(r.amount_billed ?? r.amountBilled) - safeNumber(r.amount_paid ?? r.amountPaid)) },
    { key: 'paymentDate', label: 'Payment Date', get: (r) => formatMMDDYYYY(r.date_of_payment || r.dateOfPayment || '') },
    { key: 'dateSubmitted', label: 'Date Submitted', get: (r) => formatMMDDYYYY(r.date_submitted || r.dateSubmitted || '') },
    {
      key: 'denialCodes',
      label: 'Denial Codes',
      get: (r) => Array.isArray(r.denial_codes) ? r.denial_codes.join(', ') : (Array.isArray(r.denialCodes) ? r.denialCodes.join(', ') : ''),
    },
  ]), []);

  const allOptionalFieldKeys = useMemo(
    () => exportFieldDefs.filter((f) => !f.required).map((f) => f.key),
    [exportFieldDefs]
  );

  const [selectedFieldKeys, setSelectedFieldKeys] = useState(() => [
    'customerName',
    'serviceName',
    'startDate',
    'endDate',
    'amountBilled',
    'amountPaid',
    'due',
  ]);

  // Ensure required fields are always selected.
  useEffect(() => {
    const required = exportFieldDefs.filter((f) => f.required).map((f) => f.key);
    setSelectedFieldKeys((prev) => Array.from(new Set([...required, ...prev])));
  }, [exportFieldDefs]);

  const reportTotals = useMemo(() => {
    const billed = filteredRows.reduce((s, r) => s + safeNumber(r.amount_billed ?? r.amountBilled), 0);
    const paid = filteredRows.reduce((s, r) => s + safeNumber(r.amount_paid ?? r.amountPaid), 0);
    return { billed, paid, due: billed - paid };
  }, [filteredRows]);

  const toggleField = (key) => {
    setSelectedFieldKeys((prev) => {
      const required = exportFieldDefs.filter((f) => f.required).map((f) => f.key);
      const has = prev.includes(key);
      const next = has ? prev.filter((k) => k !== key) : [...prev, key];
      return Array.from(new Set([...next, ...required]));
    });
  };

  const exportToExcel = () => {
    const fieldsInOrder = exportFieldDefs.filter((f) => selectedFieldKeys.includes(f.key));
    const header = fieldsInOrder.map((f) => f.label);
    const body = filteredRows.map((r) => fieldsInOrder.map((f) => f.get(r)));

    const aoa = [
      header,
      ...body,
      [],
      ['Grand Total', reportTotals.billed],
      ['Total Paid', reportTotals.paid],
      ['Total Due', reportTotals.due],
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Set professional column widths so users don't have to resize.
    ws['!cols'] = fieldsInOrder.map((f) => {
      switch (f.key) {
        case 'customerName':
          return { wch: 24 };
        case 'serviceName':
          return { wch: 20 };
        case 'denialCodes':
          return { wch: 18 };
        case 'startDate':
        case 'endDate':
        case 'dob':
        case 'paymentDate':
        case 'dateSubmitted':
          return { wch: 12 };
        case 'idNumber':
        case 'fIdNumber':
          return { wch: 14 };
        case 'days':
          return { wch: 8 };
        case 'ratePerDay':
        case 'amountBilled':
        case 'amountPaid':
        case 'due':
          return { wch: 14 };
        default:
          return { wch: Math.max(10, f.label.length + 2) };
      }
    });

    // Apply simple styling to totals rows (background colors + bold).
    const totalsStartRow = body.length + 3; // 1-based (header = 1, body, blank, then totals)
    const totalsStyles = [
      { label: 'Grand Total', color: 'FFE2F0CB' }, // light green
      { label: 'Total Paid', color: 'FFDDEEFF' },  // light blue
      { label: 'Total Due', color: 'FFFDE2E2' },   // light red
    ];
    totalsStyles.forEach((style, index) => {
      const rowNumber = totalsStartRow + index; // 1-based
      const labelCellRef = XLSX.utils.encode_cell({ r: rowNumber - 1, c: 0 });
      const valueCellRef = XLSX.utils.encode_cell({ r: rowNumber - 1, c: 1 });
      const applyStyle = (ref) => {
        if (!ws[ref]) return;
        ws[ref].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: style.color } },
        };
      };
      applyStyle(labelCellRef);
      applyStyle(valueCellRef);
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    const filename = `report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const pagedRows = filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', mx: 'auto', p: { xs: 2, md: 4 }, boxSizing: 'border-box', overflowX: 'hidden' }}>
      <CustomerSearch
        onSearch={(f) => {
          setFilters({
            status: f.status || 'active',
            firstName: f.firstName || '',
            lastName: f.lastName || '',
            startDate: f.startDate || '',
            endDate: f.endDate || '',
            dob: f.dateOfBirth || '',
          });
        }}
        status={filters.status || 'active'}
        onStatusChange={(s) => setFilters((prev) => ({ ...prev, status: s }))}
        serviceName={serviceName}
        onServiceNameChange={(val) => { setServiceName(val); setPage(0); }}
        customerOptions={customerOptions}
        selectedCustomerIds={selectedCustomerIds}
        onSelectedCustomerIdsChange={(vals) => { setSelectedCustomerIds(vals); setPage(0); }}
      />

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <CardHeader
          title={<Typography variant="h6" fontWeight={600}>Export Settings</Typography>}
          action={
            <Button
              variant="contained" startIcon={<DescriptionIcon />}
              onClick={exportToExcel}
              disabled={loading || filteredRows.length === 0}
            >
              Export Excel
            </Button>
          }
        />
        <CardContent sx={{ pt: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Customer Name is mandatory. Selected fields become the exported Excel columns.
          </Typography>
          <Grid container spacing={1}>
            {exportFieldDefs.map((f) => (
              <Grid key={f.key} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={selectedFieldKeys.includes(f.key)}
                      disabled={Boolean(f.required)}
                      onChange={() => toggleField(f.key)}
                    />
                  }
                  label={`${f.label}${f.required ? ' (required)' : ''}`}
                />
              </Grid>
            ))}
          </Grid>
          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" onClick={() => setSelectedFieldKeys(Array.from(new Set(['customerName', ...allOptionalFieldKeys])))}>
              Select all
            </Button>
            <Button size="small" variant="outlined" onClick={() => setSelectedFieldKeys(['customerName', 'serviceName', 'startDate', 'endDate', 'amountBilled', 'amountPaid', 'due'])}>
              Reset defaults
            </Button>
          </Box>
        </CardContent>
      </Paper>

      <Paper variant="outlined">
        <CardHeader
          title={<Typography variant="h6" fontWeight={600}>Report Results</Typography>}
          action={
            <Typography variant="caption" color="text.secondary">
              Rows: {filteredRows.length} · Billed: ${reportTotals.billed.toFixed(2)} · Paid: ${reportTotals.paid.toFixed(2)} · Due: ${reportTotals.due.toFixed(2)}
            </Typography>
          }
        />
        <CardContent sx={{ pt: 0, position: 'relative' }}>
          {loading && (
            <Box sx={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'rgba(255,255,255,0.7)', zIndex: 1,
            }}>
              <CircularProgress size={28} />
            </Box>
          )}
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 800 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell>DOB</TableCell>
                  <TableCell>Service Name</TableCell>
                  <TableCell>Period</TableCell>
                  <TableCell align="right">Billed</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell align="right">Due</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedRows.map((r) => {
                  const s = formatMMDDYYYY(r.start_date || r.startDate || '') || '';
                  const e = formatMMDDYYYY(r.end_date || r.endDate || '') || '';
                  const period = !s && !e ? '—' : (s && e ? `${s} - ${e}` : (s || e));
                  return (
                    <TableRow key={`${r.id}-${r.entry_id ?? r.entryId ?? r.service_id ?? ''}-${r.batch_id ?? ''}`} hover>
                      <TableCell>{`${(r.first_name || '').trim()} ${(r.last_name || '').trim()}`.trim() || '—'}</TableCell>
                      <TableCell>{formatMMDDYYYY(r.date_of_birth || '') || '—'}</TableCell>
                      <TableCell>{r.service_name || r.serviceName || '—'}</TableCell>
                      <TableCell>{period}</TableCell>
                      <TableCell align="right">${safeNumber(r.amount_billed ?? r.amountBilled).toFixed(2)}</TableCell>
                      <TableCell align="right">${safeNumber(r.amount_paid ?? r.amountPaid).toFixed(2)}</TableCell>
                      <TableCell align="right">
                        ${(safeNumber(r.amount_billed ?? r.amountBilled) - safeNumber(r.amount_paid ?? r.amountPaid)).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {pagedRows.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                      No records found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredRows.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[20, 50, 100, 200]}
          />
        </CardContent>
      </Paper>
    </Box>
  );
}
