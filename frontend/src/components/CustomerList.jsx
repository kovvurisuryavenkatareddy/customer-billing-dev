import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Checkbox, Button, IconButton, Menu, MenuItem,
  TableSortLabel, Link as MuiLink, Box, Paper,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { formatMMDDYYYY } from '../utils/dates';
import CustomerEntryModal from './CustomerEntryModal';

function formatCurrency(value) {
  return (value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SORT_VALUE_GETTERS = {
  name: (r) => r.name || '',
  dateOfBirth: (r) => (r.dateOfBirth ? new Date(r.dateOfBirth).getTime() : -Infinity),
  amountBilled: (r) => r.amountBilled,
  amountPaid: (r) => r.amountPaid,
  due: (r) => r.amountBilled - r.amountPaid,
};

function makeComparator(order, orderBy) {
  const getVal = SORT_VALUE_GETTERS[orderBy];
  return (a, b) => {
    if (!getVal) return 0;
    const av = getVal(a);
    const bv = getVal(b);
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av < bv ? -1 : av > bv ? 1 : 0);
    return order === 'asc' ? cmp : -cmp;
  };
}

const TotalsBar = ({ label, billed, paid, due, isAllPages }) => (
  <Box
    sx={{
      display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
      px: 2, py: 1.25,
      background: isAllPages ? 'linear-gradient(to right, #f1f5f9, #e2e8f0)' : '#f8fafc',
      borderTop: '1px solid #e2e8f0', fontSize: 13,
    }}
  >
    <Box component="span" sx={{ color: '#475569', minWidth: 140, fontWeight: 600 }}>{label}</Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box component="span" sx={{ color: '#64748b' }}>Billed</Box>
      <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>${formatCurrency(billed)}</Box>
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 2, borderLeft: '1px solid #e2e8f0' }}>
      <Box component="span" sx={{ color: '#64748b' }}>Paid</Box>
      <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>${formatCurrency(paid)}</Box>
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 2, borderLeft: '1px solid #e2e8f0' }}>
      <Box component="span" sx={{ color: '#64748b' }}>Due</Box>
      <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 600, color: due > 0 ? '#dc2626' : due < 0 ? '#d97706' : '#64748b' }}>
        ${formatCurrency(due)}
      </Box>
    </Box>
  </Box>
);

function RowActionsMenu({ record, onEdit }) {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleEdit = () => {
    setAnchorEl(null);
    onEdit({
      customer: record.customer,
      service: {
        id: record.entryId,
        entryId: record.entryId,
        entry_id: record.entryId,
        serviceName: record.serviceName,
        days: record.days,
        ratePerDay: record.ratePerDay,
        amountBilled: record.amountBilled,
        amountPaid: record.amountPaid,
        dateOfPayment: record.paymentDate,
        startDate: record.startDate,
        endDate: record.endDate,
        denialCodes: record.denialCodes,
      },
    });
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
      <Button
        variant="contained" size="small" startIcon={<EditIcon fontSize="small" />}
        onClick={handleEdit}
        sx={{ display: { xs: 'none', md: 'inline-flex' }, px: 1.5, py: 0.25, fontSize: 12, minWidth: 'auto' }}
      >
        Edit
      </Button>
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <IconButton size="small" aria-label="Actions" onClick={(e) => setAnchorEl(e.currentTarget)}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
          <MenuItem onClick={handleEdit}>
            <EditIcon fontSize="small" sx={{ mr: 1 }} /> Edit
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
}

export default function CustomerList({
  customers = [],
  onEdit,
  onAddService,
  onChangeStatus,
  onCustomerUpdated,
  searchText = '',
  onSelectionChange,
}) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [orderBy, setOrderBy] = useState(null);
  const [order, setOrder] = useState('asc');
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const formatDate = useCallback((d) => formatMMDDYYYY(d), []);

  // Group entries by customer_id — one row per customer regardless of batch
  const dataSource = useMemo(() => {
    const groups = new Map();
    for (const c of customers) {
      const key = String(c.id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    return Array.from(groups.entries()).map(([customerId, entries]) => {
      const first = entries[0];
      const daysSum = entries.reduce((s, e) => s + (Number(e.days) || 0), 0);
      const billedSum = entries.reduce((s, e) => s + (Number(e.amount_billed) || 0), 0);
      const paidSum = entries.reduce((s, e) => s + (Number(e.amount_paid) || 0), 0);
      const serviceNames = [...new Set(entries.map(e => e.service_name || e.serviceName || '—').filter(Boolean))];
      const serviceName = serviceNames.length === 0
        ? 'No service'
        : serviceNames.length <= 2
          ? serviceNames.join(', ')
          : `${serviceNames.slice(0, 2).join(', ')} +${serviceNames.length - 2} more`;
      const startDates = entries.map(e => e.start_date).filter(Boolean);
      const endDates = entries.map(e => e.end_date).filter(Boolean);
      const startDate = startDates.length ? startDates.sort()[0] : first.start_date;
      const endDate = endDates.length ? endDates.sort().reverse()[0] : first.end_date;
      return {
        key: customerId,
        id: first.id,
        customerId: first.id,
        name: `${(first.first_name || '').trim()}${first.last_name ? ', ' + (first.last_name || '').trim() : ''}`.trim(),
        firstName: first.first_name || '',
        lastName: first.last_name || '',
        dateOfBirth: first.date_of_birth || '',
        activeStatus: first.active_status || 'active',
        idNumber: first.id_number || '',
        fIdNumber: first.f_id_number || '',
        serviceName,
        startDate,
        endDate,
        days: daysSum,
        ratePerDay: first.rate_per_day || 0,
        amountBilled: billedSum,
        amountPaid: paidSum,
        due: billedSum - paidSum,
        paymentDate: first.date_of_payment,
        dateSubmitted: first.date_submitted,
        denialCodes: first.denial_codes || [],
        isResubmission: first.is_resubmission || false,
        entryId: first.entry_id,
        customer: first,
      };
    });
  }, [customers]);

  // Filter data based on search text
  const filteredData = useMemo(() => {
    if (!searchText) return dataSource;
    const lowerSearch = searchText.toLowerCase();
    return dataSource.filter(row =>
      row.firstName.toLowerCase().includes(lowerSearch) ||
      row.lastName.toLowerCase().includes(lowerSearch) ||
      (row.idNumber && String(row.idNumber).toLowerCase().includes(lowerSearch)) ||
      (row.fIdNumber && String(row.fIdNumber).toLowerCase().includes(lowerSearch)) ||
      row.serviceName.toLowerCase().includes(lowerSearch) ||
      (row.startDate && formatDate(row.startDate).toLowerCase().includes(lowerSearch)) ||
      (row.endDate && formatDate(row.endDate).toLowerCase().includes(lowerSearch)) ||
      (row.dateOfBirth && formatDate(row.dateOfBirth).toLowerCase().includes(lowerSearch))
    );
  }, [dataSource, searchText, formatDate]);

  const sortedData = useMemo(() => {
    if (!orderBy) return filteredData;
    return [...filteredData].sort(makeComparator(order, orderBy));
  }, [filteredData, orderBy, order]);

  // Reset to first page when the underlying data set changes.
  useEffect(() => { setPage(0); }, [searchText, customers.length]);

  const pageData = useMemo(() => {
    const start = page * rowsPerPage;
    return sortedData.slice(start, start + rowsPerPage);
  }, [sortedData, page, rowsPerPage]);

  // compute totals across all service lines (all pages)
  const allPagesTotals = useMemo(() => {
    const computed = filteredData.reduce((acc, row) => {
      acc.amountBilled += row.amountBilled;
      acc.amountPaid += row.amountPaid;
      return acc;
    }, { amountBilled: 0, amountPaid: 0 });
    computed.totalDue = computed.amountBilled - computed.amountPaid;
    return computed;
  }, [filteredData]);

  const pageTotals = useMemo(() => {
    const computed = pageData.reduce((acc, row) => {
      acc.amountBilled += row.amountBilled || 0;
      acc.amountPaid += row.amountPaid || 0;
      return acc;
    }, { amountBilled: 0, amountPaid: 0 });
    computed.totalDue = computed.amountBilled - computed.amountPaid;
    return computed;
  }, [pageData]);

  const handleSort = (key) => {
    if (orderBy === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(key);
      setOrder('asc');
    }
  };

  const notifySelection = useCallback((keys) => {
    const map = new Map();
    for (const row of filteredData) {
      if (keys.includes(row.key) && !map.has(row.customerId)) map.set(row.customerId, row.customer);
    }
    onSelectionChange?.(Array.from(map.values()));
  }, [filteredData, onSelectionChange]);

  const toggleRow = (key) => {
    setSelectedRowKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      notifySelection(next);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    const pageKeys = pageData.map((r) => r.key);
    const allSelected = pageKeys.every((k) => selectedRowKeys.includes(k));
    setSelectedRowKeys((prev) => {
      const next = allSelected
        ? prev.filter((k) => !pageKeys.includes(k))
        : [...new Set([...prev, ...pageKeys])];
      notifySelection(next);
      return next;
    });
  };

  const pageKeys = pageData.map((r) => r.key);
  const allPageSelected = pageKeys.length > 0 && pageKeys.every((k) => selectedRowKeys.includes(k));
  const somePageSelected = pageKeys.some((k) => selectedRowKeys.includes(k));

  const columns = [
    { key: 'name', label: 'Name', sortable: true, minWidth: 170 },
    { key: 'dateOfBirth', label: 'DOB', sortable: true, minWidth: 100 },
    { key: 'idNumber', label: 'ID #', sortable: false, minWidth: 100 },
    { key: 'fIdNumber', label: 'F ID #', sortable: false, minWidth: 100 },
    { key: 'amountBilled', label: 'Amount Billed', sortable: true, minWidth: 120, align: 'right' },
    { key: 'amountPaid', label: 'Amount Paid', sortable: true, minWidth: 120, align: 'right' },
    { key: 'due', label: 'Due', sortable: true, minWidth: 90, align: 'right' },
    { key: 'actions', label: 'Actions', sortable: false, minWidth: 90, align: 'center' },
  ];

  return (
    <Box>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1100 }} stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    indeterminate={somePageSelected && !allPageSelected}
                    checked={allPageSelected}
                    onChange={toggleAllOnPage}
                    sx={{
                      color: '#fff',
                      '&.Mui-checked': { color: '#fff' },
                      '&.MuiCheckbox-indeterminate': { color: '#fff' },
                    }}
                  />
                </TableCell>
                <TableCell align="center" sx={{ width: 50 }}>S.No</TableCell>
                {columns.map((col) => (
                  <TableCell key={col.key} align={col.align || 'left'} sx={{ minWidth: col.minWidth }}>
                    {col.sortable ? (
                      <TableSortLabel
                        active={orderBy === col.key}
                        direction={orderBy === col.key ? order : 'asc'}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                      </TableSortLabel>
                    ) : col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {pageData.map((record, idx) => (
                <TableRow key={record.key} hover selected={selectedRowKeys.includes(record.key)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selectedRowKeys.includes(record.key)}
                      onChange={() => toggleRow(record.key)}
                    />
                  </TableCell>
                  <TableCell align="center">{page * rowsPerPage + idx + 1}</TableCell>
                  <TableCell>
                    <MuiLink
                      component="button"
                      underline="hover"
                      sx={{ fontWeight: 600, textAlign: 'left' }}
                      onClick={() => { setSelectedCustomerId(record.customerId); setShowEntryModal(true); }}
                      title="Click to view customer details"
                    >
                      {record.name || 'N/A'}
                    </MuiLink>
                  </TableCell>
                  <TableCell>{formatDate(record.dateOfBirth)}</TableCell>
                  <TableCell sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {record.idNumber || '—'}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {record.fIdNumber || '—'}
                  </TableCell>
                  <TableCell align="right">
                    <Box component="span" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                      ${record.amountBilled.toFixed(2)}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Box component="span" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                      ${record.amountPaid.toFixed(2)}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Box component="span" sx={{
                      color: (record.amountBilled - record.amountPaid) > 0 ? '#e74c3c' : '#95a5a6',
                      fontWeight: 600, fontFamily: 'monospace',
                    }}>
                      ${(record.amountBilled - record.amountPaid).toFixed(2)}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <RowActionsMenu record={record} onEdit={onEdit} />
                  </TableCell>
                </TableRow>
              ))}
              {pageData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length + 2} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    No records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TotalsBar label="Current Page Totals" billed={pageTotals.amountBilled} paid={pageTotals.amountPaid} due={pageTotals.totalDue} />
        <TotalsBar label="All Pages Totals" billed={allPagesTotals.amountBilled} paid={allPagesTotals.amountPaid} due={allPagesTotals.totalDue} isAllPages />

        <TablePagination
          component="div"
          count={sortedData.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50, 100]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} of ${count} records`}
        />
      </Paper>

      {showEntryModal && (
        <CustomerEntryModal
          customerId={selectedCustomerId}
          onUpdated={onCustomerUpdated}
          onClose={() => {
            setShowEntryModal(false);
            setSelectedCustomerId(null);
          }}
        />
      )}
    </Box>
  );
}
