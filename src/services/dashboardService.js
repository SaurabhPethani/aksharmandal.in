import { api } from '../api/client';

// The dashboard's own endpoint. SEPARATE FROM reportService ON PURPOSE.
//
// /dashboard is no longer served by /report-overview. That endpoint belongs to
// the Reports screen and carries figures this page does not draw; the backend
// forked it into /dashboard-overview precisely so the two can change
// independently. Reading Reports' endpoint here is what made every dashboard
// tweak a change to a Reports API.
//
// Field names verified against the OpenAPI document on 2026-08-13.

export const dashboardService = {
  /**
   * GET /api/v1/dashboard-overview -> `{ status_code, detail, data, filters }`
   * where `data` is the TWO dashboards the page renders:
   *
   *   data.overall   the hierarchy dashboard, clamped to the caller's scope
   *     total_users              { number, percentage }   ACTIVE members
   *     monthly_once             { number, percentage }   present in >=1 of 4 weeks
   *     untouched_yuvak          int    no follow-up logged in 30 days
   *     attendance_last_4_week   [ { week_date, present_count, present_percentage,
   *                                  absent_count, absent_percentage } ]
   *     attendance_last_12_week  same shape, twelve weeks
   *
   *   data.self      the signed-in member alone
   *     sabha_age            { year, month, days } | null
   *     total_sabha_present  { total_sabha, attended, not_attended }
   *     present_in_last_4w   { total, attended, not_attended }
   *     last_sabha           { attended: bool, date: 'YYYY-MM-DD' | null }
   *                            date is the day that last Sabha was held (the real
   *                            sitting, not the week's Monday); null when none
   *
   * NO PERMISSION GATE — authentication only. Every member lands on the
   * dashboard, and REPORTS:READ is granted from Sabha DB Manager upward, so a
   * gated call would leave Nimit Sevak and Yuvak with an empty screen. The
   * counts are already clamped to the caller's own hierarchy server-side.
   *
   * ⚠ `sabha_age` is `null` when the member has no `date_of_joining` on record
   * — which is most of the member base until somebody edits them. Render the
   * tile as absent, never as a zero tenure: "joined today" and "we don't know"
   * are not the same statement.
   *
   * ⚠ The optional `year` / `pradesh_id` / `mandal_id` / `sabha_id` params
   * narrow `data.overall` ONLY. `data.self` is about the person holding the
   * token and reads the same however the request is filtered.
   *
   * Asks for the whole envelope, like the Reports reads, so the sibling
   * `filters` block survives — see hooks/useDashboard.js.
   */
  overview: (params) => api.get('/api/v1/dashboard-overview', { params, envelope: true }),

  /**
   * GET /api/v1/dashboard/present-absent -> `data` =
   *   { active_total,
   *     current_week: { week_date, is_live, roster, present, absent, pending,
   *                     present_percentage, absent_percentage },
   *     last_week:    { ...same, is_live:false } }
   *
   * A LEADER-FACING roster split for the current (live) week and the last
   * completed week, on the roster-view definition (roster = active members whose
   * Sabha met that week; present = present anywhere; absent = roster - present;
   * pending = active - roster, i.e. Sabha not met yet). Scope-clamped to the
   * caller's hierarchy exactly like `data.overall`; self-only roles (Yuvak) get
   * 403, which is why this only feeds the User Dashboard tab. Counts ONLY — no
   * member rows — so it stays cheap for a headline card.
   */
  presentAbsent: (params) => api.get('/api/v1/dashboard/present-absent', { params }),

  /**
   * GET /api/v1/dashboard/present-absent/members -> `data` =
   *   { week_date, is_live, bucket, total, limit, offset, members: [ ... ] }
   *
   * The drill-down roster for one `week` (`current` | `last`) and one `bucket`
   * (`present` | `absent` | `pending`), paginated (`limit` <= 200, `offset`).
   * `total` is the full bucket size and equals the matching count above. Each
   * row carries the member's own contact (for the call sheet) plus, on the
   * absent/pending buckets, their follow-up person's contact.
   */
  presentAbsentMembers: (params) =>
    api.get('/api/v1/dashboard/present-absent/members', { params }),
};
