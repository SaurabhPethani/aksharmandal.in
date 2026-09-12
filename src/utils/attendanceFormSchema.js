// ---------------------------------------------------------------------------
// ADD SPECIAL SABHA / ADD SCHEDULE — FIELD SCHEMAS
// ---------------------------------------------------------------------------
// Both screens are the same generic popup (components/attendance/AttendanceRecordDialog.jsx) driven by
// one of the definitions below, so adding or renaming a field is an edit here.
//
// FIELD NAMES ARE VERIFIED against the live OpenAPI document (2026-07-31):
// `SabhaDetailsCreate` and `SabhaScheduleCreate`. They were previously inferred
// from the shape the *list* responses are read with, and not one name matched —
// both screens failed on every submit. Re-check against the spec rather than the
// conventions before adding a field here, and run `npm run verify:contract`.

/**
 * A form definition:
 *   endpoint    which attendanceService call posts it
 *   constants   merged into the payload verbatim — values the screen implies
 *               rather than asks for
 *   invalidate  query key refreshed on success, so the tab behind shows the new row
 */

/**
 * `day` is a free-text weekday on the API ("Sunday"). Offered as a fixed list
 * because a schedule is a *recurrence*, not a date, and free text would let two
 * spellings of the same day exist side by side.
 */
export const WEEKDAY_OPTIONS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
].map((d) => ({ value: d, label: d }));

/**
 * POST /api/v1/attendance/sabhaschedule — the weekly recurrence for a Sabha.
 *
 * This is a day-of-week and a time ("every Sunday, 18:30"), NOT a dated event:
 * the backend materialises the individual sittings from it. The form used to ask
 * for a date and an end time, neither of which the endpoint has a field for.
 *
 * `sabha_id` is a hierarchy Sabha (GET /api/v1/sabha), not a sabha *detail* —
 * a schedule hangs off the Sabha itself.
 */
export const SCHEDULE_FORM = {
  key: 'schedule',
  title: 'Add Schedule',
  subtitle: 'Set the weekly day and time a Sabha takes place.',
  submitLabel: 'Create Schedule',
  endpoint: 'createSabhaSchedule',
  // Editing reuses every field: `SabhaScheduleUpdate` declares the same four,
  // and all four together are what the recurrence is.
  editTitle: 'Edit Schedule',
  editSubtitle: 'Change the Sabha, day or time this recurrence runs on.',
  editSubmitLabel: 'Save Schedule',
  updateEndpoint: 'updateSabhaSchedule',
  editSuccessMessage: 'Schedule updated.',
  invalidate: ['sabha-schedules'],
  successMessage: 'Schedule created.',
  fields: [
    { name: 'sabha_id', label: 'Sabha', type: 'select', placeholder: 'Select sabha', lookup: 'sabhas', optionLabelKey: 'sabha_name', rules: ['required'] },
    { name: 'day', label: 'Day of Week', type: 'select', placeholder: 'Select day', options: WEEKDAY_OPTIONS, rules: ['required'] },
    { name: 'time', label: 'Start Time', type: 'time', rules: ['required'], hint: 'The time this Sabha starts each week.' },
    {
      /**
       * Whether the cron still materialises sittings from this recurrence.
       * Inactive is how a schedule is retired without deleting it and losing the
       * sittings it already produced.
       *
       * A BOOLEAN on the API — `SabhaScheduleUpdate.status` and
       * `SabhaScheduleCreate.status` are both `bool` — so the select's string is
       * converted on the way out, not sent as "true".
       *
       * It was a hidden constant (`{ status: true }`) and is a field now: a
       * schedule still starts Active, but editing one can also stand it down.
       */
      name: 'status',
      label: 'Status',
      type: 'select',
      options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }],
      defaultValue: 'true',
      boolean: true,
      span: 2,
    },
  ],
};

/**
 * POST /api/v1/attendance/sabhadetails — a one-off Sabha.
 *
 * `vakta` (the primary speaker) is REQUIRED and the form previously had no input
 * for it, so this screen could not have succeeded even with the names corrected.
 *
 * The backend rejects a (date, time) in the past — `notPast` catches the common
 * case here so the error names the field rather than arriving as a bare 400.
 */
export const SPECIAL_SABHA_FORM = {
  key: 'special-sabha',
  title: 'New Session',
  subtitle: null,
  submitLabel: 'Create Session',
  submitVariant: 'accent',
  size: 'md',
  endpoint: 'createSabhaDetail',
  invalidate: ['sabha-details'],
  successMessage: 'Special Sabha created.',
  constants: {
    // Active on creation. `status` defaults true server-side; sent explicitly so
    // a Sabha created here is live regardless of what that default becomes.
    status: true,
  },
  fields: [
    { name: 'special_sabha_name', label: 'Sabha Title', type: 'text', placeholder: 'e.g. Janmashtami Samaiyo', rules: ['required'], span: 2 },
    {
      /**
       * Shown, not assumed — the field says what is being created. Only one
       * option, because the endpoint rejects anything else: regular sittings are
       * materialised from a schedule by a cron, never created by hand.
       */
      name: 'type',
      label: 'Type',
      type: 'select',
      options: [{ value: 'special', label: 'Special' }],
      defaultValue: 'special',
      rules: ['required'],
    },
    { name: 'date', label: 'Date', type: 'date', rules: ['required', 'date', 'notPast'] },
    { name: 'time', label: 'Time', type: 'time', rules: ['required'], span: 2 },
    { name: 'vakta', label: 'Vakta', type: 'text', placeholder: 'Main speaker', rules: ['required'], span: 2 },
    { name: 'vakta1', label: 'Vakta 2', type: 'text', placeholder: 'Optional' },
    { name: 'vakta2', label: 'Vakta 3', type: 'text', placeholder: 'Optional' },
    // Required so a fresh Special Sabha lands with the same "ready to mark"
    // guarantee a Regular one does — see the note on the SABHA_SESSION_FORM
    // Topic field below for the gate this ties into.
    { name: 'topic', label: 'Topic', type: 'text', placeholder: 'Session topic', rules: ['required'], span: 2 },
    { name: 'reference_name', label: 'Reference Name', type: 'text', placeholder: 'Reference name (optional)', span: 2 },
    {
      /**
       * Whether the Sabha accepts attendance. An integer on the API, so the
       * chosen value is coerced — a select's value is always a string, and "1"
       * is not what `is_available_for_attendance: int` asks for.
       *
       * Closed by default, matching the endpoint's own default: a session is
       * usually set up ahead of time and opened when it starts.
       */
      name: 'is_available_for_attendance',
      label: 'Open for Attendance',
      type: 'select',
      options: [{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }],
      defaultValue: '0',
      numeric: true,
      span: 2,
    },
  ],
};

/**
 * PATCH /api/v1/attendance/sabhadetails/{id} — editing one sitting.
 *
 * The same form for BOTH types. A regular Sabha and a special one differ in how
 * they came to exist — a cron materialises the first from a schedule, a person
 * creates the second — but once they exist the editable part is identical, and
 * it is the session detail: who speaks, what about, who arranged it.
 *
 * Deliberately NOT the create form with fields removed. `SabhaDetailsUpdate`
 * declares no `date`, `time` or `type`: when a Sabha happens is not editable
 * after the fact — that would be a different sitting — and neither is the name
 * a regular Sabha inherits from its Sabha. Only these five are offered.
 */
export const SABHA_SESSION_FORM = {
  key: 'sabha-session',
  editTitle: 'Edit Session',
  editSubtitle: null,
  editSubmitLabel: 'Save Changes',
  // Orange, like the tab's own call to action.
  submitVariant: 'accent',
  updateEndpoint: 'updateSabhaDetail',
  editSuccessMessage: 'Session updated.',
  invalidate: ['sabha-details'],
  fields: [
    { name: 'vakta', label: 'Vakta', type: 'text', placeholder: 'Main speaker', rules: ['required'], span: 2 },
    { name: 'vakta1', label: 'Vakta 2', type: 'text', placeholder: 'Optional' },
    { name: 'vakta2', label: 'Vakta 3', type: 'text', placeholder: 'Optional' },
    // Required: attendance marking is gated on both Vakta and Topic being
    // present (see AttendancePage's onMark handler), so the form has to
    // enforce them too — otherwise a Sabha Head who fills only Vakta lands
    // back in the same dialog on the very next click.
    { name: 'topic', label: 'Topic', type: 'text', placeholder: 'Session topic', rules: ['required'], span: 2 },
    {
      // Free text, deliberately. `reference_name` is the Sabha's own reference —
      // whatever it is arranged under — and is not a member: it was briefly a
      // picker over the Mandal directory, which implied a link that does not
      // exist and refused any reference not in it.
      name: 'reference_name',
      label: 'Reference Name',
      type: 'text',
      placeholder: 'Reference name (optional)',
      span: 2,
    },
    {
      /**
       * Whether this sitting accepts attendance, on SPECIAL Sabhas only.
       *
       * `specialOnly` is why: a regular sitting is materialised by the cron
       * already open, and closing one from here would take it out of the
       * scanner's dropdown for reasons nobody could see afterwards. A special
       * Sabha is set up by hand, often weeks ahead, and is opened when it
       * starts — so it is the one that needs the switch.
       */
      name: 'is_available_for_attendance',
      label: 'Open for Attendance',
      type: 'select',
      options: [{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }],
      numeric: true,
      specialOnly: true,
      span: 2,
    },
  ],
};
