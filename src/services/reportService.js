import { api } from '../api/client';

// Everything the Reports screens read or download — ported from the web app.
//
// The RN `api` client (src/api/client.js) matches the web's contract: a plain
// `api.get(path, { params })` unwraps the StandardResponse to `body.data`, and
// `{ envelope: true }` returns the whole `{ status_code, detail, data, filters }`
// body instead. Several reports below carry a sibling `filters` block (or put
// their payload at the top level), so they ask for the envelope.
//
// Field names and parameters were verified against the OpenAPI document on the
// web side; this file is a faithful port so the two clients stay in step.

export const reportService = {
  /**
   * GET /api/v1/report-overview -> EIGHT figures, scoped to the caller's
   * hierarchy. Gated on REPORTS:READ. Optional filters: year, pradesh_id,
   * mandal_id, sabha_id.
   *
   *   total_users / active_in_4w / active_in_12w / last_sabha /
   *   lapsed / retained / new_added / yuva_seva_rate — all plain integers.
   *
   * The response carries `filters` beside `data`, split out by useReports.
   */
  overview: (params) => api.get('/api/v1/report-overview', { params, envelope: true }),

  /**
   * GET /api/v1/reports/souls -> the six Yuva Seva 'soul' buckets + active base,
   * scoped to the caller's hierarchy. `filters` rides along for the scope bar.
   */
  souls: (params) => api.get('/api/v1/reports/souls', { params, envelope: true }),

  /** GET /api/v1/reports/souls/members?band=… -> the members behind one soul KPI. */
  soulMembers: (params) => api.get('/api/v1/reports/souls/members', { params, envelope: true }),

  /** GET /api/v1/reports/souls/age-members?min_age=&max_age=&category= -> the
   *  members in one age bucket (category 'all' | 'ak'). */
  soulAgeMembers: (params) => api.get('/api/v1/reports/souls/age-members', { params, envelope: true }),

  /**
   * GET /api/v1/reports/sabha-scorecard -> the Sabha Health Scorecard: one
   * health-ranked row per Sabha in scope + a TOTAL row. `rows`/`total`/`filters`
   * ride at the top level (not under `data`), so the envelope is kept.
   */
  sabhaScorecard: (params) => api.get('/api/v1/reports/sabha-scorecard', { params, envelope: true }),

  /**
   * GET /api/v1/reports/compare — two periods of the same granularity, side by
   * side on Present / Absent. Envelope kept so the sibling `filters` survives.
   *   params: { granularity: 'day'|'week'|'month', a, b, pradesh_id?, mandal_id?, sabha_id? }
   */
  compare: (params) => api.get('/api/v1/reports/compare', { params, envelope: true }),

  /**
   * GET /api/v1/report-overview/members — the members behind ONE retention KPI,
   * for the drill-down popup.
   *   { bucket, total, members: [{ user_id, name, mobile_number }] }
   *
   * ⚠ `envelope: true` IS REQUIRED — the response has NO `data` block; `bucket`,
   * `total` and `members` sit at the top level. Pass the SAME scope params the
   * overview was fetched with. 403 below Yuva Seva rank.
   */
  overviewMembers: (params) =>
    api.get('/api/v1/report-overview/members', { params, envelope: true }),

  /** GET /api/v1/weekly-reports — `{ weekly_trends: [ { year, months: [...] } ] }`. */
  weeklyReports: (params) => api.get('/api/v1/weekly-reports', { params, envelope: true }),

  /**
   * GET /api/v1/weekly-sabha-report-list — Present counts per Sabha for the last
   * four completed weeks. Week columns are DATE-KEYED and discovered from the row.
   *
   * THREE RESPONSES FROM ONE ENDPOINT, chosen by what is sent:
   *   (nothing)                    one row per Sabha, with week COUNTS
   *   sabha_id                     data[0].users = that Sabha's follow-up persons
   *   sabha_id + followup_user_id  data[0].users = that person's members
   *
   * So `sabha_id` here is NOT a filter — it changes what the endpoint returns.
   */
  weeklySabhaReportList: (params) =>
    api.get('/api/v1/weekly-sabha-report-list', { params, envelope: true }),

  /**
   * GET /api/v1/sabha-report?sabha_detail_id={id}
   *
   * ONE SITTING, REGULAR OR SPECIAL, broken down by the Sabhas whose members
   * were invited: `{ special_sabha: {…}, data: [SpecialSabhaSabhaStat],
   * total: {…} }`. The totals row comes from the API, not summed here.
   *
   * ⚠ `/special-sabha-report` is the DEPRECATED ALIAS of this; do not call it.
   */
  sabhaReport: (sabhaDetailId) =>
    api.get('/api/v1/sabha-report', { params: { sabha_detail_id: sabhaDetailId } }),

  /**
   * GET /api/v1/sitting-report-heads?sabha_detail_id={id} — the LIVE per-head
   * report for one sitting: each follow-up head with their members' present /
   * absent across this sitting (live) plus the three before it.
   */
  sittingReportHeads: (sabhaDetailId) =>
    api.get('/api/v1/sitting-report-heads', { params: { sabha_detail_id: sabhaDetailId } }),

  /**
   * GET /api/v1/reports/special-sabha-rules — the recurring Special Sabha rules
   * the caller may report on (the report page's dropdown), scope-clamped. Gated
   * SPECIAL_SABHA:REPORT (additive with REPORTS:READ).
   */
  specialSabhaRules: () => api.get('/api/v1/reports/special-sabha-rules', { envelope: true }),

  /**
   * GET /api/v1/reports/special-sabha-history — the longitudinal report for one
   * recurring Special Sabha: a per-member present/absent grid across recent
   * weeks with absence-streak colours, a weekly present-count trend, summary
   * tiles, and at-risk follow-up lists grouped by home Sabha. Sabha-level callers
   * see only their own Sabha's members. Params: { schedule_id, weeks?, week_date? }.
   */
  specialSabhaHistory: (params) =>
    api.get('/api/v1/reports/special-sabha-history', { params, envelope: true }),

  /**
   * GET /api/v1/reports/yuva-seva-report — the caller's assigned members, how
   * stale each follow-up is, and its priority. NON-standard envelope: the four
   * totals sit beside `data` at the top level, so this asks for the whole body.
   */
  yuvaSevaReport: (params) =>
    api.get('/api/v1/reports/yuva-seva-report', { params, envelope: true }),

  /**
   * GET /api/v1/reports/yuva-seva-performance — one row per follow-up person with
   * `data.rows: [{ followup_user_id, followup_name, total_members, in_15_count,
   * in_30_count, untouched_count }]`. Sabha Head and above (REPORT_YUVA_SEVA:VIEW).
   */
  yuvaSevaPerf: (params) =>
    api.get('/api/v1/reports/yuva-seva-performance', { params, envelope: true }),

  /**
   * GET /api/v1/reports/yuva-seva-performance/members — the members behind one
   * clicked count: `{ followup_name, bucket, total, members: [...] }`.
   * `bucket` is in_15 | in_30 | untouched.
   */
  yuvaSevaPerfMembers: (params) =>
    api.get('/api/v1/reports/yuva-seva-performance/members', { params, envelope: true }),

  /**
   * GET /api/v1/reports/yuva-seva-summary — the two grouped roll-ups above the
   * detailed table: `group_summary` and `sabha_summary`.
   */
  yuvaSevaSummary: (params) =>
    api.get('/api/v1/reports/yuva-seva-summary', { params, envelope: true }),

  /**
   * GET /api/v1/reports-export-filter — the Download Report tab's pickers.
   * Gated on REPORTS:DOWNLOAD. Takes NO parameters, deliberately. Fetched once
   * for the whole tab — one response describes every export.
   */
  exportFilters: () => api.get('/api/v1/reports-export-filter'),

  /**
   * The Excel exports, all gated on REPORTS:DOWNLOAD.
   *
   * `responseType: 'blob'` so the bytes arrive intact; the interceptor passes a
   * non-envelope body through untouched. `path` comes from the matching block's
   * `export_url`. A longer timeout than the client-wide 60s — a Pradesh-wide
   * workbook is queried, built and streamed before a byte comes back.
   *
   * On React Native the resulting bytes are saved with react-native-blob-util
   * and handed to the share sheet — see hooks/useReports.js useReportDownload.
   */
  download: (path, params) =>
    api.get(path, { params, responseType: 'blob', timeout: 180_000 }),
};

/**
 * Logging one Yuva Seva — POST /api/v1/yuva-seva, `YuvaSevaCreate`:
 * `{ user_id, mode, date, time, duration, remark? }`, the first five required.
 * Create only — the screen reads its rows from the report.
 */
export const yuvaSevaService = {
  create: (payload) => api.post('/api/v1/yuva-seva', payload, { envelope: true }),

  /**
   * GET /api/v1/yuva-seva/member-history — a member's last `limit` meets, newest
   * first. Unwrapped to `data` (no envelope) — the whole payload is the history.
   */
  memberHistory: (userId, limit = 3) =>
    api.get('/api/v1/yuva-seva/member-history', { params: { user_id: userId, limit } }),
};

/** Generic list fetch for the registry-configured module endpoints. */
export const listService = {
  fetch: (endpoint, params) => api.get(endpoint, { params }),
};
