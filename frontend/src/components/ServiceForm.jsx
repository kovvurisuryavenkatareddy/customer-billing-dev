import React, { useState, useEffect } from 'react';
import { formatMMDDYYYY, toISO } from '../utils/dates';

export default function ServiceForm({ services = [], onSubmit, initial = null, onCancel, submitting = false }) {
  const [serviceType, setServiceType] = useState('');
  const [days, setDays] = useState('');
  const [units, setUnits] = useState('');
  const [ratePerDay, setRatePerDay] = useState(0);
  const [amountBilled, setAmountBilled] = useState(0);
  const [amountPaid, setAmountPaid] = useState('');
  const [dateOfPayment, setDateOfPayment] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateSubmitted, setDateSubmitted] = useState('');
  const [denialCodes, setDenialCodes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [isAmountBilledManuallyEdited, setIsAmountBilledManuallyEdited] = useState(false);

  // Denial code options
  const denialCodeOptions = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10'];

  // Add click outside handler for denial codes dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      const dropdown = document.getElementById('service-denial-codes-dropdown');
      const trigger = dropdown?.previousElementSibling;
      if (dropdown && !dropdown.contains(event.target) && !trigger?.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (initial) {
      // Normalize initial service against provided services list
      const rawName = (initial.serviceName || initial.service_name || '').toString();
      const match = Array.isArray(services) ? services.find(x => {
        const n = (x.name || x.serviceName || x.service_name || '').toString();
        return n.toLowerCase().trim() === rawName.toLowerCase().trim();
      }) : null;
      const svcName = match ? (match.name || match.serviceName || match.service_name) : (initial.serviceName || initial.service_name || '');
      setServiceType(svcName);
      setDays(initial.days ?? initial.days ?? '');
      setRatePerDay(initial.ratePerDay ?? initial.rate_per_day ?? 0);
      setAmountBilled(initial.amountBilled ?? initial.amount_billed ?? 0);
      setAmountPaid(initial.amountPaid || initial.amount_paid || '');
      if (typeof initial.units !== 'undefined') {
        setUnits(String(initial.units));
      }
      setIsAmountBilledManuallyEdited(true); // When editing, preserve the existing amount
      const paymentDate = initial.dateOfPayment || initial.date_of_payment || '';
      const svcStartDate = initial.startDate || initial.start_date || '';
      const svcEndDate = initial.endDate || initial.end_date || '';
      const submittedDate = initial.dateSubmitted || initial.date_submitted || '';
      const codes = initial.denialCodes || initial.denial_codes || [];
      // Format dates to MM-DD-YYYY for cleaner display
      setDateOfPayment(paymentDate ? formatMMDDYYYY(paymentDate) : '');
      setStartDate(svcStartDate ? formatMMDDYYYY(svcStartDate) : '');
      setEndDate(svcEndDate ? formatMMDDYYYY(svcEndDate) : '');
      setDateSubmitted(submittedDate ? formatMMDDYYYY(submittedDate) : '');
      setDenialCodes(Array.isArray(codes) ? codes : (codes ? [codes] : []));
    } else {
      setIsAmountBilledManuallyEdited(false); // Reset flag for new entries
    }
  }, [initial]);

  useEffect(() => {
    // when serviceType changes, set defaults from services list
    const s = services.find(x => x.name === serviceType || x.serviceName === serviceType || x.service_name === serviceType);
    if (s) {
      const dd = s.default_days ?? s.defaultDays ?? 1;
      // only set days if dates not provided
      if (!startDate || !endDate) setDays(String(dd));
      setRatePerDay(Number(s.rate_per_day ?? s.ratePerDay ?? 0));
    }
  }, [serviceType, services, startDate, endDate]);

  // Helper: determine if current service should be treated as units-based (e.g., H0038)
  const isUnitsServiceType = (type) => {
    if (!type || !Array.isArray(services)) return false;
    const s = services.find(x => x.name === type || x.serviceName === type || x.service_name === type);
    if (!s) return false;
    const code = (s.code || s.serviceCode || s.service_code || '').toString().toUpperCase().trim();
    const name = (s.name || s.serviceName || s.service_name || '').toString().toUpperCase();
    return code.includes('H0038') || name.includes('H0038');
  };

  // compute derived amount billed from dates/days or units, depending on service type
  useEffect(() => {
    if (isUnitsServiceType(serviceType)) {
      if (!isAmountBilledManuallyEdited) {
        const u = parseFloat(units);
        const r = Number(ratePerDay);
        if (!isNaN(u) && u >= 0 && !isNaN(r)) {
          setAmountBilled(Math.round(u * r * 100) / 100);
        } else {
          setAmountBilled(0);
        }
      }
      return;
    }

    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (!isNaN(s) && !isNaN(e) && e >= s) {
        const msInDay = 24 * 60 * 60 * 1000;
        const diffDays = Math.floor((e - s) / msInDay) + 1; // inclusive
        setDays(String(diffDays));
        // Recalculate amount billed if it wasn't manually edited
        if (!isAmountBilledManuallyEdited) {
          const r = Number(ratePerDay);
          if (!isNaN(r)) setAmountBilled(Math.round(diffDays * r * 100) / 100);
        }
      } else {
        setDays('');
        if (!isAmountBilledManuallyEdited) {
          setAmountBilled(0);
        }
      }
    } else {
      // if dates not set, keep derived amount from days/rate (only if not manually edited)
      if (!isAmountBilledManuallyEdited) {
        const d = Number(days);
        const r = Number(ratePerDay);
        if (!isNaN(d) && !isNaN(r)) setAmountBilled(Math.round(d * r * 100) / 100);
      }
    }
  }, [serviceType, units, startDate, endDate, days, ratePerDay, isAmountBilledManuallyEdited]);

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate service date order: allow same-day services but disallow end before start
    if (startDate && endDate) {
      const s = new Date(startDate);
      const eDate = new Date(endDate);
      if (!isNaN(s) && !isNaN(eDate) && eDate < s) {
        window.alert('Service end date cannot be before service start date');
        return;
      }
    }

    const payload = {
      service: {
        serviceName: serviceType,
        days: Number(days),
        units: isUnitsServiceType(serviceType) ? Number(units) || 0 : undefined,
        ratePerDay: Number(ratePerDay),
        amountBilled: Number(amountBilled),
        amountPaid: amountPaid === '' ? 0 : Number(amountPaid),
        dateOfPayment: dateOfPayment ? toISO(dateOfPayment) : null,
        startDate: startDate ? toISO(startDate) : null,
        endDate: endDate ? toISO(endDate) : null,
        dateSubmitted: dateSubmitted ? toISO(dateSubmitted) : null,
        denialCodes: denialCodes.length > 0 ? denialCodes : null,
      }
    };
    if (typeof onSubmit === 'function') onSubmit(payload);
  };

  const computedPaid = amountPaid === '' ? 0 : Number(amountPaid) || 0;
  const computedDue = (Number(amountBilled) || 0) - computedPaid;

  return (
    <div className="w-full max-w-[720px] mx-auto">
    <form onSubmit={handleSubmit} className="add-customer-form">
      <fieldset disabled={submitting} style={{ border: 'none', padding: 0, margin: 0, opacity: submitting ? 0.7 : 1 }}>
      <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
        <label>Type of service <span style={{ color: '#c0392b' }}>*</span></label>
        <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
          <option value="">-- select --</option>
          {Array.isArray(services) && services.map(s => {
            const svcName = s.name || s.serviceName || s.service_name || '';
            const code = (s.code || s.serviceCode || s.service_code || '').toString();
            const name = svcName.toString();
            const normalizedCode = code.toUpperCase().trim();
            const normalizedName = name.toUpperCase();
            const isUnit = normalizedCode.includes('H0038') || normalizedName.includes('H0038');
            const rate = s.rate_per_day ?? s.ratePerDay ?? 0;
            const key = s.id || svcName;
            const perLabel = isUnit ? '/unit' : '/day';
            return (
              <option key={key} value={svcName}>{svcName} — ${rate}{perLabel}</option>
            );
          })}
        </select>
      </div>

      {!isUnitsServiceType(serviceType) && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3 box-border w-full min-w-0">
          <label>start date</label>
          <div style={{ position: 'relative', flex: 1 }}>
            <input 
              type="text" 
              placeholder="MM-DD-YYYY" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
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
                  setStartDate(formatMMDDYYYY(e.target.value));
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

        <div className="flex flex-wrap items-center gap-3 box-border w-full min-w-0">
          <label>end date</label>
          <div style={{ position: 'relative', flex: 1 }}>
            <input 
              type="text" 
              placeholder="MM-DD-YYYY" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
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
                  setEndDate(formatMMDDYYYY(e.target.value));
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
      </div>
      )}

      {!isUnitsServiceType(serviceType) && (
      <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
        <label>Number of days</label>
        <input 
          type="number" 
          min="0" 
          step="1"
          value={days} 
          onChange={(e) => {
            setDays(e.target.value);
            // Recalculate amount billed when days change (unless amount was manually edited)
            if (!isAmountBilledManuallyEdited) {
              const d = parseFloat(e.target.value);
              const r = Number(ratePerDay);
              if (!isNaN(d) && d >= 0 && !isNaN(r)) {
                setAmountBilled(Math.round(d * r * 100) / 100);
              } else {
                setAmountBilled(0);
              }
            }
          }}
        />
      </div>
      )}

      {isUnitsServiceType(serviceType) && (
      <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
        <label>Number of units</label>
        <input 
          type="number" 
          min="0" 
          step="1"
          value={units} 
          onChange={(e) => {
            setUnits(e.target.value);
            if (!isAmountBilledManuallyEdited) {
              const u = parseFloat(e.target.value);
              const r = Number(ratePerDay);
              if (!isNaN(u) && u >= 0 && !isNaN(r)) {
                setAmountBilled(Math.round(u * r * 100) / 100);
              } else {
                setAmountBilled(0);
              }
            }
          }}
        />
      </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
        <label>{isUnitsServiceType(serviceType) ? 'Rate per unit ($)' : 'Rate per day ($)'}</label>
        <input type="number" min="0" value={ratePerDay} readOnly />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
        <label>Amount billed ($)</label>
        <input 
          type="number" 
          min="0"
          step="0.01"
          value={amountBilled} 
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            if (!isNaN(value) && value >= 0) {
              setAmountBilled(value);
              setIsAmountBilledManuallyEdited(true);
            } else if (e.target.value === '' || e.target.value === '-') {
              setAmountBilled(0);
              setIsAmountBilledManuallyEdited(true);
            }
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
        <label>Date Submitted</label>
        <div style={{ position: 'relative', flex: 1 }}>
          <input 
            type="text" 
            placeholder="MM-DD-YYYY" 
            value={dateSubmitted} 
            onChange={(e) => setDateSubmitted(e.target.value)}
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
                setDateSubmitted(formatMMDDYYYY(e.target.value));
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
        <label>Amount paid ($)</label>
        <input type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
      </div>

      {!initial && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><strong>Billed:</strong> ${(Number(amountBilled) || 0).toFixed(2)}</span>
            <span><strong>Paid:</strong> ${computedPaid.toFixed(2)}</span>
            <span style={{ color: computedDue > 0 ? '#e74c3c' : '#64748b' }}>
              <strong>Due:</strong> ${computedDue.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6 box-border w-full min-w-0">
        <label>Date of payment</label>
        <div style={{ position: 'relative', flex: 1 }}>
          <input 
            type="text" 
            placeholder="MM-DD-YYYY" 
            value={dateOfPayment} 
            onChange={(e) => setDateOfPayment(e.target.value)}
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
                setDateOfPayment(formatMMDDYYYY(e.target.value));
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
              color: '#667eea',
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
            onClick={() => {
              setShowDropdown(true);
              const input = document.getElementById('service-denial-input');
              input && input.focus();
            }}
          >
            {denialCodes.length > 0 && denialCodes.map(code => (
              <span
                key={code}
                style={{
                  background: '#e6f3ff',
                  color: '#007bff',
                  padding: '2px 6px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {code}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDenialCodes(denialCodes.filter(c => c !== code));
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#007bff',
                    cursor: 'pointer',
                    padding: '0',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px'
                  }}
                >
                  ×
                </button>
              </span>
            ))}

            <input
              id="service-denial-input"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setShowDropdown(true); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const val = searchTerm.trim();
                  if (val) {
                    if (!denialCodes.includes(val)) setDenialCodes([...denialCodes, val]);
                    setSearchTerm('');
                    setShowDropdown(false);
                  }
                } else if (e.key === 'Backspace' && searchTerm === '') {
                  // remove last tag
                  setDenialCodes(denialCodes.slice(0, -1));
                } else if (e.key === 'ArrowDown') {
                  const first = document.querySelector('#service-denial-codes-dropdown .option-item');
                  first && first.focus();
                }
              }}
              placeholder={denialCodes.length === 0 ? 'Type to search or add denial codes...' : ''}
              style={{
                border: 'none',
                outline: 'none',
                flex: 1,
                minWidth: '120px',
                fontSize: '14px',
                padding: '4px 0'
              }}
            />

            <svg
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '16px',
                pointerEvents: 'none'
              }}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>

          <div
            id="service-denial-codes-dropdown"
            style={{
              display: showDropdown ? 'block' : 'none',
              position: 'absolute',
              top: '100%',
              left: '0',
              right: '0',
              backgroundColor: 'white',
              border: '1px solid #ddd',
              borderTop: 'none',
              borderRadius: '0 0 4px 4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              zIndex: 1000,
              maxHeight: '200px',
              overflowY: 'auto'
            }}
          >
            {denialCodeOptions
              .filter(code => code.toLowerCase().includes(searchTerm.toLowerCase()))
              .map(code => (
                <div
                  key={code}
                  tabIndex={0}
                  className="option-item"
                  onClick={() => {
                    if (denialCodes.includes(code)) {
                      setDenialCodes(denialCodes.filter(c => c !== code));
                    } else {
                      setDenialCodes([...denialCodes, code]);
                    }
                    setSearchTerm('');
                    setShowDropdown(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.target.click();
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    backgroundColor: denialCodes.includes(code) ? '#e6f3ff' : 'transparent',
                    color: denialCodes.includes(code) ? '#007bff' : '#333',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #f0f0f0'
                  }}
                >
                  <span>{code}</span>
                  {denialCodes.includes(code) && (
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              ))}

            {/* allow adding the typed custom value as an option */}
            {searchTerm.trim() !== '' && !denialCodeOptions.some(c => c.toLowerCase() === searchTerm.trim().toLowerCase()) && (
              <div
                onClick={() => {
                  const val = searchTerm.trim();
                  if (val) {
                    setDenialCodes([...denialCodes, val]);
                    setSearchTerm('');
                    setShowDropdown(false);
                  }
                }}
                style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#fff8e6' }}
              >
                Add "{searchTerm}"
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="form-actions flex gap-2 mt-4" style={{ justifyContent: 'space-between' }}>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
            {submitting ? 'Please wait…' : 'Cancel'}
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting && <span className="btn-spinner" aria-hidden="true" />}
          {submitting ? 'Saving…' : (initial ? 'Edit Service' : 'Add Service')}
        </button>
      </div>
      </fieldset>
    </form>
    </div>
  );
}
