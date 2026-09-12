import { api } from '../api/client';

// Attendance endpoints.
//
// The feature spec writes these paths bare (`/sabhadetails`, `/attendance/{id}`).
// They are mounted under the module prefix here because moduleRegistry.js already
// resolves the one endpoint both sources name — the Sabha list — as
// `/api/v1/attendance/sabhadetails`. That is the app's established convention and
// the only anchor available, so the rest follow it.
//
// ⚠ `sabhaschedule` and the summary path are inferred from that same pattern and
// are not confirmed by anything in this repo. If a call 404s, the prefix here is
// the first thing to check — every path is in this one file.
const BASE = '/api/v1/attendance';

export const attendanceService = {
  /**
   * GET /api/v1/attendance/sabhadetails
   * `type` is 'regular' | 'special'; omitting it lists both, which is what the
   * scanner's Sabha dropdown wants.
   */
  sabhaDetails: (params) => api.get(`${BASE}/sabhadetails`, { params }),

  /** GET /api/v1/attendance/sabhaschedule — the Schedule tab. */
  sabhaSchedules: (params) => api.get(`${BASE}/sabhaschedule`, { params }),

  /**
   * Creates — both POST to the same paths their lists are read from, which is the
   * usual REST arrangement but is not confirmed for this API. See the warning in
   * utils/attendanceFormSchema.js.
   */
  createSabhaDetail: (payload) => api.post(`${BASE}/sabhadetails`, payload, { envelope: true }),
  createSabhaSchedule: (payload) => api.post(`${BASE}/sabhaschedule`, payload, { envelope: true }),

  /**
   * Updates. Both take a narrower body than their create:
   *   `SabhaDetailsUpdate`  — no date and no type; when a Sabha happens is not
   *                           editable after the fact, only who speaks and
   *                           whether it is open for attendance.
   *   `SabhaScheduleUpdate` — the whole recurrence, since all four fields are
   *                           what the recurrence is.
   */
  updateSabhaDetail: (id, payload) => api.patch(`${BASE}/sabhadetails/${id}`, payload, { envelope: true }),
  updateSabhaSchedule: (id, payload) => api.patch(`${BASE}/sabhaschedule/${id}`, payload, { envelope: true }),

  /**
   * POST /api/v1/attendance/sabhadetails/{id}/cancel — calls off one sitting.
   *
   * A POST rather than a DELETE, and that is the API's own choice: the row
   * survives, cancelled, so the record of a Sabha that was meant to happen is
   * not lost. Nothing is sent in the body.
   */
  cancelSabhaDetail: (id) => api.post(`${BASE}/sabhadetails/${id}/cancel`, {}, { envelope: true }),

  /**
   * GET /api/v1/attendance/attendance/{sabha_detail_id} — the current attendance
   * state for one Sabha: totals plus each member's marked status.
   *
   * The doubled `attendance/attendance` segment is what the spec declares, and
   * is the same shape as the mark-bulk path below. This was sent to
   * `/api/v1/attendance/{id}`, the "tidied" version of it, which is a different
   * route and answered nothing useful.
   */
  summary: (sabhaDetailId) => api.get(`${BASE}/attendance/${sabhaDetailId}`),

  /**
   * GET /api/v1/attendance/attendance/{id}/prior-week — last week's Present /
   * Absent for this sitting's Sabha, plus Present at the same weekday+time last
   * week. Feeds the Mark page's two comparison KPIs. Same doubled
   * `attendance/attendance` prefix as `summary`.
   */
  priorWeek: (sabhaDetailId) => api.get(`${BASE}/attendance/${sabhaDetailId}/prior-week`),

  /**
   * POST /api/v1/attendance/attendance/mark-bulk
   *
   * Body is `AttendanceBulkMark`, verified against the spec on 2026-08-03:
   * `{ user_ids: int[], sabha_detail_id: int, status: int }` — all three
   * required. Every value is coerced here rather than trusted from the caller:
   *
   *   - ids arrive as strings from a `<select>` and from row keys, and the
   *     schema declares integers;
   *   - `status` is an INTEGER, not a boolean — 1 present, 0 absent. `true`
   *     went out for a while and is not what the schema asks for.
   *
   * An id that cannot be read as a number is dropped rather than sent as null.
   * The scanner's own bug was exactly that: mandal rows are keyed `user_id`, so
   * `[member.id]` was `[undefined]` and the body carried `user_ids: [null]`.
   *
   * A SCAN passes `qrToken` (the raw string the camera read) instead of
   * `userIds`. The backend VERIFIES its signature and resolves the one member —
   * the browser cannot verify it (the signing secret is server-only), so it
   * sends the code as-is rather than extracting an id to trust. `qr_token`
   * wins server-side; no ids are sent with it.
   *
   * Asks for the envelope so the backend's own message can be shown verbatim.
   */
  markBulk: ({ sabhaDetailId, userIds, qrToken, status }) => {
    const body = { sabha_detail_id: Number(sabhaDetailId), status: status ? 1 : 0 };
    if (qrToken != null && String(qrToken).trim()) {
      body.qr_token = String(qrToken);
    } else {
      const ids = (Array.isArray(userIds) ? userIds : [userIds])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
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
      { envelope: true, timeout: 15_000 }
    );
  },
};
