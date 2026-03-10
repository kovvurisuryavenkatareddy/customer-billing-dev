import React, { useState, useEffect, useCallback } from 'react';
import { formatMMDDYYYY, toISO, parseToDate } from '../utils/dates';

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
export default function CustomerForm({ onSubmit, services: servicesProp = [], initial = null, onCancel = null, isResubmission = false, submitting = false, hideCustomerFields = false, allowMultipleServicesInEdit = false, useCollapsibleServices = false } = {}) {
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

  // Remove service from list
  const removeService = (serviceId) => {
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
          // Existing services start collapsed when using collapsible panels.
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

  // Denial code options for dropdowns
  const denialCodeOptions = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10'];

  // Add click outside handler for denial codes dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      // hide dropdowns only when clicking outside them
      const dropdowns = document.querySelectorAll('[id^="denial-codes-dropdown-"]');
      dropdowns.forEach(dropdown => {
        const trigger = dropdown?.previousElementSibling;
        if (dropdown && !dropdown.contains(event.target) && !trigger?.contains(event.target)) {
          // extract service id from element id
          const id = dropdown.id || '';
          const parts = id.split('denial-codes-dropdown-');
          const sid = parts[1];
          if (sid) setDenialShowMap(m => ({ ...m, [sid]: false }));
        }
      });
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Per-service denial code input/search state
  const [denialSearchMap, setDenialSearchMap] = useState({});
  const [denialShowMap, setDenialShowMap] = useState({});
  const [denialDropdownStyleMap, setDenialDropdownStyleMap] = useState({});

  const setDenialSearch = (serviceId, val) => setDenialSearchMap(m => ({ ...m, [serviceId]: val }));
  const setDenialShow = (serviceId, val) => setDenialShowMap(m => ({ ...m, [serviceId]: val }));
  const setDenialDropdownStyle = (serviceId, style) => setDenialDropdownStyleMap(m => ({ ...m, [serviceId]: style }));

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

  return (
    <div className="w-full">
      {isResubmission && (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 mb-5 text-center font-semibold text-cyan-900 shadow-sm">
          Resubmission Mode — Creating a new entry based on the previous submission
        </div>
      )} 
      <form onSubmit={handleSubmit} className="add-customer-form rounded-xl border border-slate-200 bg-white shadow-sm p-4">
        <fieldset disabled={submitting} style={{ border: 'none', padding: 0, margin: 0, opacity: submitting ? 0.7 : 1 }}>
        {/* When editing a service, keep participant identifiers read-only elsewhere (Participant Details modal). */}

        {!isEditing && !hideCustomerFields && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="min-w-0">
                <label>First name <span style={{ color: '#c0392b' }}>*</span></label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  required
                />
              </div>

              <div className="min-w-0">
                <label>Last name <span style={{ color: '#c0392b' }}>*</span></label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  required
                />
              </div>

              <div className="min-w-0">
                <label>Date of Birth</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="MM/DD/YYYY"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="pr-10"
                  />
                  <input
                    type="date"
                    className="absolute right-0 top-0 bottom-0 opacity-0 cursor-pointer z-[2]"
                    style={{ width: '2.5rem' }}
                    value={dateOfBirth ? toISO(dateOfBirth) : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        setDateOfBirth(formatMMDDYYYY(e.target.value));
                      }
                    }}
                    onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                  />
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600">
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
                    <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" />
                    <rect x="7" y="14" width="2" height="2" fill="currentColor" />
                    <rect x="11" y="14" width="2" height="2" fill="currentColor" />
                    <rect x="15" y="14" width="2" height="2" fill="currentColor" />
                  </svg>
                </div>
              </div>

              <div className="min-w-0">
                <label>Status</label>
                <select value={activeStatus} onChange={(e) => setActiveStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="min-w-0">
                <label>ID #</label>
                <input
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="ID #"
                />
              </div>

              <div className="min-w-0">
                <label>F ID #</label>
                <input
                  type="text"
                  value={fIdNumber}
                  onChange={(e) => setFIdNumber(e.target.value)}
                  placeholder="F ID #"
                />
              </div>
            </div>
          </>
        )}

        {/* Services Section */}
        <div className="mt-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">{isEditing ? 'Service' : 'Services'}</div>
              <div className="text-xs text-slate-500">Billing line items for this participant.</div>
            </div>

            {(!isEditing || allowMultipleServicesInEdit || isEditBatch) ? (
              <button
                type="button"
                onClick={addService}
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:translate-y-px"
              >
                + Add Service
              </button>
            ) : isEditing && !allowMultipleServicesInEdit ? (
              <span
                className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800"
                title="You are editing an existing service entry"
              >
                Editing existing service
              </span>
            ) : null}
          </div>

          {services.map((service, index) => {
            const code = getServiceCodeForType(service.serviceType) || '';
            const svcLabel = service.serviceType || code || '—';
            const start = service.serviceStartDate || '';
            const end = service.serviceEndDate || '';
            const startISO = start ? toISO(start) : '';
            const endISO = end ? toISO(end) : '';
            const billed = Number(service.amountBilled || 0);
            const paid = Number(service.amountPaid || 0);
            const due = billed - (Number.isNaN(paid) ? 0 : paid);
            const periodPart = (start || end)
              ? ` - ${start && end ? `${start} to ${end}` : (start || end)}`
              : '';
            const header = `${index + 1} - ${svcLabel}${periodPart} - Billed Amt: $${billed.toFixed(2)} - Due Amt: $${due.toFixed(2)}`;
            const showRemove = (services.length > 1 || (!hideCustomerFields && !isEditing && !isEditBatch));

            const serviceFields = (
              <>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="text-sm font-semibold text-slate-900">Service {index + 1}</div>
                  {showRemove && (
                    <button
                      type="button"
                      onClick={() => removeService(service.id)}
                      className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 mb-5">
                  <label>Type of Service <span style={{ color: '#c0392b' }}>*</span></label>
                  <select
                    value={service.serviceType}
                    onChange={(e) => updateService(service.id, 'serviceType', e.target.value)}
                    required
                  >
                    <option value="">Select service</option>
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
                        <option key={key} value={svcName}>{svcName} — ${displayRate}{perLabel}</option>
                      );
                    })}
                  </select>
                </div>

              {/* Start date, End date: show for day-based or when no type selected (Add flow) */}
              {(!service.serviceType || !isUnitsServiceType(service.serviceType)) ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  <div className="min-w-0">
                    <label>Start date <span style={{ color: '#c0392b' }}>*</span></label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="MM/DD/YYYY"
                        value={service.serviceStartDate}
                        onChange={(e) => updateService(service.id, 'serviceStartDate', e.target.value)}
                        required={!isUnitsServiceType(service.serviceType)}
                        className="pr-10"
                      />
                      <input
                        type="date"
                        className="absolute right-0 top-0 bottom-0 opacity-0 cursor-pointer z-[2]"
                        style={{ width: '2.5rem' }}
                        value={startISO}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateService(service.id, 'serviceStartDate', formatMMDDYYYY(e.target.value));
                          }
                        }}
                        onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                      />
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600">
                        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
                        <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" />
                        <rect x="7" y="14" width="2" height="2" fill="currentColor" />
                        <rect x="11" y="14" width="2" height="2" fill="currentColor" />
                        <rect x="15" y="14" width="2" height="2" fill="currentColor" />
                      </svg>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label>End date <span style={{ color: '#c0392b' }}>*</span></label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="MM/DD/YYYY"
                        value={service.serviceEndDate}
                        onChange={(e) => updateService(service.id, 'serviceEndDate', e.target.value)}
                        required={!isUnitsServiceType(service.serviceType)}
                        className="pr-10"
                      />
                      <input
                        type="date"
                        className="absolute right-0 top-0 bottom-0 opacity-0 cursor-pointer z-[2]"
                        style={{ width: '2.5rem' }}
                        value={endISO}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateService(service.id, 'serviceEndDate', formatMMDDYYYY(e.target.value));
                          }
                        }}
                        onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                      />
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600">
                        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
                        <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" />
                        <rect x="7" y="14" width="2" height="2" fill="currentColor" />
                        <rect x="11" y="14" width="2" height="2" fill="currentColor" />
                        <rect x="15" y="14" width="2" height="2" fill="currentColor" />
                      </svg>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Number of days, Rate per day: after dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div className="min-w-0">
                  <label>Number of days</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={service.numberOfDays ?? ''}
                    onChange={(e) => updateService(service.id, 'numberOfDays', e.target.value)}
                    placeholder="Days"
                  />
                </div>
                <div className="min-w-0">
                  <label>Rate per day ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={service.ratePerDay ?? ''}
                    onChange={(e) => updateService(service.id, 'ratePerDay', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    placeholder="From service type or enter manually"
                  />
                </div>
              </div>

              {/* Units: only when service type is units-based */}
              {service.serviceType && isUnitsServiceType(service.serviceType) ? (
                <div className="grid grid-cols-1 gap-2 mb-5">
                  <label>Number of units <span style={{ color: '#c0392b' }}>*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={service.units}
                    onChange={(e) => updateService(service.id, 'units', e.target.value)}
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div className="min-w-0">
                  <label>Amount billed ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={service.amountBilled}
                    onChange={(e) => updateService(service.id, 'amountBilled', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="min-w-0">
                  <label>Amount paid ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={service.amountPaid}
                    onChange={(e) => updateService(service.id, 'amountPaid', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div className="min-w-0">
                  <label>Date of payment</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="MM/DD/YYYY"
                      value={service.dateOfPayment}
                      onChange={(e) => updateService(service.id, 'dateOfPayment', e.target.value)}
                      className="pr-10"
                    />
                    <input
                      type="date"
                      className="absolute right-0 top-0 bottom-0 opacity-0 cursor-pointer z-[2]"
                      style={{ width: '2.5rem' }}
                      value={service.dateOfPayment ? toISO(service.dateOfPayment) : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          updateService(service.id, 'dateOfPayment', formatMMDDYYYY(e.target.value));
                        }
                      }}
                      onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                    />
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600">
                      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
                      <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" />
                      <rect x="7" y="14" width="2" height="2" fill="currentColor" />
                      <rect x="11" y="14" width="2" height="2" fill="currentColor" />
                      <rect x="15" y="14" width="2" height="2" fill="currentColor" />
                    </svg>
                  </div>
                </div>

                <div className="min-w-0">
                  <label>Date submitted</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="MM/DD/YYYY"
                      value={service.dateSubmitted}
                      onChange={(e) => updateService(service.id, 'dateSubmitted', e.target.value)}
                      className="pr-10"
                    />
                    <input
                      type="date"
                      className="absolute right-0 top-0 bottom-0 opacity-0 cursor-pointer z-[2]"
                      style={{ width: '2.5rem' }}
                      value={service.dateSubmitted ? toISO(service.dateSubmitted) : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          updateService(service.id, 'dateSubmitted', formatMMDDYYYY(e.target.value));
                        }
                      }}
                      onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                    />
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600">
                      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
                      <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" />
                      <rect x="7" y="14" width="2" height="2" fill="currentColor" />
                      <rect x="11" y="14" width="2" height="2" fill="currentColor" />
                      <rect x="15" y="14" width="2" height="2" fill="currentColor" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 mb-5">
                <label>Denial codes</label>
                <div className="relative">
                  <div
                    className="min-h-11 w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 pr-10 flex flex-wrap items-center gap-2 cursor-text transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100"
                    onClick={(e) => {
                      // compute trigger rect and position dropdown fixed to avoid clipping inside modal scroll containers
                      const rect = e.currentTarget.getBoundingClientRect();
                      setDenialDropdownStyle(service.id, {
                        position: 'fixed',
                        top: rect.bottom + window.scrollY,
                        left: rect.left + window.scrollX,
                        width: rect.width,
                        zIndex: 20000,
                      });
                      setDenialShow(service.id, true);
                      const input = document.getElementById(`denial-input-${service.id}`);
                      input && input.focus();
                    }}
                  >
                    {(service.denialCodes || []).map(code => (
                      <span key={code} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                        {code}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateService(service.id, 'denialCodes', (service.denialCodes || []).filter(c => c !== code));
                          }}
                          className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-700 hover:bg-blue-100"
                          aria-label={`Remove ${code}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    <input
                      id={`denial-input-${service.id}`}
                      className="customer-denial-input flex-1 min-w-[160px] border-0 outline-none bg-transparent text-sm py-1"
                      value={denialSearchMap[service.id] || ''}
                      onChange={(e) => { setDenialSearch(service.id, e.target.value); setDenialShow(service.id, true); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = (denialSearchMap[service.id] || '').trim();
                          if (val) {
                            const current = service.denialCodes || [];
                            if (!current.includes(val)) updateService(service.id, 'denialCodes', [...current, val]);
                            setDenialSearch(service.id, '');
                            setDenialShow(service.id, false);
                          }
                        } else if (e.key === 'Backspace' && !(denialSearchMap[service.id] || '')) {
                          // remove last tag
                          const current = service.denialCodes || [];
                          if (current.length > 0) updateService(service.id, 'denialCodes', current.slice(0, -1));
                        } else if (e.key === 'ArrowDown') {
                          const first = document.querySelector(`#denial-codes-dropdown-${service.id} .option-item`);
                          first && first.focus();
                        }
                      }}
                      placeholder={(service.denialCodes || []).length === 0 ? 'Type to search or add denial codes…' : ''}
                    />

                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>

                  <div
                    id={`denial-codes-dropdown-${service.id}`}
                    className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                    style={{
                      display: denialShowMap[service.id] ? 'block' : 'none',
                      position: denialDropdownStyleMap[service.id]?.position || 'absolute',
                      top: denialDropdownStyleMap[service.id]?.top ? denialDropdownStyleMap[service.id].top + 'px' : '100%',
                      left: denialDropdownStyleMap[service.id]?.left ? denialDropdownStyleMap[service.id].left + 'px' : '0',
                      width: denialDropdownStyleMap[service.id]?.width ? denialDropdownStyleMap[service.id].width + 'px' : 'auto',
                      right: denialDropdownStyleMap[service.id] ? 'auto' : '0',
                      zIndex: denialDropdownStyleMap[service.id]?.zIndex || 1000,
                      maxHeight: '200px',
                    }}
                  >
                    {denialCodeOptions
                      .filter(code => code.toLowerCase().includes((denialSearchMap[service.id] || '').toLowerCase()))
                      .map(code => (
                        <div
                          key={code}
                          tabIndex={0}
                          className="option-item flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                          onClick={() => {
                            const current = service.denialCodes || [];
                            if (current.includes(code)) updateService(service.id, 'denialCodes', current.filter(c => c !== code));
                            else updateService(service.id, 'denialCodes', [...current, code]);
                            setDenialSearch(service.id, ''); setDenialShow(service.id, false);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.click(); } }}
                        >
                          <span>{code}</span>
                          {(service.denialCodes || []).includes(code) && (
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" className="text-blue-600">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      ))}
                    {(denialSearchMap[service.id] || '').trim() !== '' && !denialCodeOptions.some(c => c.toLowerCase() === (denialSearchMap[service.id] || '').trim().toLowerCase()) && (
                      <div
                        onClick={() => {
                          const val = (denialSearchMap[service.id] || '').trim();
                          if (val) {
                            const current = service.denialCodes || [];
                            updateService(service.id, 'denialCodes', [...current, val]);
                            setDenialSearch(service.id, '');
                            setDenialShow(service.id, false);
                          }
                        }}
                        className="px-3 py-2 text-sm cursor-pointer bg-amber-50 hover:bg-amber-100"
                      >
                        Add “{denialSearchMap[service.id]}”
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><strong>Billed:</strong> ${(service.amountBilled || 0).toFixed(2)}</span>
                  <span><strong>Paid:</strong> ${(parseFloat(service.amountPaid) || 0).toFixed(2)}</span>
                  <span style={{ color: ((service.amountBilled || 0) - (parseFloat(service.amountPaid) || 0)) > 0 ? '#e74c3c' : '#64748b' }}>
                    <strong>Due:</strong> ${((service.amountBilled || 0) - (parseFloat(service.amountPaid) || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
              </>
            );

            if (!useCollapsibleServices) {
              return (
                <div
                  key={service.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-4"
                >
                  {serviceFields}
                </div>
              );
            }

            const handleToggleOpen = (open) => {
              setServices(prev =>
                prev.map(s => (s.id === service.id ? { ...s, isOpen: open } : s))
              );
            };

            return (
              <details
                key={service.id}
                className="group rounded-xl border border-slate-200 bg-white shadow-sm mb-4 overflow-hidden"
                open={service.isOpen}
                onToggle={(e) => handleToggleOpen(e.target.open)}
              >
                <summary
                  className="cursor-pointer select-none px-4 py-3 bg-slate-50 hover:bg-slate-100"
                  style={{ listStyle: 'none' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900 tabular-nums">
                      {header}
                    </div>
                    <svg
                      className="h-4 w-4 text-slate-500 transition-transform duration-200 group-open:rotate-180"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M5.25 7.5L10 12.25L14.75 7.5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </summary>
                <div className="p-4">
                  {serviceFields}
                </div>
              </details>
            );
          })}

          {/* Grand Total */}
          <div className="rounded-xl border border-slate-200 bg-blue-50 px-4 py-3 font-semibold text-blue-900">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Grand Total: ${totalAmountBilled.toFixed(2)}</span>
              <span>Total Paid: ${totalAmountPaid.toFixed(2)}</span>
              <span style={{ color: totalDue > 0 ? '#b91c1c' : '#1e3a8a' }}>Total Due: ${totalDue.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Error Messages */}
        {errors.length > 0 && (
          <div className="text-red-600 font-bold min-h-5 my-2">
            <ul>
              {errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="form-actions flex gap-2 mt-4" style={{ justifyContent: onCancel ? 'space-between' : 'flex-end' }}>
          {onCancel && (
            <button type="button" className="btn-secondary" onClick={() => onCancel()} disabled={submitting}>
              {submitting ? 'Please wait…' : 'Cancel'}
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting && <span className="btn-spinner" aria-hidden="true" />}
            {submitting
              ? (hideCustomerFields ? 'Saving…' : 'Saving…')
              : (hideCustomerFields ? 'Save' : (isResubmission ? 'Create Resubmission' : 'Save Customer'))}
          </button>
        </div>
        </fieldset>
      </form>
    </div>
  );
}