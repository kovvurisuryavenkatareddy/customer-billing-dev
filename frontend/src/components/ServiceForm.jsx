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
        if (window.showToast) window.showToast({ message: 'Service end date cannot be before start date.', type: 'error' });
        else window.alert('Service end date cannot be before service start date');
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

  const DateField = ({ label, value, onChange }) => (
    <div className="min-w-0">
      <label>{label}</label>
      <div className="relative">
        <input
          type="text"
          placeholder="MM-DD-YYYY"
          value={value}
          onChange={onChange}
          className="pr-10"
          inputMode="numeric"
        />
        <input
          type="date"
          className="absolute right-0 top-0 bottom-0 w-10 opacity-0 cursor-pointer z-[2]"
          onChange={(e) => {
            if (e.target.value) {
              onChange({ target: { value: formatMMDDYYYY(e.target.value) } });
            }
          }}
          onFocus={(e) => e.target.showPicker && e.target.showPicker()}
        />
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600"
        >
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
  );

  return (
    <div className="w-full">
    <form onSubmit={handleSubmit} className="add-customer-form rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <fieldset disabled={submitting} style={{ border: 'none', padding: 0, margin: 0, opacity: submitting ? 0.7 : 1 }}>
      <div className="mb-4">
        <div className="text-sm font-semibold text-slate-900">Service details</div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="min-w-0">
          <label>
            Type of Service <span style={{ color: '#c0392b' }}>*</span>
          </label>
          <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
            <option value="">Select service</option>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateField label="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <DateField label="End date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!isUnitsServiceType(serviceType) ? (
            <div className="min-w-0">
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
          ) : (
            <div className="min-w-0">
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

          <div className="min-w-0">
            <label>{isUnitsServiceType(serviceType) ? 'Rate per unit ($)' : 'Rate per day ($)'}</label>
            <input type="number" min="0" value={ratePerDay} readOnly />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="min-w-0">
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

          <div className="min-w-0">
            <label>Amount paid ($)</label>
            <input type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
          </div>
        </div>

      {!initial && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><strong>Billed:</strong> ${(Number(amountBilled) || 0).toFixed(2)}</span>
            <span><strong>Paid:</strong> ${computedPaid.toFixed(2)}</span>
            <span style={{ color: computedDue > 0 ? '#e74c3c' : '#64748b' }}>
              <strong>Due:</strong> ${computedDue.toFixed(2)}
            </span>
          </div>
        </div>
      )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DateField label="Date submitted" value={dateSubmitted} onChange={(e) => setDateSubmitted(e.target.value)} />
          <DateField label="Date of payment" value={dateOfPayment} onChange={(e) => setDateOfPayment(e.target.value)} />
        </div>

        <div className="min-w-0">
          <label>Denial codes</label>
          <div className="relative">
            <div
              className="min-h-11 w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 pr-10 flex flex-wrap items-center gap-2 cursor-text transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100"
              onClick={() => {
                setShowDropdown(true);
                const input = document.getElementById('service-denial-input');
                input && input.focus();
              }}
            >
              {denialCodes.length > 0 && denialCodes.map(code => (
                <span
                  key={code}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                >
                  {code}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDenialCodes(denialCodes.filter(c => c !== code));
                    }}
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-700 hover:bg-blue-100"
                    aria-label={`Remove ${code}`}
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
                placeholder={denialCodes.length === 0 ? 'Type to search or add denial codes…' : ''}
                className="service-denial-input flex-1 min-w-[160px] border-0 outline-none bg-transparent text-sm"
              />

              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-slate-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            <div
              id="service-denial-codes-dropdown"
              className={`absolute left-0 right-0 mt-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg ${showDropdown ? 'block' : 'hidden'}`}
              style={{ zIndex: 1000, maxHeight: '200px' }}
            >
              {denialCodeOptions
                .filter(code => code.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(code => (
                  <div
                    key={code}
                    tabIndex={0}
                    className="option-item flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
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
                  >
                    <span>{code}</span>
                    {denialCodes.includes(code) && (
                      <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" className="text-blue-600">
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
                  className="px-3 py-2 text-sm cursor-pointer bg-amber-50 hover:bg-amber-100"
                >
                  Add “{searchTerm.trim()}”
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="form-actions flex gap-2 mt-4 pt-3 border-t border-slate-200" style={{ justifyContent: 'space-between' }}>
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
