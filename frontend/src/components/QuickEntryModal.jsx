/**
 * QuickEntryModal
 * Master-detail modal for editing services across multiple selected customers.
 *
 * Left pane: selected customers list
 * Right pane: reuses existing CustomerForm to edit services for the active customer
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import CustomerForm from './form';
import { API_BASE, getAuthHeaders, handle401Error } from '../utils/api';
import { formatMMDDYYYY } from '../utils/dates';
 
function displayName(c) {
  const first = (c?.first_name || c?.firstName || '').toString().trim();
  const last = (c?.last_name || c?.lastName || '').toString().trim();
  const combined = `${first}${last ? ' ' + last : ''}`.trim();
  return combined || String(c?.id ?? 'Customer');
}
 
function mapEntriesToForm(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => ({
    id: e.id,
    serviceName: e.service_name || e.serviceName || '',
    service_name: e.service_name || e.serviceName || '',
    serviceType: e.service_name || e.serviceName || '',
    days: e.days,
    numberOfDays: e.days != null ? String(e.days) : '',
    ratePerDay: e.rate_per_day ?? e.ratePerDay ?? 0,
    rate_per_day: e.rate_per_day ?? e.ratePerDay ?? 0,
    startDate: e.start_date || '',
    start_date: e.start_date || '',
    endDate: e.end_date || '',
    end_date: e.end_date || '',
    amountBilled: e.amount_billed ?? e.amountBilled ?? 0,
    amount_billed: e.amount_billed ?? e.amountBilled ?? 0,
    amountPaid: e.amount_paid ?? e.amountPaid ?? '',
    amount_paid: e.amount_paid ?? e.amountPaid ?? '',
    dateOfPayment: e.date_of_payment ? formatMMDDYYYY(e.date_of_payment) : '',
    dateSubmitted: e.date_submitted ? formatMMDDYYYY(e.date_submitted) : '',
    denialCodes: Array.isArray(e.denial_codes) ? e.denial_codes : [],
    denial_codes: Array.isArray(e.denial_codes) ? e.denial_codes : [],
  }));
}
 
export default function QuickEntryModal({
  selectedCustomers = [],
  servicesCatalog = [],
  onClose,
}) {
  const normalizedCustomers = useMemo(() => {
    const map = new Map();
    for (const c of selectedCustomers || []) {
      const id = c?.id;
      if (id == null) continue;
      if (!map.has(id)) map.set(id, c);
    }
    return Array.from(map.values());
  }, [selectedCustomers]);
 
  const [activeCustomerId, setActiveCustomerId] = useState(
    normalizedCustomers[0]?.id ?? null
  );
  const [entriesByCustomerId, setEntriesByCustomerId] = useState({});
  const [loadingByCustomerId, setLoadingByCustomerId] = useState({});
  const [savingByCustomerId, setSavingByCustomerId] = useState({});
  const [draftByCustomerId, setDraftByCustomerId] = useState({});
  const [dirtyByCustomerId, setDirtyByCustomerId] = useState({});
  const [baselineSigByCustomerId, setBaselineSigByCustomerId] = useState({});
  const [savingAll, setSavingAll] = useState(false);
  const baselineSigRef = useRef({});
  const draftByCustomerIdRef = useRef({});

  useEffect(() => {
    baselineSigRef.current = baselineSigByCustomerId || {};
  }, [baselineSigByCustomerId]);

  useEffect(() => {
    draftByCustomerIdRef.current = draftByCustomerId;
  }, [draftByCustomerId]);
 
  const draftSignature = (draft) => {
    if (!draft) return '';
    const services = Array.isArray(draft.services) ? draft.services : [];
    // Keep signature focused on persisted fields only.
    return JSON.stringify({
      services: services.map((s) => ({
        id: s.id ?? null,
        serviceName: s.serviceName ?? '',
        days: s.days ?? 0,
        units: s.units ?? undefined,
        ratePerDay: s.ratePerDay ?? 0,
        amountBilled: s.amountBilled ?? 0,
        amountPaid: s.amountPaid ?? 0,
        dateOfPayment: s.dateOfPayment ?? null,
        startDate: s.startDate ?? null,
        endDate: s.endDate ?? null,
        dateSubmitted: s.dateSubmitted ?? null,
        denialCodes: s.denialCodes ?? null,
      })),
    });
  };

  useEffect(() => {
    setActiveCustomerId((prev) => {
      if (prev && normalizedCustomers.some((c) => c.id === prev)) return prev;
      return normalizedCustomers[0]?.id ?? null;
    });
  }, [normalizedCustomers]);
 
  const activeCustomer = useMemo(() => {
    return normalizedCustomers.find((c) => c.id === activeCustomerId) || null;
  }, [normalizedCustomers, activeCustomerId]);
 
  const activeEntries = entriesByCustomerId[activeCustomerId] || null;
  const isLoadingActive = Boolean(
    activeCustomerId && (
      loadingByCustomerId[activeCustomerId] ||
      entriesByCustomerId[activeCustomerId] == null
    )
  );
  const isSavingActive = Boolean(activeCustomerId && savingByCustomerId[activeCustomerId]);
  const dirtyCount = useMemo(
    () => Object.values(dirtyByCustomerId || {}).filter(Boolean).length,
    [dirtyByCustomerId]
  );
 
  useEffect(() => {
    const custId = activeCustomerId;
    if (!custId) return;
    if (entriesByCustomerId[custId] != null) return;
 
    let mounted = true;
    setLoadingByCustomerId((prev) => ({ ...prev, [custId]: true }));
    fetch(`${API_BASE}/customers/entries/all?customer_id=${custId}&status=all`, { headers: getAuthHeaders() })
      .then((res) => {
        if (res.status === 401) {
          handle401Error();
          return null;
        }
        if (!res.ok) throw new Error('Failed to fetch entries');
        return res.json();
      })
      .then((rows) => {
        if (!mounted) return;
        const entries = Array.isArray(rows)
          ? rows.filter(r => r.entry_id != null).map(r => ({ ...r, id: r.entry_id }))
          : [];
        setEntriesByCustomerId((prev) => ({
          ...prev,
          [custId]: entries,
        }));
      })
      .catch(() => {
        if (!mounted) return;
        setEntriesByCustomerId((prev) => ({ ...prev, [custId]: [] }));
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingByCustomerId((prev) => ({ ...prev, [custId]: false }));
      });
 
    return () => {
      mounted = false;
    };
  }, [activeCustomerId, entriesByCustomerId]);

  // IMPORTANT: keep `initial` stable so CustomerForm doesn't reset on every keystroke.
  // When switching back to a previously visited customer, restore from their saved draft
  // so the user sees their in-progress edits. Falls back to server entries on first visit.
  const formInitial = useMemo(() => {
    const existingDraft = draftByCustomerIdRef.current?.[activeCustomerId];
    if (existingDraft) {
      return {
        customer: activeCustomer || {},
        services: existingDraft.services,
      };
    }
    return {
      customer: activeCustomer || {},
      services: mapEntriesToForm(activeEntries || []),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCustomerId, activeEntries]);
 
  async function saveCustomerById(custId, payload) {
    const existingEntryIds = new Set(
      (entriesByCustomerId[custId] || []).map((e) => Number(e?.id)).filter(Boolean)
    );
 
    setSavingByCustomerId((prev) => ({ ...prev, [custId]: true }));
    try {
      const servicesList = payload?.services || [];
      const presentExistingIds = new Set(
        servicesList
          .map((s) => (s?.id != null ? Number(s.id) : null))
          .filter((id) => id && existingEntryIds.has(id))
      );

      // Deletes and upserts run in parallel for speed.
      const deleteOps = [...existingEntryIds]
        .filter((id) => !presentExistingIds.has(id))
        .map(async (entryId) => {
          const delRes = await fetch(`${API_BASE}/customers/${custId}/services/${entryId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          if (delRes.status === 401) { handle401Error(); throw new Error('Unauthorized'); }
          if (!delRes.ok) throw new Error('Delete failed');
        });

      const upsertOps = servicesList.map(async (s) => {
        const entryId = s.id != null ? Number(s.id) : null;
        const isExisting = entryId && existingEntryIds.has(entryId);
        const serviceBody = {
          serviceName: s.serviceName,
          days: Number(s.days) || 0,
          units: s.units,
          ratePerDay: s.ratePerDay,
          amountBilled: s.amountBilled ?? 0,
          amountPaid: s.amountPaid === '' ? 0 : Number(s.amountPaid),
          dateOfPayment: s.dateOfPayment || null,
          startDate: s.startDate || null,
          endDate: s.endDate || null,
          dateSubmitted: s.dateSubmitted || null,
          denialCodes: s.denialCodes && s.denialCodes.length ? s.denialCodes : null,
        };
        if (isExisting) {
          const res = await fetch(`${API_BASE}/customers/${custId}/services/${entryId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ service: serviceBody }),
          });
          if (res.status === 401) { handle401Error(); throw new Error('Unauthorized'); }
          if (!res.ok) throw new Error('Service update failed');
        } else {
          const res = await fetch(`${API_BASE}/customers/${custId}/services`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ service: serviceBody }),
          });
          if (res.status === 401) { handle401Error(); throw new Error('Unauthorized'); }
          if (!res.ok) throw new Error('Add service failed');
        }
      });

      await Promise.all([...deleteOps, ...upsertOps]);
 
      const refreshRes = await fetch(`${API_BASE}/customers/entries/all?customer_id=${custId}&status=all`, { headers: getAuthHeaders() });
      if (refreshRes.status === 401) {
        handle401Error();
        throw new Error('Unauthorized');
      }
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json();
        const refreshedEntries = Array.isArray(refreshed)
          ? refreshed.filter(r => r.entry_id != null).map(r => ({ ...r, id: r.entry_id }))
          : [];
        setEntriesByCustomerId((prev) => ({
          ...prev,
          [custId]: refreshedEntries,
        }));
      }
 
      setDirtyByCustomerId((prev) => ({ ...prev, [custId]: false }));
      // Clear draft and baseline after save so that switching away and back re-loads fresh server
      // data (with real IDs) rather than re-using stale draft with temp IDs.
      delete baselineSigRef.current[custId];
      setBaselineSigByCustomerId((prev) => {
        const next = { ...prev };
        delete next[custId];
        return next;
      });
      setDraftByCustomerId((prev) => {
        const next = { ...prev };
        delete next[custId];
        return next;
      });
    } finally {
      setSavingByCustomerId((prev) => ({ ...prev, [custId]: false }));
    }
  }
 
  async function handleSaveAll() {
    if (savingAll) return;
    const customerIds = normalizedCustomers.map((c) => c.id).filter(Boolean);
    const dirtyIds = customerIds.filter((id) => Boolean(dirtyByCustomerId?.[id]));
    if (dirtyIds.length === 0) {
      window.showToast?.({ type: 'info', message: 'No changes to save.', duration: 2500 });
      return;
    }
 
    setSavingAll(true);
    window.showToast?.({
      key: 'quick-entry-save-all',
      type: 'loading',
      message: `Saving ${dirtyIds.length} customer(s)…`,
      duration: 0,
    });
 
    try {
      for (let i = 0; i < dirtyIds.length; i++) {
        const id = dirtyIds[i];
        const payload = draftByCustomerId?.[id];
        if (!payload) continue;
        window.showToast?.({
          key: 'quick-entry-save-all',
          type: 'loading',
          message: `Saving ${i + 1}/${dirtyIds.length}…`,
          duration: 0,
        });
        await saveCustomerById(id, payload);
      }
      window.showToast?.({
        key: 'quick-entry-save-all',
        type: 'success',
        message: 'All changes saved.',
        duration: 2500,
      });
    } catch (err) {
      window.showToast?.({
        key: 'quick-entry-save-all',
        type: 'error',
        message: 'Save all failed: ' + (err?.message || 'Unknown error'),
        duration: 4500,
      });
    } finally {
      setSavingAll(false);
    }
  }
 
  return (
    <div className="flex h-[68vh] gap-4">
      <aside className="w-[320px] shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="text-sm font-semibold text-slate-900">Selected customers</div>
          <div className="text-xs text-slate-500">{normalizedCustomers.length} customer(s)</div>
        </div>
        <div className="h-full overflow-auto p-2">
          {normalizedCustomers.map((c) => {
            const isActive = c.id === activeCustomerId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCustomerId(c.id)}
                className={
                  'w-full text-left rounded-lg px-3 py-2 transition ' +
                  (isActive
                    ? 'bg-blue-50 border border-blue-200'
                    : 'hover:bg-slate-50 border border-transparent')
                }
              >
                <div className="text-sm font-semibold text-slate-900 truncate">{displayName(c)}</div>
                <div className="text-xs text-slate-500 truncate">ID: {String(c.id)}</div>
              </button>
            );
          })}
        </div>
      </aside>
 
      <main className="flex-1 min-w-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {activeCustomer ? displayName(activeCustomer) : 'Customer'}
            </div>
            <div className="text-xs text-slate-500">
              Edit services{dirtyCount ? ` • ${dirtyCount} unsaved` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={savingAll || dirtyCount === 0}
              className={
                'rounded-md px-3 py-2 text-sm font-semibold transition ' +
                (savingAll || dirtyCount === 0
                  ? 'bg-slate-200 text-slate-600 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700')
              }
            >
              {savingAll ? 'Saving…' : 'Save All'}
            </button>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
 
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-auto h-[calc(68vh-56px)] p-3">
          {isLoadingActive ? (
            <div className="p-6 text-sm text-slate-600">Loading services…</div>
          ) : (
            <CustomerForm
              key={activeCustomerId || 'none'}
              submitting={isSavingActive}
              services={servicesCatalog}
              onSubmit={() => {}}
              onCancel={null}
              hideActions={true}
              onDraftChange={(draft) => {
                const custId = activeCustomerId;
                if (!custId) return;
                setDraftByCustomerId((prev) => ({ ...prev, [custId]: draft }));
                const sig = draftSignature(draft);
                // Establish baseline once per customer (first draft emission after loading).
                // Also keep a ref so dirty calculation is consistent in the same tick.
                if (baselineSigRef.current?.[custId] == null) {
                  baselineSigRef.current = { ...(baselineSigRef.current || {}), [custId]: sig };
                  setBaselineSigByCustomerId((prev) => ({ ...prev, [custId]: sig }));
                  setDirtyByCustomerId((prev) => ({ ...prev, [custId]: false }));
                  return;
                }

                const baseline = baselineSigRef.current[custId];
                setDirtyByCustomerId((prev) => ({ ...prev, [custId]: sig !== baseline }));
              }}
              initial={formInitial}
              hideCustomerFields={true}
              allowMultipleServicesInEdit={true}
              useCollapsibleServices={true}
              onRemoveService={null}
            />
          )}
        </div>
      </main>
    </div>
  );
}
  