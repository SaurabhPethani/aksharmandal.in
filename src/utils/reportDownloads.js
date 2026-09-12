// The Download Report tab, as data.
//
// THE TAB IS BUILT FROM /api/v1/reports-export-filter, NOT FROM THIS FILE.
// The response is keyed by report, and each block carries its own `export_url`
// plus exactly the controls that export accepts:
//
//   { "historical_attendance_summary": {
//       "export_url": "/api/v1/historical-attendance/export",
//       "year": [2025, 2026],
//       "pradesh": { "1": "Hari" }, "mandal": {...}, "sabha": {...} }, ... }
//
// So the endpoint decides which cards exist, which dropdowns each one shows,
// what is in them, and where the download goes. Everything below is either
// presentation (a title nobody would want auto-generated from a snake_case key)
// or the small amount of translation between the block's shape and a query
// string.
//
// WHY THAT MATTERS: the options are DATA-DERIVED and ROLE-MATCHED server side —
// a year / Pradesh / Mandal / Sabha appears only when completed-week records
// actually exist under it, and a filter the caller's role may not pass is
// omitted rather than returned empty. Hard-coding the lists here (which is what
// this file used to do) offered years with nothing in them and Sabhas that had
// never met, and every one of those picks came back as a 404 "no records for
// the selected filters" on download.

/**
 * Block key -> the query parameter its value is sent as.
 *
 * ⚠ THE HIERARCHY KEYS ARE RENAMED. The filter block says `pradesh` / `mandal`
 * / `sabha`; the exports take `pradesh_id` / `mandal_id` / `sabha_id`. Sending
 * the block's own spelling silently filters nothing — FastAPI ignores an
 * unknown query parameter, so the download succeeds and quietly covers the
 * whole scope. `year` / `month` / `range` are already the parameter names.
 *
 * The key order here is the order the controls are drawn in: period first,
 * then place.
 */
export const EXPORT_PARAM = {
  year: 'year',
  month: 'month',
  range: 'range',
  pradesh: 'pradesh_id',
  mandal: 'mandal_id',
  sabha: 'sabha_id',
};

/**
 * The three that are SHARED BY EVERY EXPORT and are therefore lifted out of the
 * cards into one bar at the top of the tab.
 *
 * Safe to share because the endpoint gives every report the same three lists:
 * they all take the same trio and all resolve it through the same
 * `resolve_report_scope`, so the maps are identical block to block. Only the
 * year / month / range dimensions actually differ per report, and those stay on
 * their own card.
 *
 * They are still applied PER CARD against that card's own block (see
 * `hierarchyParams`) — a report that stopped taking one of them would simply
 * not receive it, rather than being sent a parameter it does not accept.
 */
export const HIERARCHY_KEYS = ['pradesh', 'mandal', 'sabha'];

/** The per-report dimensions: what is left once the shared trio is lifted out. */
const DIMENSION_KEYS = Object.keys(EXPORT_PARAM).filter((k) => !HIERARCHY_KEYS.includes(k));

/**
 * Block key -> the control's caption, and its "nothing chosen" row.
 *
 * ONLY THE HIERARCHY TRIO HAS ONE. "All Pradesh" is a real answer — it means
 * every Pradesh in scope, and omitting the parameter is how you ask for that.
 *
 * Year / month / range have none. Their old rows ("Current year", "Default
 * range") described a default the SERVER would apply, which put a value on
 * screen that was not the value in the file: the list opened on "Current year"
 * while 2026 sat right beneath it, both meaning the same thing. Each of those
 * controls now opens on a concrete choice instead (see `defaultValueFor`), and
 * always sends it.
 */
const CONTROL_TEXT = {
  year: { label: 'Year' },
  month: { label: 'Month' },
  range: { label: 'Range' },
  pradesh: { label: 'Pradesh', empty: 'All Pradesh' },
  mandal: { label: 'Mandal', empty: 'All Mandal' },
  sabha: { label: 'Sabha', empty: 'All Sabha' },
};

/**
 * What a dimension control opens on, given its options in display order.
 *
 * `year`  — the first, which is the NEWEST (they sort descending), so the list
 *           opens on the year someone downloading a report almost always wants.
 * `range` — the first, which is MONTHLY: the shortest period, and the one the
 *           enum leads with.
 * `month` — the CURRENT month when the data has one, else the first offered.
 *           The row this replaced said "Current month", so preserving that
 *           meaning keeps the download the same as it was; falling back to the
 *           first matters because the list only holds months that have records.
 */
function defaultValueFor(key, options) {
  if (!options.length) return '';
  if (key === 'month') {
    const thisMonth = String(new Date().getMonth() + 1);
    if (options.some((o) => o.value === thisMonth)) return thisMonth;
  }
  return options[0].value;
}

/**
 * Presentation for the reports the endpoint is known to return. Looked up BY
 * THE API'S OWN KEY, and every field is optional — a report the backend adds
 * tomorrow still renders (see `cardFor`), it just gets a title derived from its
 * key until someone writes a nicer one here.
 */
const EXPORT_CARDS = {
  historical_attendance_summary: {
    title: 'Historical Attendance Summary',
    description: 'Week-wise attendance for every Sabha in your scope across the selected year.',
    filename: 'historical-attendance',
  },
  member_attendance_report: {
    title: 'Members Attendance',
    description: 'Attendance records of individual members over a chosen period range.',
    filename: 'members-attendance',
  },
  min_max_attendance_report: {
    title: 'Min / Max Attendance',
    description: 'Members with the highest and lowest Sabha attendance in the selected range.',
    filename: 'min-max-attendance',
  },
  absent_members_report: {
    title: 'Absent Members',
    description: 'Members who were absent and the number of Sabha weeks they missed.',
    filename: 'absent-members',
  },
  monthly_once_report: {
    title: 'Monthly Once Report',
    description: 'Count of members who attended at least one Sabha in the selected month.',
    filename: 'monthly-once',
  },
};

/** "min_max_attendance_report" -> "Min Max Attendance Report". */
const titleFromKey = (key) =>
  String(key).split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Presentation for one API key, invented from the key when it is not listed. */
export function cardFor(key) {
  return (
    EXPORT_CARDS[key] ?? {
      title: titleFromKey(key),
      description: 'Download this report as an Excel (.xlsx) file.',
      filename: String(key).replace(/_/g, '-'),
    }
  );
}

/**
 * THE SPECIAL SABHA CARD, which /reports-export-filter deliberately does not
 * describe: it is driven by `sabha_detail_id` — one named sitting — rather than
 * by a period, and enumerating every session ever held would be an unbounded
 * list that grows forever and that nobody scrolls. So it stays declared here
 * and keeps its own picker, fed by GET /attendance/sabhadetails?type=special.
 *
 * `/sabha-report/export`, not `/special-sabha-report/export` — that one is a
 * deprecated alias of this. The card is still about special Sabhas because that
 * is what its picker searches; the endpoint itself serves either kind.
 */
export const SPECIAL_SABHA_CARD = {
  key: 'special_sabha_report',
  title: 'Special Sabha Report',
  description: 'Search a Special Sabha by name and download its per-Sabha attendance Excel.',
  exportUrl: '/api/v1/sabha-report/export',
  filename: 'special-sabha',
  picksSpecialSabha: true,
  controls: [],
};

/**
 * THE MEMBERS / PROFILE EXPORT, also declared here rather than served by
 * /reports-export-filter: it is not a period-based attendance report but a full
 * profile dump (one row per member) with attendance folded in as completed-week
 * columns, so it has no year / month / range dimension of its own.
 *
 * It still honours the shared Pradesh / Mandal / Sabha bar — `/users/export`
 * takes all three (`pradesh_id` / `mandal_id` / `sabha_id`) and narrows within
 * the caller's own scope — so it drops into the tab beside the other cards with
 * no card-level controls, exactly like the Special Sabha card.
 */
export const MEMBERS_EXPORT_CARD = {
  key: 'members_export',
  title: 'Members Profile Export',
  description: 'Full profile and completed-week attendance for every member in your scope.',
  exportUrl: '/api/v1/users/export',
  filename: 'members',
  controls: [],
};

/**
 * The one option that is offered but not selectable here.
 *
 * `range` is built server-side from the whole `ReportRange` enum, CUSTOM
 * included — but CUSTOM is the only value that needs `from_date` + `to_date`
 * alongside it, and the filter block describes NEITHER, so there is nothing to
 * build those two inputs from. Passing `range=CUSTOM` without them is a
 * guaranteed 400 ("Custom date range requires both from_date and to_date"), so
 * offering it would hand the reader a button that cannot work.
 *
 * Dropped here rather than by pretending the endpoint sent something else: the
 * proper fix is either a date pair on this card or CUSTOM omitted from the
 * endpoint's `range` map.
 */
const UNSUPPORTED_RANGE = 'CUSTOM';

/**
 * `[value, label]` pairs out of whichever shape the block used for this key.
 *
 * ⚠ `month` IS NESTED BY YEAR: `{ 2025: { 7: "July", … }, 2026: { 1: "January",
 * … } }`, not a flat month→name map. Only the months that actually hold
 * completed-week data for THAT year are listed, which is why the current year
 * stops at the latest month with records instead of offering future ones. Read
 * flat, every label came out as "[object Object]" — the inner map stringified.
 *
 * @param year  the selected year, as a string. Only `month` uses it.
 */
function optionsFrom(key, raw, year) {
  if (key === 'month') {
    const byYear = raw && typeof raw === 'object' ? raw : {};
    // The selected year, or — as a safety net if it is somehow not a key here —
    // the NEWEST year on offer, which is what the year control defaults to.
    const newest = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))[0];
    const months = byYear[String(year)] ?? byYear[newest] ?? {};
    return Object.entries(months)
      .map(([value, label]) => ({ value, label: String(label) }))
      // Jan..Dec. Object.entries on integer-like keys already yields ascending
      // numeric order, but this does not depend on that quirk holding.
      .sort((a, b) => Number(a.value) - Number(b.value));
  }
  return flatOptionsFrom(key, raw);
}

/** The simple shapes: a list of ints (`year`) or one value→label map. */
function flatOptionsFrom(key, raw) {
  // `year` is a plain list of ints; newest first, which is what anyone reaching
  // for a year filter wants at the top.
  if (Array.isArray(raw)) {
    return [...raw]
      .sort((a, b) => Number(b) - Number(a))
      .map((y) => ({ value: String(y), label: String(y) }));
  }
  // Everything else is an id/value -> name map. JSON object keys are strings, so
  // the numeric ids arrive as "1", "2" — which is exactly what a <select> wants.
  if (raw && typeof raw === 'object') {
    const entries = Object.entries(raw)
      .filter(([value]) => !(key === 'range' && value === UNSUPPORTED_RANGE))
      .map(([value, label]) => ({ value, label: String(label) }));

    // ⚠ THE SERVER'S ORDER DOES NOT SURVIVE THE TRIP. JavaScript iterates
    // INTEGER-LIKE object keys in ascending numeric order whatever order they
    // were written in, so the API's careful `ORDER BY name` is destroyed the
    // moment the JSON is parsed: `{"11": "Amrut", "4": "Anand"}` comes back out
    // of Object.entries as Anand (4) then Amrut (11). Pradesh / Mandal / Sabha
    // are therefore re-sorted alphabetically, which is the order the endpoint
    // intended and the only one someone can scan for a Sabha in.
    //
    // `range` is left alone: its keys are words, not integers, so insertion
    // order survives — and that order is the enum's own MONTHLY → YEARLY
    // progression, which is more useful than alphabetical.
    if (key !== 'range') {
      entries.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    }
    return entries;
  }
  return [];
}

/**
 * One filter block -> the controls to draw, in `EXPORT_PARAM` order.
 *
 * A key the block does not carry produces no control: the endpoint omits a
 * filter the export would ignore, and one the caller's role may not pass, so
 * "absent" already means "do not draw this".
 *
 * A hierarchy control leads with an "All …" row: choosing it omits the
 * parameter and asks for the whole scope. A dimension control has no such row —
 * it opens on `defaultValue` and always sends something.
 *
 * ⚠ THE MONTH CONTROL DEPENDS ON THE YEAR CONTROL, so the year has to be
 * settled before anything else is built. `selected` is the card's current
 * choices (keyed by query parameter); the year taken from it decides which
 * year's month list is returned, and changing the year rebuilds that list.
 *
 * @param keys      which slice of the block to build — the per-report dimensions
 *                  by default, or `HIERARCHY_KEYS` for the shared bar.
 * @param selected  the card's current selections, keyed by query parameter.
 */
export function controlsFrom(block, { keys = DIMENSION_KEYS, selected = {} } = {}) {
  if (!block) return [];

  // Settle the year FIRST — it is what `month` is looked up under. Its own
  // options depend on nothing, so this cannot recurse.
  const yearOptions = block.year == null ? [] : optionsFrom('year', block.year);
  const chosenYear = selected[EXPORT_PARAM.year];
  const activeYear = yearOptions.some((o) => o.value === chosenYear)
    ? chosenYear
    : defaultValueFor('year', yearOptions);

  return keys
    .filter((key) => block[key] != null)
    .map((key) => {
      const text = CONTROL_TEXT[key];
      const values = key === 'year' ? yearOptions : optionsFrom(key, block[key], activeYear);
      const isHierarchy = HIERARCHY_KEYS.includes(key);
      return {
        key,
        name: EXPORT_PARAM[key],
        label: text.label,
        options: isHierarchy ? [{ value: '', label: text.empty }, ...values] : values,
        // '' for the hierarchy trio — "All", i.e. send nothing.
        defaultValue: isHierarchy ? '' : defaultValueFor(key, values),
      };
    })
    // A hierarchy control needs a real option BESIDE its "All" row to be worth
    // drawing; a dimension control needs one at all. Either way an empty list
    // means the endpoint had nothing to offer, and a dropdown you cannot choose
    // anything in is worse than no dropdown.
    .filter((control) => control.options.length > (HIERARCHY_KEYS.includes(control.key) ? 1 : 0));
}

/** The shared Pradesh / Mandal / Sabha controls, in hierarchy order. */
export const hierarchyControlsFrom = (block) => controlsFrom(block, { keys: HIERARCHY_KEYS });

/**
 * The shared selection, narrowed to what THIS export actually accepts.
 *
 * `scope` is keyed by query parameter (`pradesh_id`, …) and is one object for
 * the whole tab; a report whose block does not carry the matching key is not
 * sent it. So the bar can stay common without any card ever receiving a
 * parameter its endpoint would reject or quietly ignore.
 */
export function hierarchyParams(block, scope = {}) {
  const out = {};
  if (!block) return out;
  for (const key of HIERARCHY_KEYS) {
    if (block[key] == null) continue;
    const name = EXPORT_PARAM[key];
    const value = scope[name];
    if (value !== undefined && value !== '') out[name] = value;
  }
  return out;
}
