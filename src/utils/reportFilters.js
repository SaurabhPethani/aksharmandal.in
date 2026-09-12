// The report screens' filter bar and the Sabha report's week columns, as pure
// functions.
//
// WHERE THE FILTER OPTIONS COME FROM
//
// Not from a lookup endpoint: every report response carries a sibling `filters`
// block beside `data` listing exactly the Pradeshes / Mandals / Sabhas / years
// the CALLER may filter by (`ReportFilters` in the OpenAPI document, an open
// object). A Sabha Head sees their own Sabha; a Pradesh Head sees every Mandal
// under them. Building the dropdowns from /pradesh and /mandal instead would
// offer scopes the report will not answer for.
//
// The block is loosely typed on purpose — it has shipped with the keys spelled
// `pradeshs`, `pradeshes` and `pradesh_list`, holding either an array of objects
// or an id -> name map — so everything below reads it defensively and by prefix
// rather than by exact key.

/** An array, or an `{ id: name }` / `{ id: {...} }` map, as an array of rows. */
const toRows = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([id, v]) =>
    v && typeof v === 'object' ? { id, ...v } : { id, name: v }
  );
};

/**
 * The first non-empty value whose key starts with `prefix` — "pradesh" finds
 * `pradeshs`, `pradeshes` or `pradesh_list` without caring which shipped.
 */
const byPrefix = (filters, prefix) => {
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (!key.toLowerCase().startsWith(prefix)) continue;
    const rows = toRows(value);
    if (rows.length) return rows;
  }
  return [];
};

/**
 * Rows to `{ id, name }` options, A-Z. A row may name its id `id` or
 * `<level>_id`, and its label `name`, `<level>_name` or `label`; anything
 * without an id is dropped rather than rendered as an option that filters by
 * `undefined`.
 */
const toOptions = (rows, level) =>
  rows
    .map((row) => {
      if (row == null) return null;
      if (typeof row !== 'object') return { id: row, name: String(row) };
      const id = row.id ?? row[`${level}_id`];
      const name = row.name ?? row[`${level}_name`] ?? row.label ?? (id != null ? `#${id}` : null);
      return id != null ? { id, name: String(name) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

/** The `filters` block as four option lists. Absent lists come back empty. */
export function readReportFilters(filters) {
  return {
    years: (Array.isArray(filters?.years) ? filters.years : []).map(String),
    pradeshes: toOptions(byPrefix(filters, 'pradesh'), 'pradesh'),
    mandals: toOptions(byPrefix(filters, 'mandal'), 'mandal'),
    sabhas: toOptions(byPrefix(filters, 'sabha'), 'sabha'),
  };
}

/**
 * Filter state -> query parameters.
 *
 * Only what is actually set is sent: an unset level means "everything I am
 * allowed to see", which is the endpoint's own default, and `sabha_id=null`
 * would be a filter on nothing.
 *
 * `omit` drops a parameter the caller must not send — the Sabha report passes
 * `['sabha_id']`, because on that endpoint `sabha_id` does not narrow the list,
 * it switches the response to that Sabha's follow-up persons (which is how the
 * drill-down works).
 */
export function filterParams(value = {}, omit = []) {
  const out = {};
  const put = (key, v) => {
    if (v == null || v === '' || omit.includes(key)) return;
    out[key] = v;
  };
  put('year', value.year);
  put('pradesh_id', value.pradeshId);
  put('mandal_id', value.mandalId);
  put('sabha_id', value.sabhaId);
  return out;
}

export const BLANK_FILTER = { year: null, pradeshId: null, mandalId: null, sabhaId: null };

// ── Week columns ───────────────────────────────────────────────────────────
//
// The Sabha report's week columns are DATE-KEYED — `{ "27-Jul-2026": 12 }` — so
// they are discovered from the rows rather than declared. A fixed list would go
// stale every week.

/** A week column key: `27-Jul-2026`. Anything else is an ordinary field. */
export const WEEK_KEY = /^\d{1,2}-[A-Za-z]{3,}-\d{4}$/;

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** `27-Jul-2026` -> a sortable timestamp. */
export function weekTime(key) {
  const [day, month, year] = String(key).split('-');
  return new Date(Number(year), MONTHS[String(month).slice(0, 3).toLowerCase()] ?? 0, Number(day)).getTime();
}

/** `27-Jul-2026` -> `27-Jul`, which is all a column heading has room for. */
export const weekLabel = (key) => String(key).split('-').slice(0, 2).join('-');

/** The week keys across every row, newest first — the order the table reads in. */
export function weekColumns(rows) {
  const keys = new Set();
  for (const row of rows) {
    if (!row) continue;
    for (const key of Object.keys(row.weeks ?? {})) keys.add(key);
  }
  return [...keys].sort((a, b) => weekTime(b) - weekTime(a));
}

/** "1,234" / "+5%" / null -> a number. The API sends all three spellings. */
export const toNumber = (value) => {
  const n = parseFloat(String(value ?? 0).replace(/[,%+\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** A Sabha row (or the totals row) in the shape the table renders. */
export function readSabhaRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const weeks = {};
  for (const [key, value] of Object.entries(raw)) if (WEEK_KEY.test(key)) weeks[key] = toNumber(value);
  return {
    sabhaId: raw.sabha_id ?? null,
    name: raw.sabha_name ?? raw.name ?? (raw.sabha_id != null ? `Sabha #${raw.sabha_id}` : '—'),
    change: toNumber(raw.change),
    changePct: toNumber(raw.change_percentage),
    weeks,
  };
}

/**
 * A person row — a follow-up person or a member. Their week values are the
 * attendance letters `Y`/`N`, not counts, so they are kept as strings.
 *
 * `change` is the week-over-week movement the API sends on a FOLLOW-UP PERSON's
 * row — the same figure a Sabha row carries, for the members that person holds.
 * It is `null` rather than 0 when the response does not carry one: a member row
 * has no change at all, and printing "0" there would claim the API reported no
 * movement when it reported nothing.
 */
export function readPersonRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const weeks = {};
  for (const [key, value] of Object.entries(raw)) if (WEEK_KEY.test(key)) weeks[key] = String(value || '');
  return {
    userId: raw.user_id ?? null,
    name: raw.user_name ?? '—',
    // `mobile` is carried but NEVER rendered in the table — the report prints
    // names against attendance, and a phone number beside every one of them is
    // noise on a screen nobody opens to find a number. It rides along only so
    // the WhatsApp action on a follow-up person's row can address the message
    // to that head and list their absent members' numbers (see sabhaWhatsapp).
    mobile: raw.mobile ?? '',
    // The head's WhatsApp target (their WhatsApp number if set, else the calling
    // number). The WhatsApp action prefers this; falls back to `mobile`.
    whatsapp: raw.whatsapp || raw.mobile || '',
    present: Number(raw.present ?? 0),
    total: Number(raw.total ?? 0),
    change: raw.change == null || raw.change === '' ? null : toNumber(raw.change),
    weeks,
  };
}

/** Was this person marked present in that week? The API's letter is `Y`/`N`. */
export const isPresent = (person, week) =>
  String(person?.weeks?.[week] || '').toUpperCase() === 'Y';

/**
 * Absent-only: the members who were NOT present in the most recent week.
 *
 * The filter is deliberately about ONE week — the latest — rather than "absent
 * at any point": the question it answers is "who do we chase this week", and a
 * member absent once a month ago is not that.
 *
 * With no week to measure against, everyone is kept: an empty table would read
 * as "nobody was absent", which is a different claim from "we cannot tell".
 */
export function absentInWeek(members = [], week) {
  if (!week) return members;
  return members.filter((m) => !isPresent(m, week));
}

/** How many of these members were present that week — the follow-up row's cell. */
export const presentCount = (members = [], week) =>
  members.filter((m) => isPresent(m, week)).length;

/**
 * A follow-up person's member count: "16 members", or "4 members / 16" once the
 * absent-only filter has narrowed it.
 *
 * The second form appears only when filtering actually removed someone — with
 * the filter on but nobody present, "16 members / 16" would suggest a
 * distinction that is not there.
 */
export function memberCountLabel(shown, total, filtered = false) {
  const label = `${shown} ${shown === 1 ? 'member' : 'members'}`;
  return filtered && shown !== total ? `${label} / ${total}` : label;
}
