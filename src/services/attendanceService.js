import { api } from '../api/client';

// Attendance endpoints.
//
// The feature spec writes these paths bare (`/sabhadetails`, `/attendance/{id}`).
// They are mounted under the module prefix here because the one endpoint both
// sources name — the Sabha list — resolves as `/api/v1/attendance/sabhadetails`.
// That is the app's established convention and the only anchor available, so the
// rest follow it.
//
// The RN `api` client (src/api/client.js) unwraps the standard envelope to
// `body.data` by default and returns the whole StandardResponse when a call
// passes `{ envelope: true }` — used on writes so the backend's own `detail`
// message can be shown in a toast verbatim.
const BASE = '/api/v1/attendance';

export const attendanceService = {
  /**
   * GET /api/v1/attendance/sabhadetails
   * `type` is 'regular' | 'special'; omitting it lists both, which is what the
   * scanner's Sabha dropdown wants.
   */
  sabhaDetails: params => api.get(`${BASE}/sabhadetails`, { params }),

  /** GET /api/v1/attendance/sabhaschedule — the Schedule tab. */
  sabhaSchedules: params => api.get(`${BASE}/sabhaschedule`, { params }),

  /**
   * GET /api/v1/attendance/special-sabha-schedule — the recurring Special Sabha
   * rules (Category+tag audiences). Gated by SPECIAL_SABHA:MANAGE; the caller
   * sees their own Mandal's rules (SuperAdmin sees all).
   */
  specialSchedules: params => api.get(`${BASE}/special-sabha-schedule`, { params }),

  /**
   * Creates — both POST to the same paths their lists are read from, which is the
   * usual REST arrangement.
   */
  createSabhaDetail: payload => api.post(`${BASE}/sabhadetails`, payload, { envelope: true }),
  createSabhaSchedule: payload => api.post(`${BASE}/sabhaschedule`, payload, { envelope: true }),
  createSpecialSchedule: payload =>
    api.post(`${BASE}/special-sabha-schedule`, payload, { envelope: true }),

  /**
   * Updates. Both take a narrower body than their create:
   *   `SabhaDetailsUpdate`  — no date and no type; when a Sabha happens is not
   *                           editable after the fact, only who speaks and
   *                           whether it is open for attendance.
   *   `SabhaScheduleUpdate` — the whole recurrence, since all four fields are
   *                           what the recurrence is.
   */
  updateSabhaDetail: (id, payload) =>
    api.patch(`${BASE}/sabhadetails/${id}`, payload, { envelope: true }),
  updateSabhaSchedule: (id, payload) =>
    api.patch(`${BASE}/sabhaschedule/${id}`, payload, { envelope: true }),
  updateSpecialSchedule: (id, payload) =>
    api.patch(`${BASE}/special-sabha-schedule/${id}`, payload, { envelope: true }),

  /**
   * POST /api/v1/attendance/sabhadetails/{id}/cancel — calls off one sitting.
   *
   * A POST rather than a DELETE, and that is the API's own choice: the row
   * survives, cancelled, so the record of a Sabha that was meant to happen is
   * not lost. Nothing is sent in the body.
   */
  cancelSabhaDetail: id => api.post(`${BASE}/sabhadetails/${id}/cancel`, {}, { envelope: true }),

  /**
   * GET /api/v1/attendance/attendance/{sabha_detail_id} — the current attendance
   * state for one Sabha: totals plus each member's marked status.
   *
   * `reportScope` clamps a Special sitting's report to the caller's own Sabha
   * (Sabha-level roles); the mark screen omits it and gets the whole roster.
   */
  summary: (sabhaDetailId, { reportScope = false } = {}) =>
    api.get(
      `${BASE}/attendance/${sabhaDetailId}`,
      reportScope ? { params: { report_scope: true } } : undefined,
    ),

  /**
   * GET /api/v1/attendance/attendance/{id}/prior-week — last week's Present /
   * Absent for this sitting's Sabha, plus Present at the same weekday+time last
   * week. Feeds the Mark page's two comparison KPIs.
   */
  priorWeek: sabhaDetailId => api.get(`${BASE}/attendance/${sabhaDetailId}/prior-week`),

  /**
   * GET /api/v1/attendance/attendance/{id}/broadcast — the live-assembly
   * broadcast numbers for one sitting.
   *   asOf  — ISO datetime in IST for a point-in-time SLOT snapshot (Present
   *           counted where the mark time <= asOf), or null.
   *   final — true for the wrap-up: live counts + frequency + absence buckets.
   * Sent fresh on every button tap so the numbers are current, never cached.
   */
  broadcast: (sabhaDetailId, { asOf = null, final = false } = {}) =>
    api.get(`${BASE}/attendance/${sabhaDetailId}/broadcast`, {
      params: { ...(asOf ? { as_of: asOf } : {}), ...(final ? { final: true } : {}) },
    }),

  /**
   * GET /api/v1/attendance/attendance/{id}/ns-absent — the Sabha's Nimit Sevaks
   * NOT marked Present as of `asOf` (point-in-time), for the "NS Absent"
   * broadcast. Omit `asOf` for the live/now list.
   */
  nsAbsent: (sabhaDetailId, { asOf = null } = {}) =>
    api.get(`${BASE}/attendance/${sabhaDetailId}/ns-absent`, {
      params: { ...(asOf ? { as_of: asOf } : {}) },
    }),

  /**
   * GET /api/v1/attendance/attendance/{id}/focus-absent — the Sabha's Focus 36
   * members NOT marked Present at this sitting right now, grouped by their
   * follow-up person, for the "Focus 36 absent" broadcast (live only).
   */
  focusAbsent: sabhaDetailId => api.get(`${BASE}/attendance/${sabhaDetailId}/focus-absent`),

  /**
   * GET /api/v1/attendance/track-history/sittings?for_date=YYYY-MM-DD — the
   * sittings held that day the caller may see, each with its mark-action count.
   */
  trackHistorySittings: forDate =>
    api.get(`${BASE}/track-history/sittings`, { params: { for_date: forDate } }),

  /**
   * GET /api/v1/attendance/track-history/{id} — one sitting's whole mark trail
   * replayed from the activity log: summary, slot counts, present-count curve,
   * correction chains and every mark (newest first) with names.
   */
  trackHistory: sabhaDetailId => api.get(`${BASE}/track-history/${sabhaDetailId}`),

  /**
   * POST /api/v1/attendance/attendance/mark-bulk
   *
   * Body is `AttendanceBulkMark`: `{ user_ids: int[], sabha_detail_id: int,
   * status: int }`. Every value is coerced here rather than trusted from the
   * caller:
   *   - ids arrive as strings from a dropdown and from row keys, and the schema
   *     declares integers;
   *   - `status` is an INTEGER, not a boolean — 1 present, 0 absent.
   *
   * An id that cannot be read as a number is dropped rather than sent as null.
   *
   * A SCAN passes `qrToken` (the raw string the camera read) instead of
   * `userIds`. The backend VERIFIES its signature and resolves the one member —
   * the app cannot verify it (the signing secret is server-only), so it sends
   * the code as-is rather than extracting an id to trust. `qr_token` wins
   * server-side; no ids are sent with it.
   */
  markBulk: ({ sabhaDetailId, userIds, qrToken, status }) => {
    const body = { sabha_detail_id: Number(sabhaDetailId), status: status ? 1 : 0 };
    if (qrToken != null && String(qrToken).trim()) {
      body.qr_token = String(qrToken);
    } else {
      const ids = (Array.isArray(userIds) ? userIds : [userIds])
        .map(id => Number(id))
        .filter(id => Number.isFinite(id));
      if (!ids.length) throw new Error('No member to mark — the row carried no user id.');
      body.user_ids = ids;
    }
    return api.post(
      `${BASE}/attendance/mark-bulk`,
      body,
      // SHORTER THAN THE CLIENT-WIDE BACKSTOP (60s), because this one is a tap.
      // The row it belongs to is disabled while it runs, so the timeout is also
      // how long a member can sit unavailable after being tapped. 15s is long
      // enough to ride out a slow mobile round-trip and short enough that a
      // dropped one becomes a retry — and then a visible error — rather than a
      // row somebody is waiting on.
      { envelope: true, timeout: 15_000 },
    );
  },
};
