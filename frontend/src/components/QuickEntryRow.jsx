/**
 * QuickEntryRow
 * A memoized row that supports inline add/edit/delete for a single customer's service.
 */
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
 
function QuickEntryRowImpl({
  customer,
  draftValue,
  isOpen = false,
  onToggle,
  isSaving = false,
  onBeginEdit,
  onDraftChange,
  onClearDraft,
  onCommit,
  onDelete,
}) {
  const effectiveService = (draftValue != null ? String(draftValue) : String(customer.service || ''));
  const hasService = Boolean((effectiveService || '').trim());
  const inputRef = useRef(null);
 
  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus?.();
    inputRef.current?.select?.();
  }, [isOpen]);
 
  const rowClassName = useMemo(() => {
    const base =
      'grid grid-cols-[1.2fr_2fr_auto] items-center gap-3 px-4 py-3 rounded-xl border transition-colors';
    const editing = isOpen ? ' border-blue-300 bg-blue-50/60' : ' border-slate-200 bg-white';
    const hover = isOpen ? '' : ' hover:border-slate-300 hover:bg-slate-50';
    return base + editing + hover;
  }, [isOpen]);
 
  const actionButtonClass =
    'inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200';
 
  const primaryButtonClass =
    'inline-flex items-center rounded-md px-2.5 py-1 text-sm font-semibold text-blue-700 hover:bg-blue-100/70 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200';
 
  const dangerButtonClass =
    'inline-flex items-center rounded-md px-2.5 py-1 text-sm font-semibold text-rose-700 hover:bg-rose-100/70 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-200';
 
  function beginEdit() {
    onToggle?.();
    onBeginEdit?.(customer.id);
    // Ensure there's a draft entry when entering edit mode.
    if (draftValue == null) onDraftChange?.(customer.id, customer.service || '');
  }
 
  function cancelEdit() {
    onClearDraft?.(customer.id);
    onToggle?.();
  }
 
  function commitEdit() {
    const next = (effectiveService || '').trim();
    onCommit?.(customer.id, next);
    // parent closes row on commit
  }
 
  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }
 
  return (
    <div className={rowClassName} role="row" aria-label={`Quick entry row for ${customer.name}`}>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{customer.name}</div>
        <div className="mt-0.5 text-xs text-slate-500">ID: {customer.id}</div>
      </div>
 
      <div className="min-w-0">
        {!isOpen ? (
          <div className="flex items-center gap-2">
            {hasService ? (
              <span className="truncate text-sm text-slate-800">{effectiveService}</span>
            ) : (
              <button
                type="button"
                className="text-sm font-semibold text-blue-700 hover:text-blue-800 hover:underline"
                onClick={beginEdit}
              >
                + Add Service
              </button>
            )}
            {isSaving ? <span className="text-xs text-slate-500">Saving…</span> : null}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={effectiveService}
              onChange={(e) => onDraftChange?.(customer.id, e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter service…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              aria-label={`Edit service for ${customer.name}`}
            />
            {isSaving ? <span className="text-xs text-slate-500">Saving…</span> : null}
          </div>
        )}
      </div>
 
      <div className="flex items-center justify-end gap-1">
        {!isOpen ? (
          <>
            <button
              type="button"
              className={primaryButtonClass}
              onClick={beginEdit}
              disabled={isSaving}
            >
              Edit
            </button>
            <button
              type="button"
              className={dangerButtonClass}
              onClick={() => {
                onDelete?.(customer.id);
                onClearDraft?.(customer.id);
              }}
              disabled={isSaving || !hasService}
              aria-disabled={isSaving || !hasService}
              title={!hasService ? 'Nothing to delete' : 'Delete service'}
            >
              Delete
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={actionButtonClass}
              onClick={cancelEdit}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={primaryButtonClass}
              onClick={commitEdit}
              disabled={isSaving}
              title="Save (Enter)"
            >
              Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}
 
function areEqual(prev, next) {
  return (
    prev.customer.id === next.customer.id &&
    prev.customer.name === next.customer.name &&
    prev.customer.service === next.customer.service &&
    prev.draftValue === next.draftValue &&
    prev.isOpen === next.isOpen &&
    prev.isSaving === next.isSaving
  );
}
 
const QuickEntryRow = memo(QuickEntryRowImpl, areEqual);
export default QuickEntryRow;
