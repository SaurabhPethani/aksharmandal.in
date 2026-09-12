const numberFormat = new Intl.NumberFormat('en-IN');

export const formatNumber = (n) => (n == null ? '—' : numberFormat.format(n));

export const formatPercent = (n, digits = 1) => (n == null ? '—' : `${Number(n).toFixed(digits)}%`);

/** UPPER_SNAKE_CASE / snake_case -> "Title Case". */
export function humanize(key) {
  return String(key || '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Renders any scalar for a table cell; objects collapse rather than crash. */
export function formatCell(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'object') return '—';
  return String(v);
}
