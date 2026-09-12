import { STORAGE_KEYS } from '../constants/storage';

// ---------------------------------------------------------------------------
// NOTIFICATIONS ARE A VIEW, NOT A RESOURCE
// ---------------------------------------------------------------------------
// There is no /notifications endpoint. What the bell shows is the same three
// lists the Approvals screen already reads, re-read as "things that happened":
//
//   GET /notifications/transfer/pending      requests pointed AT me
//   GET /notifications/transfer/my-requests  requests I raised, once decided
//   GET /information-requests?status=pending profile edits awaiting my approval
//
// The first two answer with TransferResolvedTimestampedResponse rather than the
// plain TransferResolvedResponse the history endpoint returns — that is the
// whole reason those two are usable here and history is not: they carry
// `created_at` / `updated_at`, and a notification with no time is not one.
//
// Each source is fetched ONLY when its own grant allows it (see
// hooks/useNotifications.js). Nothing here decides permissions.

/** Every notification, whatever it came from, is one of these. */
const item = ({ id, kind, title, detail, at, href }) => ({ id, kind, title, detail, at, href });

/** ms since epoch for an API timestamp, or null when it cannot be read. */
export function timeOf(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * A transfer's own wording, from `status`.
 *
 * The API sends this as a free string rather than an enum, so it is matched
 * case-insensitively on the stem and anything unrecognised keeps the backend's
 * own word instead of being forced into one of ours.
 */
function transferOutcome(status) {
  const s = String(status ?? '').trim().toLowerCase();
  if (s.startsWith('accept')) return 'was accepted';
  if (s.startsWith('reject')) return 'was rejected';
  if (s.startsWith('cancel')) return 'was cancelled';
  return s ? `is ${s}` : 'was updated';
}

const isPending = (status) => String(status ?? '').trim().toLowerCase().startsWith('pend');

/** "Vesu → Ghatlodia", or whichever half the row actually carries. */
function route(row) {
  const from = row?.from_sabha_name || row?.from_mandal_name || row?.from_pradesh_name;
  const to = row?.to_sabha_name || row?.to_mandal_name || row?.to_pradesh_name;
  if (from && to) return `${from} → ${to}`;
  return to ? `to ${to}` : from ? `from ${from}` : null;
}

/** Transfers awaiting MY decision. Always news: nothing moves until I act. */
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

/**
 * Transfers I RAISED — but only the decided ones.
 *
 * A request of mine still sitting pending is not news to me; I am the one who
 * filed it, and it would sit in the bell unread until somebody else acted. What
 * is news is the decision, which is why the time shown is `updated_at` (when it
 * was resolved) and not `created_at` (when I asked).
 */
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

/** Profile edits awaiting my approval — the case in the reference screen. */
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

/**
 * Newest first, and undated entries last rather than dropped.
 *
 * A row whose timestamp the API omitted is still a real thing awaiting action —
 * hiding it would be a silent loss — but it cannot claim a place in the
 * chronology, so it sorts to the bottom and renders without a time.
 */
export function sortByNewest(items = []) {
  return [...items].sort((a, b) => {
    if (a.at == null && b.at == null) return 0;
    if (a.at == null) return 1;
    if (b.at == null) return -1;
    return b.at - a.at;
  });
}

// ── Read state ─────────────────────────────────────────────────────────────
// Local, because the API has none. See STORAGE_KEYS.notificationsReadAt.

/** The watermark, in ms. 0 when never set — so everything reads as unread. */
export function readWatermark() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.notificationsReadAt);
    return raw ? timeOf(raw) ?? 0 : 0;
  } catch {
    return 0; // private mode — nothing is remembered, everything shows unread
  }
}

export function markAllRead(now = Date.now()) {
  try {
    localStorage.setItem(STORAGE_KEYS.notificationsReadAt, new Date(now).toISOString());
  } catch { /* private mode — the badge simply comes back on the next load */ }
  return now;
}

/**
 * An undated item counts as UNREAD and cannot be marked read by the watermark.
 * That is deliberate: it is still awaiting action, and silently reading it
 * because it has no timestamp would hide work.
 */
export const isUnread = (entry, watermark) => entry.at == null || entry.at > watermark;

/** What the badge shows. Capped, matching the reference screen. */
export const badgeLabel = (count) => (count > 9 ? '9+' : String(count));

/**
 * "just now" / "4h ago" / "1d ago" — the reference screen's own scale.
 *
 * Stops at days rather than rolling into weeks and months: past about a week
 * these lists are empty anyway, and "5w ago" reads as an outage rather than a
 * notification.
 */
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

/**
 * Day headings for the full list — "TODAY", "YESTERDAY", then the date.
 *
 * Compared on the local calendar day rather than on elapsed hours: something
 * from 23:00 last night is "Yesterday" at 08:00 even though it is nine hours
 * old, which is how a reader thinks about it.
 */
export function dayLabel(at, now = Date.now()) {
  if (at == null) return 'Earlier';
  const startOf = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The full list, grouped into [{ label, items }] in the order they arrive. */
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
