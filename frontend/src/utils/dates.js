// Lightweight date helpers: parse various date string formats and format to MM-DD-YYYY or ISO (yyyy-mm-dd)
export function parseToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  const s = String(value).trim();
  // ISO yyyy-mm-dd
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [_, y, m, d] = isoMatch;
    const dt = new Date(`${y}-${m}-${d}T00:00:00`);
    return isNaN(dt) ? null : dt;
  }
  // mm-dd-yyyy or mm/dd/yyyy
  const mdyMatch = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (mdyMatch) {
    const [_, mm, dd, yyyy] = mdyMatch;
    const mmP = String(mm).padStart(2, '0');
    const ddP = String(dd).padStart(2, '0');
    const dt = new Date(`${yyyy}-${mmP}-${ddP}T00:00:00`);
    return isNaN(dt) ? null : dt;
  }
  // Fallback to Date constructor
  const dt = new Date(s);
  return isNaN(dt) ? null : dt;
}

export function toISO(value) {
  const d = parseToDate(value);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatMMDDYYYY(value) {
  const d = parseToDate(value);
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}
