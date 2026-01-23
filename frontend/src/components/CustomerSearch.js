import React, { useState, useEffect, useRef } from 'react';
import { toISO, formatMMDDYYYY } from '../utils/dates';

// CustomerSearch now exposes firstName and lastName separately and auto-applies filters
export default function CustomerSearch({ onSearch, status = 'active', onStatusChange }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [startDate, setStartDate] = useState(''); // ISO (from native date picker)
  const [endDate, setEndDate] = useState('');

  // Trigger search immediately (CustomersPage debounces network requests centrally)
  function triggerSearch({ firstName: fn = firstName, lastName: ln = lastName, dateOfBirth: dob = dateOfBirth, startDate: sd = startDate, endDate: ed = endDate, status: st = status } = {}) {
    const sISO = sd ? toISO(sd) : '';
    const eISO = ed ? toISO(ed) : '';
    const dobISO = dob ? toISO(dob) : '';
    onSearch({
      firstName: (fn || '').trim(),
      lastName: (ln || '').trim(),
      dateOfBirth: dobISO,
      status: st,
      startDate: sISO,
      endDate: eISO,
      _rawStart: sd,
      _rawEnd: ed,
      _rawDOB: dob,
    });
  }

  function clearFilters() {
    setFirstName('');
    setLastName('');
    setDateOfBirth('');
    setStartDate('');
    setEndDate('');
    onSearch({ firstName: '', lastName: '', dateOfBirth: '', startDate: '', endDate: '' });
  }

  return (
    <div className="filter-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>Filter Participants</h3>
        <div className="filter-field" style={{ minWidth: '140px' }}>
          <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block', color: '#666' }}>Status</label>
          <select 
            value={status} 
            onChange={(e) => { onStatusChange && onStatusChange(e.target.value); triggerSearch({ status: e.target.value }); }} 
            style={{ 
              width: '100%',
              padding: '8px 12px', 
              borderRadius: '4px',
              border: '1px solid #ddd',
              backgroundColor: '#fff',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>
      <div className="filter-row">
        <div className="filter-field">
          <label>First Name</label>
          <input
            placeholder="First Name"
            value={firstName}
            onChange={e => { const v = e.target.value; setFirstName(v); triggerSearch({ firstName: v }); }}
          />
        </div>

        <div className="filter-field">
          <label>Last Name</label>
          <input
            placeholder="Last Name"
            value={lastName}
            onChange={e => { const v = e.target.value; setLastName(v); triggerSearch({ lastName: v }); }}
          />
        </div>

        <div className="filter-field">
          <label>Date of Birth</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="MM-DD-YYYY"
              value={dateOfBirth}
              onChange={e => { const v = e.target.value; setDateOfBirth(v); triggerSearch({ dateOfBirth: v }); }}
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
                  const formatted = formatMMDDYYYY(e.target.value);
                  setDateOfBirth(formatted);
                  triggerSearch({ dateOfBirth: formatted });
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

        <div className="filter-field">
          <label>From Date</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="MM-DD-YYYY"
              value={startDate}
              onChange={e => { const v = e.target.value; setStartDate(v); triggerSearch({ startDate: v }); }}
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
                  const formatted = formatMMDDYYYY(e.target.value);
                  setStartDate(formatted);
                  triggerSearch({ startDate: formatted });
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

        <div className="filter-field">
          <label>To Date</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="MM-DD-YYYY"
              value={endDate}
              onChange={e => { const v = e.target.value; setEndDate(v); triggerSearch({ endDate: v }); }}
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
                  const formatted = formatMMDDYYYY(e.target.value);
                  setEndDate(formatted);
                  triggerSearch({ endDate: formatted });
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

        <div className="filter-actions">
          <button type="button" className="secondary" onClick={clearFilters}>Clear</button>
        </div>
      </div>
    </div>
  );
}
