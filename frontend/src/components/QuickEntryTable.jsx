/**
 * QuickEntryTable
 * Inline bulk editing table for customer services (add/edit/delete) with optimistic UI.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QuickEntryRow from './QuickEntryRow';
 
/**
 * @typedef {{ id: string, name: string, service: string }} Customer
 */
 
function normalizeCustomer(c) {
  return {
    id: String(c?.id ?? ''),
    name: String(c?.name ?? ''),
    service: String(c?.service ?? ''),
  };
}
 
export default function QuickEntryTable({ initialCustomers = [] }) {
  const [customers, setCustomers] = useState(() => initialCustomers.map(normalizeCustomer));
  const [savingById, setSavingById] = useState(() => ({}));
  const [drafts, setDrafts] = useState(() => ({}));
  const [activeCustomerId, setActiveCustomerId] = useState(null);
  const timersRef = useRef(new Map());
 
  // If parent provides a new initialCustomers list, adopt it.
  useEffect(() => {
    setCustomers(initialCustomers.map(normalizeCustomer));
    setDrafts({});
    setActiveCustomerId(null);
  }, [initialCustomers]);
 
  useEffect(() => {
    return () => {
      // Cleanup any pending timers on unmount.
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);
 
  const customersById = useMemo(() => {
    const m = new Map();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);
 
  const startSaving = useCallback((customerId) => {
    setSavingById((prev) => {
      if (prev[customerId]) return prev;
      return { ...prev, [customerId]: true };
    });
 
    const prevTimer = timersRef.current.get(customerId);
    if (prevTimer) clearTimeout(prevTimer);
 
    const timer = setTimeout(() => {
      setSavingById((prev) => {
        if (!prev[customerId]) return prev;
        const next = { ...prev };
        delete next[customerId];
        return next;
      });
      timersRef.current.delete(customerId);
    }, 500);
 
    timersRef.current.set(customerId, timer);
  }, []);
 
  const updateServiceOptimistic = useCallback((customerId, nextService) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, service: nextService } : c))
    );
    startSaving(customerId);
  }, [startSaving]);
 
  const handleCommit = useCallback((customerId, serviceText) => {
    // Treat empty string as "no service".
    updateServiceOptimistic(customerId, serviceText);
    setDrafts((prev) => {
      if (!prev[customerId]) return prev;
      const next = { ...prev };
      delete next[customerId];
      return next;
    });
    setActiveCustomerId((prev) => (prev === customerId ? null : prev));
  }, [updateServiceOptimistic]);
 
  const handleDelete = useCallback((customerId) => {
    updateServiceOptimistic(customerId, '');
    setDrafts((prev) => {
      if (!prev[customerId]) return prev;
      const next = { ...prev };
      delete next[customerId];
      return next;
    });
    setActiveCustomerId((prev) => (prev === customerId ? null : prev));
  }, [updateServiceOptimistic]);
 
  const handleDraftChange = useCallback((customerId, nextDraft) => {
    setDrafts((prev) => ({ ...prev, [customerId]: nextDraft }));
  }, []);
 
  const handleClearDraft = useCallback((customerId) => {
    setDrafts((prev) => {
      if (!prev[customerId]) return prev;
      const next = { ...prev };
      delete next[customerId];
      return next;
    });
  }, []);
 
  const handleToggleOpen = useCallback((customerId) => {
    setActiveCustomerId((prev) => (prev === customerId ? null : customerId));
  }, []);
 
  const handleBeginEdit = useCallback((customerId) => {
    // Optional hook: could be used for analytics or scroll into view later.
    // Keep stable callback to help memoized rows.
    void customerId;
  }, []);
 
  const totalCustomers = customers.length;
  const withServiceCount = useMemo(() => customers.reduce((n, c) => n + (c.service?.trim() ? 1 : 0), 0), [customers]);
 
  return (
    <section className="w-full max-w-5xl mx-auto">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-slate-900">Quick Entry</div>
          <div className="text-sm text-slate-600">
            {withServiceCount}/{totalCustomers} customers have a service
          </div>
        </div>
        <div className="text-xs text-slate-500">
          Tip: <span className="font-semibold">Enter</span> to save, <span className="font-semibold">Esc</span> to cancel
        </div>
      </div>
 
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="hidden grid-cols-[1.2fr_2fr_auto] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <div>Customer</div>
          <div>Service</div>
          <div className="text-right">Actions</div>
        </div>
 
        <div className="flex flex-col gap-2">
          {customers.map((c) => (
            <QuickEntryRow
              key={c.id}
              customer={customersById.get(c.id) || c}
              draftValue={drafts[c.id]}
              isOpen={activeCustomerId === c.id}
              onToggle={() => handleToggleOpen(c.id)}
              isSaving={Boolean(savingById[c.id])}
              onBeginEdit={handleBeginEdit}
              onDraftChange={handleDraftChange}
              onClearDraft={handleClearDraft}
              onCommit={handleCommit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
