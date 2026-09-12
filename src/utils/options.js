// Turning lookup responses into <Select> options.
//
// The lookup endpoints are not uniform: some return a bare array, some a wrapped
// object, and the id/label columns are named after the entity (`category_name`,
// `role_name`, `education_level`, …). Rather than hardcode a mapping per
// endpoint — which would need editing every time the backend adds a lookup —
// the column is discovered from the row itself.
//
// Pass explicit keys when a row is ambiguous; discovery is the fallback, not the
// contract.

/**
 * "SEARCH BY ANYTHING." Every whitespace token in `query` must appear somewhere
 * in `haystack`, in ANY order — so "Amit Gordhan Limbasia" is found by "amit",
 * "limbasia", "amit limbasia", "limbasia amit", "amit gordhan", "gordhan amit",
 * etc.
 *
 * AND across tokens (each word narrows the result), substring per token (half a
 * word still lands — "limb" finds Limbasia), case-insensitive. This is the one
 * matcher behind every search box in the app, so they all behave the same: the
 * Combobox pickers (Reference / Followup / Parent), the paginated lists, the
 * member / job / master-data / attendance searches. Build `haystack` from
 * whatever should be searchable together — e.g. `${name} ${mobile}`.
 *
 * Empty query matches everything (an empty search is not a filter).
 */
export function searchMatches(haystack, query) {
  const tokens = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const text = String(haystack ?? '').toLowerCase();
  return tokens.every((t) => text.includes(t));
}

/** Lookup payloads arrive bare or wrapped. Non-hook twin of `useTableRows`. */
export function pickRows(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['items', 'results', 'records', 'data', 'users', 'list']) {
    if (Array.isArray(data[key])) return data[key];
  }
  /**
   * A wrapper this list does not name — `assignable_roles`, `roles`, whatever
   * the next lookup invents — still yields its rows.
   *
   * Discovery, in the spirit of the column finders below: naming every wrapper
   * is the same losing game as naming every id column, and the failure is
   * silent in the worst way. A dropdown whose payload arrived intact renders as
   * EMPTY AND DISABLED, which reads as "you may not choose" rather than "this
   * response was not understood" — so it gets reported as a permission bug.
   *
   * Arrays of objects win over arrays of scalars: a payload carrying both
   * `{ roles: [...], role_ids: [1, 2] }` picks the one an option can be built
   * from rather than whichever was declared first.
   */
  const arrays = Object.values(data).filter(Array.isArray);
  return (
    arrays.find((a) => a.length > 0 && typeof a[0] === 'object' && a[0] !== null)
    ?? arrays.find((a) => a.length > 0)
    ?? []
  );
}

/**
 * Reads GET /users/check-mobile/{mobile}.
 *
 * ⚠ The response shape is undocumented here, so every plausible spelling is
 * accepted. An answer this cannot parse is reported as "not taken": blocking a
 * genuine create on a response we failed to read would be the worse failure, and
 * the backend rejects a duplicate on POST regardless.
 */
export function isMobileTaken(data) {
  if (data == null) return false;
  // A bare boolean from an endpoint named "check-mobile" reads as "exists".
  if (typeof data === 'boolean') return data;
  if (typeof data !== 'object') return false;

  for (const key of ['exists', 'is_exist', 'is_exists', 'is_registered', 'already_exists']) {
    if (typeof data[key] === 'boolean') return data[key];
  }
  for (const key of ['available', 'is_available']) {
    if (typeof data[key] === 'boolean') return !data[key];
  }
  return false;
}

/**
 * The duplicate-number warning, naming WHO already holds it:
 *   "This mobile number is already registered with Ravi Patel ( Ghatlodia - Vejalpur )"
 *
 * Name leads; Sabha and Mandal sit in a parenthetical, dash-joined. Each piece
 * comes from /users/check-mobile (`full_name`, `sabha_name`, `mandal_name`) and
 * is dropped if the backend did not send it — so a member with only a Sabha
 * reads "Ravi Patel ( Ghatlodia )", one with neither reads just "Ravi Patel",
 * and an old backend that sent none falls back to the plain sentence. Always
 * safe to call whenever `isMobileTaken` is true.
 */
export function mobileTakenLabel(data) {
  const base = 'This mobile number is already registered';
  if (data == null || typeof data !== 'object') return `${base}.`;

  const clean = (s) => (s == null ? '' : String(s).trim());
  const name = clean(data.full_name ?? data.user_name ?? data.name);
  const place = [clean(data.sabha_name), clean(data.mandal_name)].filter(Boolean).join(' - ');

  // Build "Name ( Sabha - Mandal )", omitting whichever half is missing.
  let who = name;
  if (place) who = who ? `${who} ( ${place} )` : `( ${place} )`;

  return who ? `${base} with ${who}.` : `${base}.`;
}

/**
 * WHO holds a taken number, as `{ id, firstName, fullName }`, or null when the
 * check response does not identify them (older backend that sent no `id`).
 *
 * Powers the Add-User "register a family member under this person?" flow: the
 * popup names them by first name and pre-selects them as the child's parent, so
 * an `id` is required for a usable result. Safe to call whenever the response is
 * present; returns null unless the holder can actually be acted on.
 */
export function mobileTakenUser(data) {
  if (data == null || typeof data !== 'object') return null;
  if (data.id == null) return null;
  const clean = (s) => (s == null ? '' : String(s).trim());
  return {
    id: data.id,
    firstName: clean(data.first_name) || clean(data.full_name).split(' ')[0] || '',
    fullName: clean(data.full_name ?? data.user_name ?? data.name),
  };
}

const VALUE_KEYS = ['id', 'value'];
const LABEL_KEYS = ['display_name', 'label', 'name', 'title'];

function findValueKey(row, explicit) {
  if (explicit && explicit in row) return explicit;
  for (const k of VALUE_KEYS) if (k in row) return k;
  // …otherwise the first `*_id` column, e.g. role_id / category_id.
  return Object.keys(row).find((k) => k.endsWith('_id')) ?? null;
}

function findLabelKey(row, explicit) {
  if (explicit && explicit in row) return explicit;
  for (const k of LABEL_KEYS) if (typeof row[k] === 'string' && row[k]) return k;
  // …otherwise the first `*_name` column, e.g. category_name / pradesh_name.
  const named = Object.keys(row).find((k) => k.endsWith('_name') && typeof row[k] === 'string');
  if (named) return named;
  // Last resort: the first non-id string column, so a row shaped
  // { education_level: 'Graduate' } still labels itself.
  return Object.keys(row).find((k) => typeof row[k] === 'string' && !k.endsWith('_id') && k !== 'id') ?? null;
}

/**
 * `[{ value, label }]` for the form's Select. Rows with no usable id are dropped
 * rather than rendered as an option that cannot be submitted.
 */
export function toOptions(data, { valueKey, labelKey } = {}) {
  const rows = pickRows(data);
  if (!rows.length) return [];

  // A list of bare strings or numbers — `["Yuvak", "Nimit Sevak"]` — is its own
  // value and its own label. Previously this returned nothing, which looked
  // identical to a failed request.
  if (typeof rows[0] !== 'object' || rows[0] === null) {
    return rows
      .filter((r) => r != null && r !== '')
      .map((r) => ({ value: String(r), label: String(r) }));
  }

  const vKey = findValueKey(rows[0], valueKey);
  const lKey = findLabelKey(rows[0], labelKey);
  if (!vKey) return [];

  return rows
    .filter((r) => r?.[vKey] != null)
    .map((r) => ({
      value: String(r[vKey]),
      label: String(lKey ? r[lKey] ?? r[vKey] : r[vKey]),
    }));
}
