// Field rules and payload building, shared by every schema-driven form
// (utils/userFormSchema.js, utils/attendanceFormSchema.js).
//
// Rules are (value, values) -> message | null, so a rule can consider the rest of
// the form. Blank is not an error here: `required` is the only rule that speaks
// to emptiness, which lets optional fields still be format-checked.

export const isBlank = (v) => v == null || String(v).trim() === '';

/**
 * Today as `yyyy-MM-dd`, in LOCAL time — the format a native date input's `min`
 * and `max` attributes take.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that is UTC, so east of
 * Greenwich it names yesterday for the first hours of the day and the picker
 * would grey out a date the user can legitimately choose.
 */
export function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const RULES = {
  required: (v) => (isBlank(v) ? 'This field is required.' : null),

  mobile: (v) =>
    isBlank(v) || /^\d{10}$/.test(String(v).trim()) ? null : 'Enter exactly 10 digits.',

  samparkId: (v) =>
    isBlank(v) || /^\d{3,7}$/.test(String(v).trim()) ? null : 'Enter between 3 and 7 digits.',

  /**
   * A person's name: ENGLISH letters, and the separators real names use.
   *
   * DIGITS ARE THE POINT. Event registration accepted "Amit123" and saved it,
   * because the only check on those fields was that they were not blank — here
   * and on the backend both.
   *
   * ENGLISH ONLY, BY DECISION. An earlier version of this rule used `\p{L}`
   * plus `\p{M}` so Gujarati and Devanagari names passed. That was reverted on
   * request: names are to be stored in English throughout, so a Gujarati name is
   * rejected here rather than half-supported. Note if this is ever revisited —
   * `\p{L}` alone is NOT enough for Indic scripts, because they carry vowels as
   * combining MARKS ("અમિત" is letter-letter-MARK-letter), so `\p{M}` has to
   * come with it or most such names are rejected anyway.
   *
   * Spaces, hyphens and apostrophes are ALLOWED. Letters-only would reject
   * "D'Souza", "Al-Rashid" and a first name written as two words, which is a
   * worse failure than the one being fixed — the complaint is numbers, not
   * punctuation.
   *
   * Blank is not an error — `required` owns emptiness, per the note at the top.
   */
  personName: (v) =>
    isBlank(v) || /^[A-Za-z][A-Za-z\s'-]*$/.test(String(v).trim())
      ? null
      : 'Use English letters only — no numbers or symbols.',

  /**
   * A real address: a local part, an `@`, a dotted domain, and a TLD that is
   * letters only (`.com`, `.in`, `.co.uk`).
   *
   * The looser `[^\s@]+@[^\s@]+\.[^\s@]{2,}` this replaces accepted `a@!!.##`
   * and `a@.com` — anything without a space or a second `@` passed. Each part is
   * spelled out instead: the local part allows the punctuation addresses
   * actually use but may not start, end or double up on a dot; every domain
   * label must begin and end alphanumeric; the TLD is 2+ letters.
   */
  email: (v) =>
    isBlank(v) ||
    /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/
      .test(String(v).trim())
      ? null
      : 'Enter a valid email address, e.g. name@example.com.',

  pincode: (v) =>
    isBlank(v) || /^\d{6}$/.test(String(v).trim()) ? null : 'Enter exactly 6 digits.',

  date: (v) => {
    if (isBlank(v)) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? 'Enter a valid date.' : null;
  },

  /**
   * A date of birth in the future is always a typo. The date input also carries
   * `max=today` so the calendar greys those days out, but the picker is only the
   * first gate: a typed date, a pasted one, or a prefilled record can all still
   * arrive here, so this is what actually blocks the value.
   *
   * Compared at day granularity — a date-only string parses as UTC midnight
   * while `new Date()` is local, so a strict `>` would call today "future" for
   * anyone west of Greenwich.
   */
  notFuture: (v) => {
    if (isBlank(v)) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null; // `date` reports the format error
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return d > endOfToday ? 'Date cannot be in the future.' : null;
  },

  /**
   * The inverse, for something being scheduled. The backend rejects a Special
   * Sabha whose (date, time) is in the past; catching it here names the field
   * instead of returning a 400 the form cannot attach to anything.
   *
   * Compared at day granularity, so "today" passes — the backend owns the
   * finer (date, time) check and the browser's clock is not authoritative.
   */
  notPast: (v) => {
    if (isBlank(v)) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null; // `date` reports the format error
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today ? 'Date must be today or later.' : null;
  },

  year: (v) =>
    isBlank(v) || /^\d{4}$/.test(String(v).trim()) ? null : 'Enter a 4-digit year.',

  /** Secondary mobile must differ from the primary one. */
  notPrimaryMobile: (v, values) =>
    isBlank(v) || String(v).trim() !== String(values?.mobile_number ?? '').trim()
      ? null
      : 'Must differ from the primary mobile number.',

  /** End time must come after the start time on the same day. */
  afterStart: (v, values) =>
    isBlank(v) || isBlank(values?.start_time) || String(v) > String(values.start_time)
      ? null
      : 'Must be later than the start time.',
};

/** Runs one field's rules, first message wins. */
export function validateField(field, value, values) {
  for (const ruleName of field.rules ?? []) {
    const message = RULES[ruleName]?.(value, values);
    if (message) return message;
  }
  return null;
}

/** Validates a flat list of fields. */
export function validateFields(fields, values) {
  const errors = {};
  for (const field of fields) {
    const message = validateField(field, values[field.name], values);
    if (message) errors[field.name] = message;
  }
  return errors;
}

/**
 * Form state -> request body.
 *
 * Text is trimmed and blanks are dropped entirely rather than sent as `''`, so an
 * untouched optional field contributes nothing. Ids are sent as numbers — selects
 * hold their values as strings. Booleans are always sent, since `false` is a real
 * answer rather than an absent one. Arrays recurse, so repeatable sections are
 * cleaned the same way and an empty list is omitted.
 */
const ID_FIELD = /_id$/;

/**
 * `*_id` fields that are NOT always ids, and so must never be turned into one.
 *
 * `nature_of_business_id` takes an integer OR a string: an integer is an
 * existing master row, a string is a name the backend matches or creates. The
 * Business form types it, so a member whose business nature is "24" (a shop
 * number, a route, a plot) would have it read as master row 24 — silently the
 * wrong record, or a 400 if no such row exists. Sent as typed, it stays a name.
 */
const ID_FIELD_EXCEPTIONS = new Set(['nature_of_business_id']);

const coerce = (key, raw) => {
  const value = typeof raw === 'string' ? raw.trim() : raw;
  if (ID_FIELD_EXCEPTIONS.has(key)) return value;
  if (ID_FIELD.test(key) && typeof value !== 'boolean' && /^\d+$/.test(String(value))) return Number(value);
  return value;
};

export function buildPayload(values) {
  const payload = {};

  for (const [key, raw] of Object.entries(values)) {
    if (Array.isArray(raw)) {
      const items = raw
        .map((item) => buildPayload(item))
        .filter((item) => Object.keys(item).length > 0);
      if (items.length) payload[key] = items;
      continue;
    }

    if (typeof raw === 'boolean') { payload[key] = raw; continue; }

    const value = coerce(key, raw);
    if (value == null || value === '') continue;
    payload[key] = value;
  }

  return payload;
}
