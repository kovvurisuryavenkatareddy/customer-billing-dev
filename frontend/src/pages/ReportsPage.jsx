/**
 * Reports page: filter service entries and export to Excel (.xlsx).
 * Uses the same base filters as Home and adds Service Code + Export Settings.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Button, Checkbox, Row, Col, Space, Spin } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import CustomerSearch from '../components/CustomerSearch';
import { API_BASE, getAuthHeaders, handle401Error } from '../utils/api';
import { formatMMDDYYYY } from '../utils/dates';

function extractServiceCode(value) {
  if (!value) return '';
  const m = String(value).toUpperCase().match(/\bH\d{4}\b/);
  return m ? m[0] : '';
}

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
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

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
    { key: 'days', label: 'Days', get: (r) => r.days ?? '' },
    { key: 'ratePerDay', label: 'Rate/Day', get: (r) => safeNumber(r.rate_per_day ?? r.ratePerDay).toFixed(2) },
    { key: 'amountBilled', label: 'Amount Billed', get: (r) => safeNumber(r.amount_billed ?? r.amountBilled).toFixed(2) },
    { key: 'amountPaid', label: 'Amount Paid', get: (r) => safeNumber(r.amount_paid ?? r.amountPaid).toFixed(2) },
    { key: 'due', label: 'Due', get: (r) => (safeNumber(r.amount_billed ?? r.amountBilled) - safeNumber(r.amount_paid ?? r.amountPaid)).toFixed(2) },
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

  const tableColumns = useMemo(() => ([
    {
      title: 'Customer',
      key: 'customer',
      render: (_, r) => `${(r.first_name || '').trim()} ${(r.last_name || '').trim()}`.trim() || '—',
    },
    { title: 'DOB', key: 'dob', render: (_, r) => formatMMDDYYYY(r.date_of_birth || '') || '—' },
    { title: 'Service Name', key: 'svc', render: (_, r) => (r.service_name || r.serviceName || '—') },
    {
      title: 'Period',
      key: 'period',
      render: (_, r) => {
        const s = formatMMDDYYYY(r.start_date || r.startDate || '') || '—';
        const e = formatMMDDYYYY(r.end_date || r.endDate || '') || '—';
        return `${s} - ${e}`;
      },
    },
    {
      title: 'Billed',
      key: 'billed',
      align: 'right',
      render: (_, r) => `$${safeNumber(r.amount_billed ?? r.amountBilled).toFixed(2)}`,
    },
    {
      title: 'Paid',
      key: 'paid',
      align: 'right',
      render: (_, r) => `$${safeNumber(r.amount_paid ?? r.amountPaid).toFixed(2)}`,
    },
    {
      title: 'Due',
      key: 'due',
      align: 'right',
      render: (_, r) => `$${(safeNumber(r.amount_billed ?? r.amountBilled) - safeNumber(r.amount_paid ?? r.amountPaid)).toFixed(2)}`,
    },
  ]), []);

  const exportToExcel = () => {
    const fieldsInOrder = exportFieldDefs.filter((f) => selectedFieldKeys.includes(f.key));
    const header = fieldsInOrder.map((f) => f.label);
    const body = filteredRows.map((r) => fieldsInOrder.map((f) => f.get(r)));

    const aoa = [
      header,
      ...body,
      [],
      ['Grand Total', '', '', '', reportTotals.billed.toFixed(2)],
      ['Total Paid', '', '', '', reportTotals.paid.toFixed(2)],
      ['Total Due', '', '', '', reportTotals.due.toFixed(2)],
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    const filename = `report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="w-full max-w-full mx-auto p-4 md:p-8 box-border overflow-x-hidden">
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
        onServiceNameChange={(val) => {
          setServiceName(val);
          setPagination((p) => ({ ...p, current: 1 }));
        }}
        customerOptions={customerOptions}
        selectedCustomerIds={selectedCustomerIds}
        onSelectedCustomerIdsChange={(vals) => {
          setSelectedCustomerIds(vals);
          setPagination((p) => ({ ...p, current: 1 }));
        }}
      />

      <Card className="mb-4 shadow-sm border border-slate-200" title="Export Settings" extra={
        <Space>
          <Button
            icon={<FileExcelOutlined />}
            type="primary"
            onClick={exportToExcel}
            disabled={loading || filteredRows.length === 0}
          >
            Export Excel
          </Button>
        </Space>
      }>
        <div className="text-xs text-slate-500 mb-2">
          Customer Name is mandatory. Selected fields become the exported Excel columns.
        </div>
        <Checkbox.Group
          value={selectedFieldKeys}
          onChange={(vals) => {
            const required = exportFieldDefs.filter((f) => f.required).map((f) => f.key);
            const next = Array.from(new Set([...(vals || []), ...required]));
            setSelectedFieldKeys(next);
          }}
        >
          <Row gutter={[12, 8]}>
            {exportFieldDefs.map((f) => (
              <Col xs={24} sm={12} md={8} lg={6} key={f.key}>
                <Checkbox value={f.key} disabled={Boolean(f.required)}>
                  {f.label}{f.required ? ' (required)' : ''}
                </Checkbox>
              </Col>
            ))}
          </Row>
        </Checkbox.Group>
        <div className="mt-3 flex gap-2 flex-wrap">
          <Button size="small" onClick={() => setSelectedFieldKeys((prev) => Array.from(new Set(['customerName', ...allOptionalFieldKeys])))}>
            Select all
          </Button>
          <Button size="small" onClick={() => setSelectedFieldKeys(['customerName', 'serviceName', 'startDate', 'endDate', 'amountBilled', 'amountPaid', 'due'])}>
            Reset defaults
          </Button>
        </div>
      </Card>

      <Card className="shadow-sm border border-slate-200" title="Report Results" extra={
        <span className="text-xs text-slate-600">
          Rows: {filteredRows.length} · Billed: ${reportTotals.billed.toFixed(2)} · Paid: ${reportTotals.paid.toFixed(2)} · Due: ${reportTotals.due.toFixed(2)}
        </span>
      }>
        <Spin spinning={loading} tip="Loading report…">
          <Table
            rowKey={(r) => `${r.id}-${r.entry_id ?? r.entryId ?? r.service_id ?? ''}-${r.batch_id ?? ''}`}
            dataSource={filteredRows}
            columns={tableColumns}
            pagination={{
              ...pagination,
              showSizeChanger: true,
              pageSizeOptions: ['20', '50', '100', '200'],
              onChange: (page, pageSize) => setPagination({ current: page, pageSize: pageSize || 20 }),
            }}
            size="small"
            bordered
          />
        </Spin>
      </Card>
    </div>
  );
}

