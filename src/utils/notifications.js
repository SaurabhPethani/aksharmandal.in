import { STORAGE_KEYS } from '../constants/storage';

const item = ({ id, kind, title, detail, at, href }) => ({ id, kind, title, detail, at, href });

export function timeOf(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function transferOutcome(status) {
  const s = String(status ?? '').trim().toLowerCase();
  if (s.startsWith('accept')) return 'was accepted';
  if (s.startsWith('reject')) return 'was rejected';
  if (s.startsWith('cancel')) return 'was cancelled';
  return s ? `is ${s}` : 'was updated';
}

const isPending = (status) => String(status ?? '').trim().toLowerCase().startsWith('pend');

function route(row) {
  const from = row?.from_sabha_name || row?.from_mandal_name || row?.from_pradesh_name;
  const to = row?.to_sabha_name || row?.to_mandal_name || row?.to_pradesh_name;
  if (from && to) return `${from} → ${to}`;
  return to ? `to ${to}` : from ? `from ${from}` : null;
}

export function fromPendingTransfers(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) =>
    item({
      id: `transfer-pending-${row.id}`,
      kind: 'transfer',
      title: `Transfer request for ${row.user_name || 'a member'}`,
      detail: [route(row), 'awaiting your decision'].filter(Boolean).join(' · '),
      at: timeOf(row.created_at),
      href: '/transfers',
    })
  );
}

export function fromMyTransferRequests(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => !isPending(row.status))
    .map((row) =>
      item({
        id: `transfer-mine-${row.id}`,
        kind: 'transfer-mine',
        title: `Your transfer request for ${row.user_name || 'a member'} ${transferOutcome(row.status)}`,
        detail: [route(row), row.reason].filter(Boolean).join(' · '),
        at: timeOf(row.updated_at) ?? timeOf(row.created_at),
        href: '/transfers',
      })
    );
}

export function fromInfoRequests(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const count = Array.isArray(row.fields_changed) ? row.fields_changed.length : 0;
    return item({
      id: `info-${row.id}`,
      kind: 'info',
      title: `Information change for ${row.user_name || 'a member'}`,
      detail: [
        count ? `${count} field${count === 1 ? '' : 's'}` : null,
        'awaiting your approval',
      ].filter(Boolean).join(' · '),
      at: timeOf(row.created_at),
      href: '/transfers',
    });
  });
}

export function sortByNewest(items = []) {
  return [...items].sort((a, b) => {
    if (a.at == null && b.at == null) return 0;
    if (a.at == null) return 1;
    if (b.at == null) return -1;
    return b.at - a.at;
  });
}

export function readWatermark() {
  try {
    const ls = typeof global !== 'undefined' && global.localStorage ? global.localStorage : null;
    const raw = ls ? ls.getItem(STORAGE_KEYS.notificationsReadAt) : null;
    return raw ? timeOf(raw) ?? 0 : 0;
  } catch {
    return 0;
  }
}

export function markAllRead(now = Date.now()) {
  try {
    if (typeof global !== 'undefined' && global.localStorage) {
      global.localStorage.setItem(STORAGE_KEYS.notificationsReadAt, new Date(now).toISOString());
    }
  } catch { /* private mode */ }
  return now;
}

export const isUnread = (entry, watermark) =>
  entry.at == null ? watermark === 0 : entry.at > watermark;

export const badgeLabel = (count) => (count > 9 ? '9+' : String(count));

export function relativeTime(at, now = Date.now()) {
  if (at == null) return null;
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function dayLabel(at, now = Date.now()) {
  if (at == null) return 'Earlier';
  const startOf = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function groupByDay(items = [], now = Date.now()) {
  const groups = [];
  for (const entry of items) {
    const label = dayLabel(entry.at, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }
  return groups;
}
