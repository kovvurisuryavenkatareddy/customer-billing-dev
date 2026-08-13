import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, TextField, MenuItem, Button,
  Accordion, AccordionSummary, AccordionDetails, Autocomplete,
  Typography, Alert, Paper,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { formatMMDDYYYY, toISO, parseToDate } from '../utils/dates';

// Convert the form's MM/DD/YYYY string storage to/from a dayjs object for the
// MUI DatePicker UI layer only — the underlying state stays a string so all
// existing date logic (parseToDate/toISO/day-diff calc) keeps working as-is.
function strToDayjs(mmddyyyy) {
  if (!mmddyyyy) return null;
  const iso = toISO(mmddyyyy);
  if (!iso) return null;
  const d = dayjs(iso);
  return d.isValid() ? d : null;
}
function dayjsToStr(d) {
  if (!d || !d.isValid?.()) return '';
  return formatMMDDYYYY(d.format('YYYY-MM-DD'));
}

// Exported helper to create an initial form state (useful for parent components or tests)
export function formInit() {
  return {
    firstName: '',
    lastName: '',
    errors: [],
    customerId: null,
    submittedData: null,
  };
}

// Customer form component
export default function CustomerForm({
  onSubmit,
  services: servicesProp = [],
  initial = null,
  onCancel = null,
  isResubmission = false,
  submitting = false,
  hideCustomerFields = false,
  allowMultipleServicesInEdit = false,
  useCollapsibleServices = false,
  onDraftChange = null,
  hideActions = false,
} = {}) {
  // Customer basic info state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [activeStatus, setActiveStatus] = useState('active');
  const [idNumber, setIdNumber] = useState('');
  const [fIdNumber, setFIdNumber] = useState('');

  // Services array state
  const [services, setServices] = useState([]);
  const [errors, setErrors] = useState([]);
  const [customerId, setCustomerId] = useState(null);
  // Entries removed by the user but not yet persisted — sent to the server
  // only when the form is actually submitted, so closing without saving
  // leaves the server untouched.
  const [removedServiceIds, setRemovedServiceIds] = useState([]);

  // Helper: get rate for selected service (from services prop)
  const getRateForService = useCallback((type) => {
    if (!type || !Array.isArray(servicesProp)) return 0;
    const s = servicesProp.find(x => (x.name === type || x.serviceName === type || x.service_name === type));
    return s ? Number(s.rate_per_day ?? s.ratePerDay ?? 0) : 0;
  }, [servicesProp]);

  const isUnitsServiceType = useCallback((type) => {
    if (!type || !Array.isArray(servicesProp)) return false;
    const s = servicesProp.find(x => (x.name === type || x.serviceName === type || x.service_name === type));
    if (!s) return false;
    const code = (s.code || s.serviceCode || s.service_code || '').toString();
    const name = (s.name || s.serviceName || s.service_name || '').toString();
    const normalizedCode = code.toUpperCase().trim();
    const normalizedName = name.toUpperCase();
    // Treat any service whose code or name contains H0038 as a units-based service
    return normalizedCode.includes('H0038') || normalizedName.includes('H0038');
  }, [servicesProp]);

  const getServiceCodeForType = useCallback((type) => {
    if (!type) return '';
    const direct = Array.isArray(servicesProp)
      ? servicesProp.find(x => (x.name === type || x.serviceName === type || x.service_name === type))
      : null;
    const code = (direct?.code || direct?.serviceCode || direct?.service_code || '').toString().trim();
    if (code) return code.toUpperCase();
    const m = String(type).toUpperCase().match(/\bH\d{4}\b/);
    return m ? m[0] : '';
  }, [servicesProp]);

  // Add service to list
  const addService = () => {
    const newService = {
      id: Date.now(),
      serviceType: '',
      serviceStartDate: '',
      serviceEndDate: '',
      numberOfDays: '',
      units: '',
      ratePerDay: 0,
      amountBilled: 0,
      amountPaid: '',
      dateOfPayment: '',
      dateSubmitted: '',
      denialCodes: [],
      isAmountBilledManuallyEdited: false,
      isDaysManuallyEdited: false,
      // When a new service is added (especially during Edit flow), keep its panel expanded.
      isOpen: true,
    };
    setServices([...services, newService]);
  };

  // Remove service from list — local only. Saved entries (numeric id from the
  // server) are queued in removedServiceIds and only actually deleted when
  // the form is submitted; unsaved rows (temp Date.now() id) just vanish.
  const removeService = (serviceId) => {
    const service = services.find(s => s.id === serviceId);
    const isSavedEntry = service && typeof service.id === 'number' && service.id < 1e12; // temp IDs use Date.now() which is > 1e12
    if (isSavedEntry) {
      setRemovedServiceIds(prev => (prev.includes(service.id) ? prev : [...prev, service.id]));
    }
    setServices(services.filter(s => s.id !== serviceId));
  };

  // Update service in list
  const updateService = (serviceId, field, value) => {
    setServices(services.map(service => {
      if (service.id !== serviceId) return service;

      const updatedService = { ...service, [field]: value };

      // When service type changes, set rate per day from catalog
      if (field === 'serviceType') {
        updatedService.ratePerDay = getRateForService(value);
      }
      // Track whether Days is user-controlled vs derived from dates.
      if (field === 'numberOfDays') {
        updatedService.isDaysManuallyEdited = true;
      }
      if (field === 'serviceStartDate' || field === 'serviceEndDate') {
        updatedService.isDaysManuallyEdited = false;
      }
      // Auto-calculate amount billed when relevant fields change (unless manually edited)
      if (!service.isAmountBilledManuallyEdited) {
        if (field === 'serviceType' || field === 'numberOfDays' || field === 'units' ||
            field === 'serviceStartDate' || field === 'serviceEndDate') {

          const rate = Number(updatedService.ratePerDay) || getRateForService(updatedService.serviceType);
          if (rate && rate > 0) {
            if (isUnitsServiceType(updatedService.serviceType)) {
              const units = parseFloat(updatedService.units) || 0;
              if (units >= 0) {
                updatedService.amountBilled = Math.round(units * rate * 100) / 100;
              }
            } else {
              // Auto-calculate days from dates if both dates are present
              if (updatedService.serviceStartDate && updatedService.serviceEndDate &&
                  (field === 'serviceStartDate' || field === 'serviceEndDate')) {
                const startDate = parseToDate(updatedService.serviceStartDate);
                const endDate = parseToDate(updatedService.serviceEndDate);
                if (startDate && endDate && endDate >= startDate) {
                  const msInDay = 24 * 60 * 60 * 1000;
                  const diffDays = Math.floor((endDate - startDate) / msInDay) + 1; // inclusive

                  if (!updatedService.isDaysManuallyEdited) {
                    updatedService.numberOfDays = String(diffDays);
                  }
                  const effectiveDays = updatedService.isDaysManuallyEdited
                    ? (parseFloat(updatedService.numberOfDays) || 0)
                    : diffDays;
                  updatedService.amountBilled = Math.round(effectiveDays * rate * 100) / 100;
                }
              } else {
                const days = parseFloat(updatedService.numberOfDays) || 0;
                if (days >= 0) {
                  updatedService.amountBilled = Math.round(days * rate * 100) / 100;
                }
              }
            }
          }
        }
      }

      // Mark amount as manually edited if user changes it directly
      if (field === 'amountBilled') {
        updatedService.isAmountBilledManuallyEdited = true;
      }

      return updatedService;
    }));
  };

  // Calculate total amounts for all services
  const totalAmountBilled = services.reduce((sum, service) => sum + (service.amountBilled || 0), 0);
  const totalAmountPaid = services.reduce((sum, service) => sum + parseFloat(service.amountPaid || 0), 0);
  const totalDue = totalAmountBilled - totalAmountPaid;

  // Initialize with one service row only when adding services for an existing customer.
  // When adding a new customer (!initial && !hideCustomerFields), services are optional — start with none.
  useEffect(() => {
    if (services.length === 0 && hideCustomerFields) {
      addService();
    }
  }, []);

  // If an initial object is provided (editing), populate the fields
  useEffect(() => {
    if (!initial) return;
    setRemovedServiceIds([]);
    const c = initial.customer || initial;

    if (c) {
      setFirstName(c.firstName || c.first_name || '');
      setLastName(c.lastName || c.last_name || '');
      const dob = c.dateOfBirth || c.date_of_birth || c.dob || '';
      setDateOfBirth(dob ? formatMMDDYYYY(dob) : '');
      setActiveStatus(c.activeStatus || c.active_status || 'active');
      setIdNumber(c.idNumber || c.id_number || '');
      setFIdNumber(c.fIdNumber || c.f_id_number || '');
    }

    // If there are services in the initial data, populate the services array.
    // IMPORTANT: when `hideCustomerFields` is true (Add Services flow), `initial.services` may be an empty array.
    // In that case, don't overwrite the default empty row created by the init effect.
    if (initial.services && Array.isArray(initial.services) && initial.services.length > 0) {
      const populatedServices = initial.services.map((service, index) => {
        const svcType = service.serviceName || service.service_name || '';
        return {
          id: service.id != null ? service.id : Date.now() + index,
          serviceType: svcType,
          serviceStartDate: formatMMDDYYYY(service.startDate || service.start_date || '') || '',
          serviceEndDate: formatMMDDYYYY(service.endDate || service.end_date || '') || '',
          numberOfDays: String(service.days ?? service.numberOfDays ?? ''),
          units: String(service.units ?? ''),
          ratePerDay: Number(service.ratePerDay ?? service.rate_per_day ?? 0) || getRateForService(svcType),
          amountBilled: service.amountBilled || service.amount_billed || 0,
          amountPaid: String(service.amountPaid ?? service.amount_paid ?? ''),
          dateOfPayment: service.dateOfPayment ? formatMMDDYYYY(service.dateOfPayment) : (service.dateOfPaymentRaw ? formatMMDDYYYY(service.dateOfPaymentRaw) : ''),
          dateSubmitted: service.dateSubmitted ? formatMMDDYYYY(service.dateSubmitted) : (service.dateSubmittedRaw ? formatMMDDYYYY(service.dateSubmittedRaw) : ''),
          denialCodes: Array.isArray(service.denialCodes) ? service.denialCodes : (Array.isArray(service.denial_codes) ? service.denial_codes : (service.denial_codes ? [service.denial_codes] : [])),
          isAmountBilledManuallyEdited: false,
          isDaysManuallyEdited: String(service.days ?? service.numberOfDays ?? '') !== '',
          isOpen: false,
        };
      });
      setServices(populatedServices);
    } else if (initial.service) {
      // Handle single service from old format
      const s = initial.service;
      const svcType = s.serviceName || s.service_name || s.service || '';
      const singleService = {
        id: s.id != null ? s.id : Date.now(),
        serviceType: svcType,
        serviceStartDate: formatMMDDYYYY(s.startDate || s.start_date || '') || '',
        serviceEndDate: formatMMDDYYYY(s.endDate || s.end_date || '') || '',
        numberOfDays: String(s.days ?? s.numberOfDays ?? ''),
        units: String(s.units ?? ''),
        ratePerDay: Number(s.ratePerDay ?? s.rate_per_day ?? 0) || getRateForService(svcType),
        amountBilled: s.amountBilled || s.amount_billed || 0,
        amountPaid: String(s.amountPaid ?? s.amount_paid ?? ''),
        dateOfPayment: s.dateOfPayment ? formatMMDDYYYY(s.dateOfPayment) : '',
        dateSubmitted: s.dateSubmitted ? formatMMDDYYYY(s.dateSubmitted) : '',
        denialCodes: Array.isArray(s.denialCodes) ? s.denialCodes : (Array.isArray(s.denial_codes) ? s.denial_codes : []),
        isAmountBilledManuallyEdited: false,
        isDaysManuallyEdited: String(s.days || s.numberOfDays || '') !== '',
        // Single legacy service starts expanded so fields are visible.
        isOpen: true,
      };
      setServices([singleService]);
    }
  }, [initial]);

  // Denial code options for the Autocomplete
  const denialCodeOptions = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10'];

  /**
   * "Editing" means modifying an already-saved entry/service (or legacy edit flow).
   * When `hideCustomerFields` is true, we are adding NEW services for an existing customer,
   * so we must allow adding/removing service rows and must not validate hidden participant fields.
   */
  const isEditing = Boolean(
    initial &&
    !hideCustomerFields &&
    (initial.service || (Array.isArray(initial.services) && initial.services.length > 0) || initial.customer || initial.firstName || initial.first_name)
  );

  /** Edit batch: editing existing batch (has services); show "+ Add Service" to add more rows */
  const isEditBatch = Boolean(hideCustomerFields && initial?.services && Array.isArray(initial.services) && initial.services.length > 0);

  // Basic validation
  const validate = () => {
    const errs = [];

    // When editing an existing entry, or when participant fields are hidden (add services), don't validate names here.
    if (!isEditing && !hideCustomerFields) {
      if (!lastName.trim()) errs.push('Last name is required');
      if (!firstName.trim()) errs.push('First name is required');
    }

    // Require at least one service only when adding services for an existing customer (hideCustomerFields).
    // When adding a new customer, services are optional.
    if (services.length === 0 && hideCustomerFields) {
      errs.push('At least one service is required');
    }

    services.forEach((service, index) => {
      const servicePrefix = services.length > 1 ? `Service ${index + 1}: ` : '';

      if (!service.serviceType) {
        errs.push(`${servicePrefix}Type of service is required`);
      }

      // For H0038 (units) services, require units instead of dates
      if (isUnitsServiceType(service.serviceType)) {
        const u = Number(service.units);
        if (Number.isNaN(u) || u < 0) {
          errs.push(`${servicePrefix}Number of units must be a non-negative number`);
        }
      } else {
        if (!service.serviceStartDate) {
          errs.push(`${servicePrefix}Service start date is required`);
        }
        if (!service.serviceEndDate) {
          errs.push(`${servicePrefix}Service end date is required`);
        }
        if (service.serviceStartDate && service.serviceEndDate) {
          const s = new Date(service.serviceStartDate);
          const e = new Date(service.serviceEndDate);
          // Allow same-day services; only block end dates that are before start
          if (!isNaN(s) && !isNaN(e) && e < s) {
            errs.push(`${servicePrefix}Service end date cannot be before service start date`);
          }
        }

        // Only validate days for non-units services
        const days = Number(service.numberOfDays);
        if (Number.isNaN(days) || days < 0) {
          errs.push(`${servicePrefix}Number of days must be a non-negative number`);
        }
      }

      const billed = Number(service.amountBilled);
      if (Number.isNaN(billed) || billed < 0) {
        errs.push(`${servicePrefix}Amount billed must be a non-negative number`);
      }

      const paid = Number(service.amountPaid);
      if (service.amountPaid !== '' && (Number.isNaN(paid) || paid < 0)) {
        errs.push(`${servicePrefix}Amount paid must be a non-negative number`);
      }
    });

    return errs;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) return;

    // Generate customer id (use crypto.randomUUID if available, fallback to timestamp)
    let id = null;
    // If editing an existing customer, preserve its code
    if (initial && initial.customer) {
      id = initial.customer.customerCode || initial.customer.customer_code || null;
    }
    if (!id) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        id = 'cust-' + Date.now();
      }
    }
    setCustomerId(id);

    // Build services payload array (include id so Edit Customer flow can update vs add)
    const servicesPayload = services.map(service => ({
      id: service.id,
      serviceName: service.serviceType,
      // days and units are independent columns: days is calendar days, units
      // is the H0038 unit count. amountBilled is driven by units for H0038,
      // by days for everything else — see updateService's calc above.
      days: Number(service.numberOfDays) || 0,
      units: isUnitsServiceType(service.serviceType) ? Number(service.units) || 0 : undefined,
      ratePerDay: (service.ratePerDay != null && service.ratePerDay !== '') ? Number(service.ratePerDay) : getRateForService(service.serviceType),
      amountBilled: service.amountBilled || 0,
      amountPaid: service.amountPaid === '' ? 0 : Number(service.amountPaid),
      dateOfPayment: service.dateOfPayment ? toISO(service.dateOfPayment) : null,
      startDate: service.serviceStartDate ? toISO(service.serviceStartDate) : null,
      endDate: service.serviceEndDate ? toISO(service.serviceEndDate) : null,
      dateSubmitted: service.dateSubmitted ? toISO(service.dateSubmitted) : null,
      denialCodes: service.denialCodes && service.denialCodes.length > 0 ? service.denialCodes : null,
    }));

    const data = {
      customer: {
        customerCode: id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth ? toISO(dateOfBirth) : null,
        activeStatus: activeStatus,
        idNumber: idNumber.trim() || null,
        fIdNumber: fIdNumber.trim() || null,
        startDate: services[0]?.serviceStartDate ? toISO(services[0].serviceStartDate) : null,
        endDate: services[0]?.serviceEndDate ? toISO(services[0].serviceEndDate) : null,
        comments: '',
        dateSubmitted: services[0]?.dateSubmitted ? toISO(services[0].dateSubmitted) : null,
        denialCodes: services[0]?.denialCodes && services[0].denialCodes.length > 0 ? services[0].denialCodes : null,
      },
      services: servicesPayload,
      removedServiceIds,
      isResubmission: isResubmission,
    };

    if (typeof onSubmit === 'function') {
      try {
        onSubmit(data);
      } catch (err) {
        console.error('onSubmit handler threw', err);
      }
    }
  };

  // Draft callback for parent-controlled "Save All" flows.
  // This intentionally does NOT validate to avoid blocking drafts while typing.
  useEffect(() => {
    if (typeof onDraftChange !== 'function') return;

    // Generate stable-ish customer code for drafts:
    // - prefer existing initial customer code if present
    // - else use existing internal customerId if already computed
    // - else fall back to initial.customer.id when editing existing customers
    let id = null;
    if (initial && initial.customer) {
      id = initial.customer.customerCode || initial.customer.customer_code || initial.customer.id || null;
    }
    if (!id) id = customerId || null;
    if (!id) id = (initial && (initial.id || initial.customerId)) ? (initial.id || initial.customerId) : null;
    if (!id) id = 'cust-' + Date.now();

    const servicesPayload = services.map(service => ({
      id: service.id,
      serviceName: service.serviceType,
      days: Number(service.numberOfDays) || 0,
      units: isUnitsServiceType(service.serviceType) ? Number(service.units) || 0 : undefined,
      ratePerDay: (service.ratePerDay != null && service.ratePerDay !== '') ? Number(service.ratePerDay) : getRateForService(service.serviceType),
      amountBilled: service.amountBilled || 0,
      amountPaid: service.amountPaid === '' ? 0 : Number(service.amountPaid),
      dateOfPayment: service.dateOfPayment ? toISO(service.dateOfPayment) : null,
      startDate: service.serviceStartDate ? toISO(service.serviceStartDate) : null,
      endDate: service.serviceEndDate ? toISO(service.serviceEndDate) : null,
      dateSubmitted: service.dateSubmitted ? toISO(service.dateSubmitted) : null,
      denialCodes: service.denialCodes && service.denialCodes.length > 0 ? service.denialCodes : null,
    }));

    onDraftChange({
      customer: {
        customerCode: String(id),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth ? toISO(dateOfBirth) : null,
        activeStatus: activeStatus,
        idNumber: idNumber.trim() || null,
        fIdNumber: fIdNumber.trim() || null,
      },
      services: servicesPayload,
      removedServiceIds,
      isResubmission,
    });
  }, [
    onDraftChange,
    initial,
    customerId,
    firstName,
    lastName,
    dateOfBirth,
    activeStatus,
    idNumber,
    fIdNumber,
    services,
    removedServiceIds,
    isResubmission,
    isUnitsServiceType,
    getRateForService,
  ]);

  // ── Render ──────────────────────────────────────────────────────────────

  function renderServiceFields(service, index) {
    const unitsType = isUnitsServiceType(service.serviceType);
    const showRemove = (services.length > 1 || hideCustomerFields || (!hideCustomerFields && !isEditing && !isEditBatch));

    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600}>Service {index + 1}</Typography>
          {showRemove && (
            <Button size="small" color="error" variant="outlined" onClick={() => removeService(service.id)}>
              Remove
            </Button>
          )}
        </Box>

        <TextField
          select
          fullWidth
          required
          label="Type of Service"
          value={service.serviceType}
          onChange={(e) => updateService(service.id, 'serviceType', e.target.value)}
          sx={{ mb: 2.5 }}
        >
          <MenuItem value="">Select service</MenuItem>
          {Array.isArray(servicesProp) && servicesProp.map(s => {
            const svcName = s.name || s.serviceName || s.service_name || '';
            const key = s.id || svcName;
            const codeRaw = (s.code || s.serviceCode || s.service_code || '').toString();
            const name = svcName.toString();
            const normalizedCode = codeRaw.toUpperCase().trim();
            const normalizedName = name.toUpperCase();
            const isUnit = normalizedCode.includes('H0038') || normalizedName.includes('H0038');
            const dayRate = Number(s.rate_per_day ?? s.ratePerDay ?? 0) || 0;
            const unitRate = Number(s.unitRate ?? s.ratePerUnit ?? s.rate_per_unit ?? dayRate) || dayRate;
            const displayRate = isUnit ? unitRate : dayRate;
            const perLabel = isUnit ? '/unit' : '/day';
            return (
              <MenuItem key={key} value={svcName}>{svcName} — ${displayRate}{perLabel}</MenuItem>
            );
          })}
        </TextField>

        {/* Start date, End date: show for day-based or when no type selected (Add flow) */}
        {(!service.serviceType || !unitsType) && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2.5 }}>
            <DatePicker
              label="Start date *"
              format="MM/DD/YYYY"
              value={strToDayjs(service.serviceStartDate)}
              onChange={(val) => updateService(service.id, 'serviceStartDate', dayjsToStr(val))}
              slotProps={{ textField: { fullWidth: true, required: !unitsType } }}
            />
            <DatePicker
              label="End date *"
              format="MM/DD/YYYY"
              value={strToDayjs(service.serviceEndDate)}
              onChange={(val) => updateService(service.id, 'serviceEndDate', dayjsToStr(val))}
              slotProps={{ textField: { fullWidth: true, required: !unitsType } }}
            />
          </Box>
        )}

        {/* Number of days: always its own field. For units-based services (H0038),
            days and units are independent — days is calendar days, units drives the
            amount (units * rate). Both are saved to their own DB columns. */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2.5 }}>
          <TextField
            fullWidth
            type="number"
            label="Number of days"
            placeholder="Days"
            value={service.numberOfDays ?? ''}
            onChange={(e) => updateService(service.id, 'numberOfDays', e.target.value)}
            slotProps={{ htmlInput: { min: 0, step: 1 } }}
          />
          <TextField
            fullWidth
            type="number"
            label={`Rate per ${unitsType ? 'unit' : 'day'} ($)`}
            placeholder="From service type or enter manually"
            value={service.ratePerDay ?? ''}
            onChange={(e) => updateService(service.id, 'ratePerDay', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
          />
        </Box>

        {/* Units: only when service type is units-based — drives amountBilled = units * rate */}
        {service.serviceType && unitsType && (
          <TextField
            fullWidth
            required
            type="number"
            label="Number of units"
            value={service.units}
            onChange={(e) => updateService(service.id, 'units', e.target.value)}
            sx={{ mb: 2.5 }}
            slotProps={{ htmlInput: { min: 0, step: 1 } }}
          />
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2.5 }}>
          <TextField
            fullWidth
            type="number"
            label="Amount billed ($)"
            value={service.amountBilled}
            onChange={(e) => updateService(service.id, 'amountBilled', parseFloat(e.target.value) || 0)}
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
          />
          <TextField
            fullWidth
            type="number"
            label="Amount paid ($)"
            value={service.amountPaid}
            onChange={(e) => updateService(service.id, 'amountPaid', e.target.value)}
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
          />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2.5 }}>
          <DatePicker
            label="Date of payment"
            format="MM/DD/YYYY"
            value={strToDayjs(service.dateOfPayment)}
            onChange={(val) => updateService(service.id, 'dateOfPayment', dayjsToStr(val))}
            slotProps={{ textField: { fullWidth: true } }}
          />
          <DatePicker
            label="Date submitted"
            format="MM/DD/YYYY"
            value={strToDayjs(service.dateSubmitted)}
            onChange={(val) => updateService(service.id, 'dateSubmitted', dayjsToStr(val))}
            slotProps={{ textField: { fullWidth: true } }}
          />
        </Box>

        <Autocomplete
          multiple
          freeSolo
          fullWidth
          options={denialCodeOptions}
          value={service.denialCodes || []}
          onChange={(_, vals) => updateService(service.id, 'denialCodes', vals)}
          renderInput={(params) => (
            <TextField {...params} label="Denial codes" placeholder="Type to search or add denial codes…" />
          )}
          sx={{ mb: 2.5 }}
        />

        <Paper variant="outlined" sx={{ px: 2, py: 1.25, bgcolor: '#f8fafc' }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, fontSize: 14 }}>
            <span><strong>Billed:</strong> ${(service.amountBilled || 0).toFixed(2)}</span>
            <span><strong>Paid:</strong> ${(parseFloat(service.amountPaid) || 0).toFixed(2)}</span>
            <Box component="span" sx={{ color: ((service.amountBilled || 0) - (parseFloat(service.amountPaid) || 0)) > 0 ? '#e74c3c' : '#64748b' }}>
              <strong>Due:</strong> ${((service.amountBilled || 0) - (parseFloat(service.amountPaid) || 0)).toFixed(2)}
            </Box>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {isResubmission && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          Resubmission Mode — Creating a new entry based on the previous submission
        </Alert>
      )}
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: '100%', borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: '#fff',
          boxShadow: 1, p: 2.5, opacity: submitting ? 0.7 : 1,
          pointerEvents: submitting ? 'none' : 'auto',
        }}
      >
        {/* When editing a service, keep participant identifiers read-only elsewhere (Participant Details modal). */}
        {!isEditing && !hideCustomerFields && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <TextField
              required fullWidth label="First name" placeholder="First name"
              value={firstName} onChange={(e) => setFirstName(e.target.value)}
            />
            <TextField
              required fullWidth label="Last name" placeholder="Last name"
              value={lastName} onChange={(e) => setLastName(e.target.value)}
            />
            <DatePicker
              label="Date of Birth"
              format="MM/DD/YYYY"
              value={strToDayjs(dateOfBirth)}
              onChange={(val) => setDateOfBirth(dayjsToStr(val))}
              slotProps={{ textField: { fullWidth: true } }}
            />
            <TextField
              select fullWidth label="Status"
              value={activeStatus} onChange={(e) => setActiveStatus(e.target.value)}
            >
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
            <TextField
              fullWidth label="ID #" placeholder="ID #"
              value={idNumber} onChange={(e) => setIdNumber(e.target.value)}
            />
            <TextField
              fullWidth label="F ID #" placeholder="F ID #"
              value={fIdNumber} onChange={(e) => setFIdNumber(e.target.value)}
            />
          </Box>
        )}

        {/* Services Section */}
        <Box sx={{ mt: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
            <Box>
              <Typography variant="body2" fontWeight={600}>{isEditing ? 'Service' : 'Services'}</Typography>
              <Typography variant="caption" color="text.secondary">Billing line items for this participant.</Typography>
            </Box>

            {(!isEditing || allowMultipleServicesInEdit || isEditBatch) ? (
              <Button variant="contained" color="success" size="small" onClick={addService}>
                + Add Service
              </Button>
            ) : isEditing && !allowMultipleServicesInEdit ? (
              <Box sx={{
                display: 'inline-flex', alignItems: 'center', borderRadius: 1.5, border: '1px solid #bfdbfe',
                bgcolor: '#eff6ff', color: '#1e40af', px: 1.5, py: 1, fontSize: 12, fontWeight: 600,
              }} title="You are editing an existing service entry">
                Editing existing service
              </Box>
            ) : null}
          </Box>

          {!useCollapsibleServices ? (
            services.map((service, index) => (
              <Paper key={service.id} variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3 }}>
                {renderServiceFields(service, index)}
              </Paper>
            ))
          ) : (
            services.map((service, index) => {
              const code = getServiceCodeForType(service.serviceType) || '';
              const svcLabel = service.serviceType || code || '—';
              const start = service.serviceStartDate || '';
              const end = service.serviceEndDate || '';
              const billed = Number(service.amountBilled || 0);
              const paid = Number(service.amountPaid || 0);
              const due = billed - (Number.isNaN(paid) ? 0 : paid);
              const periodPart = (start || end)
                ? ` - ${start && end ? `${start} to ${end}` : (start || end)}`
                : '';
              const header = `${index + 1} - ${svcLabel}${periodPart} - Billed Amt: $${billed.toFixed(2)} - Due Amt: $${due.toFixed(2)}`;

              return (
                <Accordion
                  key={service.id}
                  expanded={Boolean(service.isOpen)}
                  onChange={(_, open) => setServices(prev => prev.map(s => (s.id === service.id ? { ...s, isOpen: open } : s)))}
                  variant="outlined"
                  sx={{ mb: 2, borderRadius: '12px !important', '&:before': { display: 'none' } }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {header}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    {renderServiceFields(service, index)}
                  </AccordionDetails>
                </Accordion>
              );
            })
          )}

          {/* Grand Total */}
          <Paper variant="outlined" sx={{ px: 2, py: 1.5, borderRadius: 3, bgcolor: '#eff6ff', color: '#1e3a8a', fontWeight: 600 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, fontSize: 14 }}>
              <span>Grand Total: ${totalAmountBilled.toFixed(2)}</span>
              <span>Total Paid: ${totalAmountPaid.toFixed(2)}</span>
              <Box component="span" sx={{ color: totalDue > 0 ? '#b91c1c' : '#1e3a8a' }}>Total Due: ${totalDue.toFixed(2)}</Box>
            </Box>
          </Paper>
        </Box>

        {/* Error Messages */}
        {errors.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </Box>
          </Alert>
        )}

        {!hideActions && (
          <Box sx={{ display: 'flex', gap: 1.5, mt: 2, justifyContent: onCancel ? 'space-between' : 'flex-end' }}>
            {onCancel && (
              <Button variant="outlined" color="inherit" onClick={() => onCancel()} disabled={submitting}>
                {submitting ? 'Please wait…' : 'Cancel'}
              </Button>
            )}
            <Button type="submit" variant="contained" loading={submitting}>
              {hideCustomerFields ? 'Save' : (isResubmission ? 'Create Resubmission' : 'Save Customer')}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
