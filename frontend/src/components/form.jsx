import React, { useState, useEffect, useCallback } from 'react';
import { formatMMDDYYYY, toISO } from '../utils/dates';

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
export default function CustomerForm({ onSubmit, services: servicesProp = [], initial = null, onCancel = null, isResubmission = false } = {}) {
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

  // Add service to list
  const addService = () => {
    const newService = {
      id: Date.now(),
      serviceType: '',
      serviceStartDate: '',
      serviceEndDate: '',
      numberOfDays: '',
      units: '',
      amountBilled: 0,
      amountPaid: '',
      dateOfPayment: '',
      dateSubmitted: '',
      denialCodes: [],
      isAmountBilledManuallyEdited: false
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
      
      // Auto-calculate amount billed when relevant fields change (unless manually edited)
      if (!service.isAmountBilledManuallyEdited) {
        if (field === 'serviceType' || field === 'numberOfDays' || field === 'units' ||
            field === 'serviceStartDate' || field === 'serviceEndDate') {
          
          const rate = getRateForService(updatedService.serviceType);
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
                const startDate = new Date(updatedService.serviceStartDate);
                const endDate = new Date(updatedService.serviceEndDate);
                if (!isNaN(startDate) && !isNaN(endDate) && endDate >= startDate) {
                  const msInDay = 24 * 60 * 60 * 1000;
                  const diffDays = Math.floor((endDate - startDate) / msInDay) + 1; // inclusive
                  updatedService.numberOfDays = String(diffDays);
                  updatedService.amountBilled = Math.round(diffDays * rate * 100) / 100;
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

  // Initialize with one service if none exist and not editing
  useEffect(() => {
    if (services.length === 0 && !initial) {
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

    // If there are services in the initial data, populate the services array
    if (initial.services && Array.isArray(initial.services)) {
      const populatedServices = initial.services.map((service, index) => ({
        id: Date.now() + index,
        serviceType: service.serviceName || service.service_name || '',
        serviceStartDate: service.startDate ? service.startDate : '',
        serviceEndDate: service.endDate ? service.endDate : '',
        numberOfDays: String(service.days || service.numberOfDays || ''),
        units: String(service.units || ''),
        amountBilled: service.amountBilled || service.amount_billed || 0,
        amountPaid: String(service.amountPaid || service.amount_paid || ''),
        dateOfPayment: service.dateOfPayment ? formatMMDDYYYY(service.dateOfPayment) : '',
        dateSubmitted: service.dateSubmitted ? formatMMDDYYYY(service.dateSubmitted) : '',
        denialCodes: service.denialCodes || service.denial_codes || [],
        isAmountBilledManuallyEdited: true // When editing, preserve the existing amounts
      }));
      setServices(populatedServices);
    } else if (initial.service) {
      // Handle single service from old format
      const s = initial.service;
      const singleService = {
        id: Date.now(),
        serviceType: s.serviceName || s.service_name || s.service || '',
        serviceStartDate: s.startDate ? s.startDate : '',
        serviceEndDate: s.endDate ? s.endDate : '',
        numberOfDays: String(s.days || s.numberOfDays || ''),
        units: String(s.units || ''),
        amountBilled: s.amountBilled || s.amount_billed || 0,
        amountPaid: String(s.amountPaid || s.amount_paid || ''),
        dateOfPayment: s.dateOfPayment ? formatMMDDYYYY(s.dateOfPayment) : '',
        dateSubmitted: s.dateSubmitted ? formatMMDDYYYY(s.dateSubmitted) : '',
        denialCodes: s.denialCodes || s.denial_codes || [],
        isAmountBilledManuallyEdited: true
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

  const isEditing = Boolean(initial && (initial.customer || initial.firstName || initial.first_name));

  // Basic validation
  const validate = () => {
    const errs = [];
    
    // When editing an existing customer, first/last name are not editable and should not be validated here
    if (!isEditing) {
      if (!lastName.trim()) errs.push('Last name is required');
      if (!firstName.trim()) errs.push('First name is required');
    }
    
    // Validate services
    if (services.length === 0) {
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

    // Build services payload array
    const servicesPayload = services.map(service => ({
      serviceName: service.serviceType,
      days: Number(service.numberOfDays) || 0,
      units: isUnitsServiceType(service.serviceType) ? Number(service.units) || 0 : undefined,
      ratePerDay: getRateForService(service.serviceType),
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
    <div className="max-w-[800px] mx-auto min-h-[500px] transition-all duration-300 p-0">
      {isResubmission && (
        <div className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white py-3 px-5 rounded-lg mb-5 text-center font-semibold text-[0.95rem] shadow-md">
          🔄 Resubmission Mode - Creating a new entry based on the previous submission
        </div>
      )} 
      <form onSubmit={handleSubmit} className="add-customer-form">
        {isEditing && (
          <>
            <div className="form-row flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
              <label className="min-w-[100px]">ID #</label>
              <input type="text" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="ID #" className="flex-1 min-w-[180px]" />
            </div>
            <div className="form-row flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
              <label className="min-w-[100px]">F ID #</label>
              <input type="text" value={fIdNumber} onChange={(e) => setFIdNumber(e.target.value)} placeholder="F ID #" className="flex-1 min-w-[180px]" />
            </div>
          </>
        )}

        {!isEditing && (
          <>
            <div className="form-row flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
              <label className="min-w-[100px]">Last name <span style={{ color: '#c0392b' }}>*</span></label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" required className="flex-1 min-w-[180px]" />
            </div>

            <div className="form-row flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
              <label className="min-w-[100px]">First name <span style={{ color: '#c0392b' }}>*</span></label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required className="flex-1 min-w-[180px]" />
            </div>

            <div className="form-row flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
              <label className="min-w-[100px]">Date of Birth</label>
              <div className="flex-1 min-w-[180px]" style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  placeholder="MM-DD-YYYY" 
                  value={dateOfBirth} 
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  style={{ paddingRight: 40 }}
                />
                <input
                  type="date"
                  style={{
                    position: 'absolute',
                    right: '0',
                    top: '0',
                    bottom: '0',
                    width: '40px',
                    opacity: 0,
                    cursor: 'pointer',
                    zIndex: 2
                  }}
                  onChange={(e) => {
                    if (e.target.value) {
                      setDateOfBirth(formatMMDDYYYY(e.target.value));
                    }
                  }}
                  onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                />
                <svg 
                  width="20" 
                  height="20" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: '#007bff',
                    zIndex: 1
                  }}
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
                  <rect x="7" y="14" width="2" height="2" fill="currentColor"/>
                  <rect x="11" y="14" width="2" height="2" fill="currentColor"/>
                  <rect x="15" y="14" width="2" height="2" fill="currentColor"/>
                </svg>
              </div>
            </div>

            <div className="form-row flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
              <label className="min-w-[100px]">Status</label>
              <select value={activeStatus} onChange={(e) => setActiveStatus(e.target.value)} className="flex-1 min-w-[180px]">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="form-row flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
              <label className="min-w-[100px]">ID #</label>
              <input type="text" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="ID #" className="flex-1 min-w-[180px]" />
            </div>

            <div className="form-row flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
              <label className="min-w-[100px]">F ID #</label>
              <input type="text" value={fIdNumber} onChange={(e) => setFIdNumber(e.target.value)} placeholder="F ID #" className="flex-1 min-w-[180px]" />
            </div>
          </>
        )}

        {/* Services Section */}
        <div style={{ marginTop: '2rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Services</h3>
            <button 
              type="button" 
              onClick={addService}
              style={{
                background: '#28a745',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              + Add Service
            </button>
          </div>

          {services.map((service, index) => (
            <div key={service.id} style={{ 
              border: '1px solid #ddd', 
              borderRadius: '8px', 
              padding: '1.5rem', 
              marginBottom: '1rem',
              backgroundColor: '#f9f9f9'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4>Service {index + 1}</h4>
                {services.length > 1 && (
                  <button 
                    type="button" 
                    onClick={() => removeService(service.id)}
                    style={{
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
                <label>Type of service <span style={{ color: '#c0392b' }}>*</span></label>
                <select 
                  value={service.serviceType} 
                  onChange={(e) => updateService(service.id, 'serviceType', e.target.value)} 
                  required 
                >
                  <option value="">-- select --</option>
                  {Array.isArray(servicesProp) && servicesProp.map(s => {
                    const svcName = s.name || s.serviceName || s.service_name || '';
                    const key = s.id || svcName;
                    const code = (s.code || s.serviceCode || s.service_code || '').toString();
                    const name = svcName.toString();
                    const normalizedCode = code.toUpperCase().trim();
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

              {/* Service dates/units based on service type */}
              {service.serviceType && !isUnitsServiceType(service.serviceType) ? (
                <>
                  <div className="flex gap-3 items-start mb-6">
                    {/* Service start and end dates in one row */}
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0" style={{ flex: 1 }}>
                        <label>Service start date <span style={{ color: '#c0392b' }}>*</span></label>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input 
                            type="text" 
                            placeholder="MM-DD-YYYY" 
                            value={service.serviceStartDate} 
                            onChange={(e) => updateService(service.id, 'serviceStartDate', e.target.value)} 
                            required 
                            style={{ width: '100%', paddingRight: '40px', boxSizing: 'border-box' }}
                          />
                          <input
                            type="date"
                            style={{
                              position: 'absolute',
                              right: '0',
                              top: '0',
                              bottom: '0',
                              width: '40px',
                              opacity: 0,
                              cursor: 'pointer',
                              zIndex: 2
                            }}
                            onChange={(e) => {
                              if (e.target.value) {
                                updateService(service.id, 'serviceStartDate', formatMMDDYYYY(e.target.value));
                              }
                            }}
                            onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                          />
                          <svg 
                            width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#007bff', zIndex: 1 }}
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                            <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
                            <rect x="7" y="14" width="2" height="2" fill="currentColor"/>
                            <rect x="11" y="14" width="2" height="2" fill="currentColor"/>
                            <rect x="15" y="14" width="2" height="2" fill="currentColor"/>
                          </svg>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0" style={{ flex: 1 }}>
                        <label>Service end date <span style={{ color: '#c0392b' }}>*</span></label>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input 
                            type="text" 
                            placeholder="MM-DD-YYYY" 
                            value={service.serviceEndDate} 
                            onChange={(e) => updateService(service.id, 'serviceEndDate', e.target.value)} 
                            required 
                            style={{ width: '100%', paddingRight: '40px', boxSizing: 'border-box' }}
                          />
                          <input
                            type="date"
                            style={{
                              position: 'absolute',
                              right: '0',
                              top: '0',
                              bottom: '0',
                              width: '40px',
                              opacity: 0,
                              cursor: 'pointer',
                              zIndex: 2
                            }}
                            onChange={(e) => {
                              if (e.target.value) {
                                updateService(service.id, 'serviceEndDate', formatMMDDYYYY(e.target.value));
                              }
                            }}
                            onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                          />
                          <svg 
                            width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#007bff', zIndex: 1 }}
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                            <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
                            <rect x="7" y="14" width="2" height="2" fill="currentColor"/>
                            <rect x="11" y="14" width="2" height="2" fill="currentColor"/>
                            <rect x="15" y="14" width="2" height="2" fill="currentColor"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Number of days in its own row below */}
                  <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
                    <label>Number of days</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={service.numberOfDays}
                      onChange={(e) => updateService(service.id, 'numberOfDays', e.target.value)}
                    />
                  </div>
                </>
              ) : service.serviceType && isUnitsServiceType(service.serviceType) ? (
                <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
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

              <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
                <label>Amount billed ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={service.amountBilled}
                  onChange={(e) => updateService(service.id, 'amountBilled', parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
                <label>Amount paid ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={service.amountPaid}
                  onChange={(e) => updateService(service.id, 'amountPaid', e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
                <label>Date of payment</label>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input 
                    type="text" 
                    placeholder="MM-DD-YYYY" 
                    value={service.dateOfPayment} 
                    onChange={(e) => updateService(service.id, 'dateOfPayment', e.target.value)}
                    style={{ 
                      width: '100%',
                      paddingRight: '40px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <input
                    type="date"
                    style={{
                      position: 'absolute',
                      right: '0',
                      top: '0',
                      bottom: '0',
                      width: '40px',
                      opacity: 0,
                      cursor: 'pointer',
                      zIndex: 2
                    }}
                    onChange={(e) => {
                      if (e.target.value) {
                        updateService(service.id, 'dateOfPayment', formatMMDDYYYY(e.target.value));
                      }
                    }}
                    onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                  />
                  <svg 
                    width="20" 
                    height="20" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: '#007bff',
                      zIndex: 1
                    }}
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
                    <rect x="7" y="14" width="2" height="2" fill="currentColor"/>
                    <rect x="11" y="14" width="2" height="2" fill="currentColor"/>
                    <rect x="15" y="14" width="2" height="2" fill="currentColor"/>
                  </svg>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
                <label>Date Submitted</label>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input 
                    type="text" 
                    placeholder="MM-DD-YYYY" 
                    value={service.dateSubmitted} 
                    onChange={(e) => updateService(service.id, 'dateSubmitted', e.target.value)}
                    style={{ 
                      width: '100%',
                      paddingRight: '40px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <input
                    type="date"
                    style={{
                      position: 'absolute',
                      right: '0',
                      top: '0',
                      bottom: '0',
                      width: '40px',
                      opacity: 0,
                      cursor: 'pointer',
                      zIndex: 2
                    }}
                    onChange={(e) => {
                      if (e.target.value) {
                        updateService(service.id, 'dateSubmitted', formatMMDDYYYY(e.target.value));
                      }
                    }}
                    onFocus={(e) => e.target.showPicker && e.target.showPicker()}
                  />
                  <svg 
                    width="20" 
                    height="20" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: '#007bff',
                      zIndex: 1
                    }}
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2"/>
                    <rect x="7" y="14" width="2" height="2" fill="currentColor"/>
                    <rect x="11" y="14" width="2" height="2" fill="currentColor"/>
                    <rect x="15" y="14" width="2" height="2" fill="currentColor"/>
                  </svg>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
                <label>Denial Code</label>
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      minHeight: '40px',
                      padding: '8px 40px 8px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'text',
                      backgroundColor: 'white',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onClick={(e) => {
                      // compute trigger rect and position dropdown fixed to avoid clipping inside modal scroll containers
                      const rect = e.currentTarget.getBoundingClientRect();
                      setDenialDropdownStyle(service.id, {
                        position: 'fixed',
                        top: rect.bottom + window.scrollY,
                        left: rect.left + window.scrollX,
                        width: rect.width,
                        zIndex: 20000
                      });
                      setDenialShow(service.id, true);
                      const input = document.getElementById(`denial-input-${service.id}`);
                      input && input.focus();
                    }}
                  >
                    {(service.denialCodes || []).map(code => (
                      <span key={code} style={{ background: '#e6f3ff', color: '#007bff', padding: '2px 6px', borderRadius: '12px', fontSize: '12px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {code}
                        <button type="button" onClick={(e) => { e.stopPropagation(); updateService(service.id, 'denialCodes', (service.denialCodes || []).filter(c => c !== code)); }} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', padding: '0', width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>×</button>
                      </span>
                    ))}

                    <input
                      id={`denial-input-${service.id}`}
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
                      placeholder={(service.denialCodes || []).length === 0 ? 'Type to search or add denial codes...' : ''}
                      style={{ border: 'none', outline: 'none', flex: 1, minWidth: '120px', fontSize: '14px', padding: '4px 0' }}
                    />

                    <svg style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', pointerEvents: 'none' }} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>

                  <div id={`denial-codes-dropdown-${service.id}`} style={{ display: denialShowMap[service.id] ? 'block' : 'none', position: denialDropdownStyleMap[service.id]?.position || 'absolute', top: denialDropdownStyleMap[service.id]?.top ? denialDropdownStyleMap[service.id].top + 'px' : '100%', left: denialDropdownStyleMap[service.id]?.left ? denialDropdownStyleMap[service.id].left + 'px' : '0', width: denialDropdownStyleMap[service.id]?.width ? denialDropdownStyleMap[service.id].width + 'px' : 'auto', right: denialDropdownStyleMap[service.id] ? 'auto' : '0', backgroundColor: 'white', border: '1px solid #ddd', borderTop: 'none', borderRadius: '0 0 4px 4px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: denialDropdownStyleMap[service.id]?.zIndex || 1000, maxHeight: '200px', overflowY: 'auto' }}>
                    {denialCodeOptions.filter(code => code.toLowerCase().includes((denialSearchMap[service.id] || '').toLowerCase())).map(code => (
                      <div key={code} tabIndex={0} className="option-item" onClick={() => {
                        const current = service.denialCodes || [];
                        if (current.includes(code)) updateService(service.id, 'denialCodes', current.filter(c => c !== code)); else updateService(service.id, 'denialCodes', [...current, code]);
                        setDenialSearch(service.id, ''); setDenialShow(service.id, false);
                      }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.click(); } }} style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: (service.denialCodes || []).includes(code) ? '#e6f3ff' : 'transparent', color: (service.denialCodes || []).includes(code) ? '#007bff' : '#333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
                        <span>{code}</span>
                        {(service.denialCodes || []).includes(code) && (<svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>)}
                      </div>
                    ))}
                    {(denialSearchMap[service.id] || '').trim() !== '' && !denialCodeOptions.some(c => c.toLowerCase() === (denialSearchMap[service.id] || '').trim().toLowerCase()) && (
                      <div onClick={() => { const val = (denialSearchMap[service.id] || '').trim(); if (val) { const current = service.denialCodes || []; updateService(service.id, 'denialCodes', [...current, val]); setDenialSearch(service.id, ''); setDenialShow(service.id, false); } }} style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#fff8e6' }}>Add "{denialSearchMap[service.id]}"</div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ 
                marginTop: '1rem', 
                padding: '8px', 
                background: '#e9ecef', 
                borderRadius: '4px',
                fontWeight: '600'
              }}>
                Service Total: ${(service.amountBilled || 0).toFixed(2)} | 
                Paid: ${(parseFloat(service.amountPaid) || 0).toFixed(2)} | 
                Due: ${((service.amountBilled || 0) - (parseFloat(service.amountPaid) || 0)).toFixed(2)}
              </div>
            </div>
          ))}

          {/* Grand Total */}
          <div style={{ 
            backgroundColor: '#007bff', 
            color: 'white', 
            padding: '1rem', 
            borderRadius: '8px', 
            fontWeight: '600', 
            fontSize: '1.1rem',
            textAlign: 'center'
          }}>
            Grand Total: ${totalAmountBilled.toFixed(2)} | 
            Total Paid: ${totalAmountPaid.toFixed(2)} | 
            Total Due: ${totalDue.toFixed(2)}
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

        <div className="flex gap-2 mt-4" style={{ justifyContent: onCancel ? 'space-between' : 'flex-end' }}>
          {onCancel && (
            <button type="button" className="bg-secondary text-white py-3 px-6 rounded-lg font-medium cursor-pointer hover:bg-secondary-hover border-0" onClick={() => onCancel()}>Cancel</button>
          )}
          <button type="submit">{isResubmission ? 'Create Resubmission' : 'Save Customer'}</button>
        </div>
      </form>
    </div>
  );
}