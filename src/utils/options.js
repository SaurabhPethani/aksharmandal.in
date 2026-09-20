export function searchMatches(haystack, query) {
  const tokens = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const text = String(haystack ?? '').toLowerCase();
  return tokens.every((t) => text.includes(t));
}

export function pickRows(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['items', 'results', 'records', 'data', 'users', 'list']) {
    if (Array.isArray(data[key])) return data[key];
  }
  const arrays = Object.values(data).filter(Array.isArray);
  return (
    arrays.find((a) => a.length > 0 && typeof a[0] === 'object' && a[0] !== null)
    ?? arrays.find((a) => a.length > 0)
    ?? []
  );
}

export function isMobileTaken(data) {
  if (data == null) return false;
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

export function mobileTakenLabel(data) {
  const base = 'This mobile number is already registered';
  if (data == null || typeof data !== 'object') return `${base}.`;

  const clean = (s) => (s == null ? '' : String(s).trim());
  const name = clean(data.full_name ?? data.user_name ?? data.name);
  const place = [clean(data.sabha_name), clean(data.mandal_name)].filter(Boolean).join(' - ');

  let who = name;
  if (place) who = who ? `${who} ( ${place} )` : `( ${place} )`;

  return who ? `${base} with ${who}.` : `${base}.`;
}

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
  return Object.keys(row).find((k) => k.endsWith('_id')) ?? null;
}

function findLabelKey(row, explicit) {
  if (explicit && explicit in row) return explicit;
  for (const k of LABEL_KEYS) if (typeof row[k] === 'string' && row[k]) return k;
  const named = Object.keys(row).find((k) => k.endsWith('_name') && typeof row[k] === 'string');
  if (named) return named;
  return Object.keys(row).find((k) => typeof row[k] === 'string' && !k.endsWith('_id') && k !== 'id') ?? null;
}

export function toOptions(data, { valueKey, labelKey } = {}) {
  const rows = pickRows(data);
  if (!rows.length) return [];

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
