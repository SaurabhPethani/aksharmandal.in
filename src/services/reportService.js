import { api } from '../api/client';

// Everything the Reports screen reads or downloads.
//
// Field names and parameters verified against the OpenAPI document on
// 2026-08-03. The three "read" endpoints answer JSON; the seven exports answer
// an Excel file and are fetched as blobs — see `downloadReport` below.

// ⚠ THE THREE READS BELOW ASK FOR THE WHOLE ENVELOPE (`envelope: true`).
//
// Each carries a `filters` block BESIDE `data` — `{ status_code, detail, data,
// filters }` — listing the Pradeshes / Mandals / Sabhas / years this caller is
// allowed to filter by (`ReportFilters` in the OpenAPI document). Unwrapped to
// `data` the block would be discarded, and the filter bar would have to guess
// the caller's scope from the hierarchy endpoints instead of being told it.
//
// The hooks in hooks/useReports.js split the envelope back into `data` and
// `filters`, so screens still read `query.data` as the payload.

export const reportService = {
  /**
   * GET /api/v1/report-overview -> EIGHT figures, scoped to the caller's
   * hierarchy. Gated on REPORTS:READ. Optional filters: year, pradesh_id,
   * mandal_id, sabha_id.
   *
   *   total_users      int   ACTIVE members in scope (status = true)
   *   active_in_4w     int   distinct members present at ≥1 Sabha, last 4 weeks
   *   active_in_12w    int   the same reach over the last 12 weeks
   *   last_sabha       int   present in the most recent completed week in scope
   *   lapsed           int   was coming, has stopped
   *   retained         int   drifted off and has come back
   *   new_added        int   unseen for 12 weeks, now attending
   *   yuva_seva_rate   int   % of the active base with a Yuva Seva in 30 days
   *
   * The trio reads the SAME 12 completed weeks `active_in_12w` covers, cut into
   * three equal 4-week blocks by week_date, newest first — W1 (weeks 0-4), W2
   * (4-8), W3 (8-12):
   *
   *   lapsed    W2 present, W1 absent
   *   retained  W3 present, W2 ABSENT, W1 present   <- the gap is required
   *   new_added W3 and W2 both absent, W1 present
   *
   * ⚠ THESE THREE DO NOT ADD UP TO THE MEMBER BASE and must not be rendered as
   * if they did (no stacked bar, no "% of total"). A member who attended right
   * through the 12 weeks is in NONE of them — the trio is follow-up workload,
   * not a headcount. `total_users` and the Active 4W/12W pair are the counts.
   * In particular `retained` is NOT "our regulars": the W2 gap means WON BACK.
   *
   * Equal blocks on purpose: `lapsed` used to compare last calendar month
   * against this one, which on the 8th of a month judged members absent on one
   * week of evidence against four and reported nearly everybody as lapsed.
   *
   * ⚠ ALL EIGHT ARE PLAIN INTEGERS. They used to be `{ number, percentage }`
   * objects, and the payload also carried `active_users`, `inactive_users`,
   * `followup_pending`, `absent_yuvak`, `todays_attendance`, `total_sabhas`,
   * `total_mandals`, `birthdays_today`, `new_users_this_month`,
   * `user_category_distribution` and an `attendance` week series. None of those
   * exist any more — reading `.number` off any of these now yields undefined.
   *
   * `total_users` IS THE ACTIVE BASE, so it is the ceiling for the six counts
   * beside it and the denominator of `yuva_seva_rate`: none can exceed it, and
   * the rate cannot exceed 100. `active_in_4w <= active_in_12w` likewise — the
   * 4-week window is the tail of the 12-week one.
   *
   * Every window here counts a member ONCE however many Sabhas they attended,
   * and every one of them excludes the current in-progress week — including the
   * retention trio, which is why it is safe to read mid-week: a half-marked
   * week can no longer push members into `lapsed`. Neither the trio nor
   * `yuva_seva_rate` is moved by the `year` filter; all four are anchored to the
   * weeks ending today. `year` narrows the three reach figures only.
   *
   * The response still carries `filters` beside `data` (see the note above).
   */
  overview: (params) => api.get('/api/v1/report-overview', { params, envelope: true }),

  /**
   * GET /api/v1/reports/compare — two periods of the same granularity, side by
   * side on Present / Absent.
   *
   *   params: { granularity: 'day'|'week'|'month', a, b, pradesh_id?, mandal_id?, sabha_id? }
   *     a / b are YYYY-MM-DD for day & week (snapped to the week's Monday), YYYY-MM for month.
   *   -> { data: { granularity, period_a:{key,label,present,absent},
   *                period_b:{...}, delta:{present,absent} }, filters }
   *
   * Envelope kept so the sibling `filters` (authorized pradesh/mandal/sabha
   * options) survives for the scope bar — same as `overview`.
   */
  compare: (params) => api.get('/api/v1/reports/compare', { params, envelope: true }),

  /**
   * GET /api/v1/report-overview/members — the members behind ONE retention KPI,
   * for the popup that opens when Lapsed / Retain / New is clicked.
   *
   *   { status_code, detail, bucket, total, members: [{ user_id, name, mobile_number }] }
   *
   * `bucket` is 'lapsed' | 'retained' | 'new_added' — the same key the tile's
   * number was read from.
   *
   * ⚠ `envelope: true` IS REQUIRED HERE. Without it the client returns
   * `body.data` (see api/client.js), and this response has NO `data` block —
   * `bucket`, `total` and `members` sit at the top level beside `status_code`.
   * Omitting the flag resolves the whole query to `undefined`, which React Query
   * reports as "data is undefined" rather than as a network failure, so it reads
   * like the endpoint is broken when it is the unwrapping that is wrong.
   *
   * PASS THE SAME SCOPE PARAMS THE OVERVIEW WAS FETCHED WITH — pradesh_id /
   * mandal_id / sabha_id. Both endpoints resolve the identical window, so
   * `total` then equals the tile exactly. Send different filters and you get a
   * correct list of a different question.
   *
   * 403 below Yuva Seva rank: a Yuvak may read the figures but not the names.
   * `canDrillIntoKpi` in constants/roles.js keeps the button from being offered,
   * but the backend is the gate.
   */
  overviewMembers: (params) =>
    api.get('/api/v1/report-overview/members', { params, envelope: true }),

  /** GET /api/v1/weekly-reports — `{ weekly_trends: [ { year, months: [...] } ] }`. */
  weeklyReports: (params) => api.get('/api/v1/weekly-reports', { params, envelope: true }),

  /**
   * GET /api/v1/weekly-sabha-report-list — Present counts per Sabha for the last
   * four completed weeks: `{ mandal_id, mandal_name, data: [ { sabha_id,
   * sabha_name, change, change_percentage, "27-Jul-2026": 0, … } ] }`.
   *
   * The week columns are DATE-KEYED, so the table's columns are discovered from
   * the row rather than declared here — a fixed set would go stale every week.
   *
   * THREE RESPONSES FROM ONE ENDPOINT, chosen by what is sent:
   *   (nothing)                    one row per Sabha, with week COUNTS
   *   sabha_id                     data[0].users = that Sabha's follow-up persons
   *   sabha_id + followup_user_id  data[0].users = that person's members
   *
   * The last two answer Y/N per week per person rather than counts. So
   * `sabha_id` here is NOT a filter — it changes what the endpoint returns,
   * which is why the filter bar on this tab must not send one.
   */
  weeklySabhaReportList: (params) =>
    api.get('/api/v1/weekly-sabha-report-list', { params, envelope: true }),

  /**
   * GET /api/v1/sabha-report?sabha_detail_id={id}
   *
   * ONE SITTING, REGULAR OR SPECIAL, broken down by the Sabhas whose members
   * were invited: `{ special_sabha: {…}, data: [SpecialSabhaSabhaStat],
   * total: {…} }`. The totals row comes from the API rather than being summed
   * here — percentages do not add up, and a locally summed total would disagree
   * with the export.
   *
   * ⚠ `/special-sabha-report` IS THE DEPRECATED ALIAS OF THIS and must not be
   * called. It is the same handler under the older name, from when the report
   * existed for special sittings only; `sabha-report` is the one that documents
   * itself as serving both.
   */
  sabhaReport: (sabhaDetailId) =>
    api.get('/api/v1/sabha-report', { params: { sabha_detail_id: sabhaDetailId } }),

  /**
   * GET /api/v1/sitting-report-heads?sabha_detail_id={id} — the LIVE per-head
   * report for one sitting: each follow-up head with their members' present /
   * absent across this sitting (live) plus the three before it. Feeds the
   * WhatsApp reports on the single-sitting attendance report page.
   */
  sittingReportHeads: (sabhaDetailId) =>
    api.get('/api/v1/sitting-report-heads', { params: { sabha_detail_id: sabhaDetailId } }),

  /**
   * GET /api/v1/reports/yuva-seva-report — the caller's assigned members, how
   * stale each follow-up is, and its priority.
   *
   * Answers a NON-standard envelope: the four totals sit beside `data` at the
   * top level rather than inside it — `{ status_code, detail, data: [...],
   * total_count_15_days, … }` — so this one asks for the whole body. Unwrapped
   * to `data` the totals would be thrown away.
   *
   * It lives under /reports but belongs to the Yuva Seva screen, which is where
   * the members it lists are followed up.
   */
  yuvaSevaReport: (params) =>
    api.get('/api/v1/reports/yuva-seva-report', { params, envelope: true }),

  /**
   * GET /api/v1/reports-export-filter — the Download Report tab's pickers.
   * Gated on REPORTS:DOWNLOAD, like the exports they drive.
   *
   * `{ <report_key>: { export_url, year?, month?, range?, pradesh?, mandal?,
   * sabha? } }`, one block per export. The block carries ONLY the controls that
   * export accepts and that this caller's role may pass, so an absent key means
   * "do not draw this filter" — never "draw it empty".
   *
   * ⚠ TAKES NO PARAMETERS, DELIBERATELY. It answers "what may I choose", which
   * is a fact about the caller's hierarchy, not about what they have picked so
   * far. Passing the current selection back would collapse each list to the one
   * value already chosen, with no way back to the others. The selection belongs
   * on the export call.
   *
   * Fetched once for the whole tab rather than per card — one response
   * describes every export.
   */
  exportFilters: () => api.get('/api/v1/reports-export-filter'),

  /**
   * The Excel exports, all gated on REPORTS:DOWNLOAD.
   *
   * `responseType: 'blob'` so the bytes arrive intact; the interceptor passes a
   * non-envelope body through untouched. Parsed as JSON it would be corrupted
   * before anything could save it.
   *
   * `path` comes from the matching block's `export_url` above, not from a
   * constant here — the endpoint names its own download URL, so a moved export
   * does not need a frontend edit.
   *
   * A LONGER TIMEOUT THAN THE CLIENT-WIDE 60s. This is the one call that does
   * real work server-side before a byte comes back — a Pradesh-wide workbook is
   * queried, built and streamed — so it is the one call that could legitimately
   * outlive a backstop meant to catch hung sockets. 3 minutes keeps the export
   * working while still guaranteeing it ends rather than hanging forever.
   */
  download: (path, params) =>
    api.get(path, { params, responseType: 'blob', timeout: 180_000 }),
};

/**
 * Logging one Yuva Seva — POST /api/v1/yuva-seva, `YuvaSevaCreate`:
 * `{ user_id, mode, date, time, duration, remark? }`, the first five required.
 * `date` must be today or earlier; a future one is a 400.
 *
 * Create only. The screen reads its rows from the REPORT
 * (/reports/yuva-seva-report), which already carries each member's latest
 * interaction and counts — so neither the list endpoint nor the update is used,
 * and neither is wrapped here.
 */
export const yuvaSevaService = {
  create: (payload) => api.post('/api/v1/yuva-seva', payload, { envelope: true }),
};

/** Generic list fetch for the registry-configured module endpoints. */
export const listService = {
  fetch: (endpoint, params) => api.get(endpoint, { params }),
};
