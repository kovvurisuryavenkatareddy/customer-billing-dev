/**
 * Filter Participants panel using Material-UI Paper, TextField, Select, DatePicker, Autocomplete.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Paper, Grid, TextField, MenuItem, Button, Typography, Box, Autocomplete,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import dayjs from 'dayjs';
import { toISO } from '../utils/dates';

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

const EMPTY_FILTERS = {
  status: 'active',
  firstName: '',
  lastName: '',
  dateOfBirth: null,
  startDate: null,
  endDate: null,
};

export default function CustomerSearch({
  onSearch,
  status = 'active',
  onStatusChange,
  serviceName,
  onServiceNameChange,
  customerOptions = [],
  selectedCustomerIds = [],
  onSelectedCustomerIdsChange,
}) {
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, status });

  useEffect(() => {
    setFilters((f) => ({ ...f, status }));
  }, [status]);

  const dateToISO = (d) => {
    if (!d) return '';
    const str = d?.isValid?.() ? d.format('YYYY-MM-DD') : '';
    return toISO(str);
  };

  const triggerSearch = useCallback((next) => {
    onSearch({
      firstName: (next.firstName || '').trim(),
      lastName: (next.lastName || '').trim(),
      dateOfBirth: dateToISO(next.dateOfBirth),
      status: next.status,
      startDate: dateToISO(next.startDate),
      endDate: dateToISO(next.endDate),
      _rawStart: next.startDate?.isValid?.() ? next.startDate.format('YYYY-MM-DD') : '',
      _rawEnd: next.endDate?.isValid?.() ? next.endDate.format('YYYY-MM-DD') : '',
      _rawDOB: next.dateOfBirth?.isValid?.() ? next.dateOfBirth.format('YYYY-MM-DD') : '',
    });
  }, [onSearch]);

  const updateField = (field, value) => {
    setFilters((prev) => {
      const next = { ...prev, [field]: value };
      triggerSearch(next);
      return next;
    });
    if (field === 'status') onStatusChange?.(value);
  };

  const clearFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    onStatusChange?.('active');
    if (onServiceNameChange) onServiceNameChange('');
    if (onSelectedCustomerIdsChange) onSelectedCustomerIdsChange([]);
    onSearch({ firstName: '', lastName: '', dateOfBirth: '', status: 'active', startDate: '', endDate: '' });
  };

  const labelSx = { fontSize: 12, fontWeight: 600, color: '#475569', mb: 0.5, display: 'block' };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderColor: '#e2e8f0' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FilterListIcon fontSize="small" sx={{ color: '#64748b' }} />
          <Typography variant="body2" fontWeight={600} color="#1e293b">Filter Participants</Typography>
        </Box>
        <Button size="small" startIcon={<ClearIcon fontSize="small" />} onClick={clearFilters}>
          Clear filters
        </Button>
      </Box>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <Box component="span" sx={labelSx}>Status</Box>
          <TextField
            select fullWidth size="small" value={filters.status}
            onChange={(e) => updateField('status', e.target.value)}
          >
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
            <MenuItem value="all">All</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <Box component="span" sx={labelSx}>First Name</Box>
          <TextField
            fullWidth size="small" placeholder="First name" value={filters.firstName}
            onChange={(e) => updateField('firstName', e.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <Box component="span" sx={labelSx}>Last Name</Box>
          <TextField
            fullWidth size="small" placeholder="Last name" value={filters.lastName}
            onChange={(e) => updateField('lastName', e.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <Box component="span" sx={labelSx}>Date of Birth</Box>
          <DatePicker
            format="MM/DD/YYYY"
            value={filters.dateOfBirth}
            onChange={(val) => updateField('dateOfBirth', val)}
            slotProps={{ textField: { size: 'small', fullWidth: true, placeholder: 'MM/DD/YYYY' } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <Box component="span" sx={labelSx}>From Date</Box>
          <DatePicker
            format="MM/DD/YYYY"
            value={filters.startDate}
            onChange={(val) => updateField('startDate', val)}
            slotProps={{ textField: { size: 'small', fullWidth: true, placeholder: 'MM/DD/YYYY' } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <Box component="span" sx={labelSx}>To Date</Box>
          <DatePicker
            format="MM/DD/YYYY"
            value={filters.endDate}
            onChange={(val) => updateField('endDate', val)}
            slotProps={{ textField: { size: 'small', fullWidth: true, placeholder: 'MM/DD/YYYY' } }}
          />
        </Grid>
      </Grid>

      {(onServiceNameChange || onSelectedCustomerIdsChange) && (
        <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
          {onServiceNameChange && (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Box component="span" sx={labelSx}>Service Name</Box>
              <TextField
                fullWidth size="small" placeholder="Search service name"
                value={serviceName || ''}
                onChange={(e) => onServiceNameChange(e.target.value)}
              />
            </Grid>
          )}
          {onSelectedCustomerIdsChange && (
            <Grid size={{ xs: 12, sm: 6, md: 8, lg: 5 }}>
              <Box component="span" sx={labelSx}>Select Customer(s) for Export (optional)</Box>
              <Autocomplete
                multiple
                size="small"
                options={customerOptions}
                value={customerOptions.filter((o) => selectedCustomerIds.includes(o.value))}
                onChange={(_, vals) => onSelectedCustomerIdsChange(vals.map((v) => v.value))}
                getOptionLabel={(o) => o.label || ''}
                isOptionEqualToValue={(o, v) => o.value === v.value}
                filterOptions={(options, state) =>
                  options.filter((o) => fuzzyIncludes(o.label, state.inputValue))
                }
                renderInput={(params) => (
                  <TextField {...params} placeholder="If selected, export includes all rows for selected customers" />
                )}
              />
            </Grid>
          )}
        </Grid>
      )}
    </Paper>
  );
}
