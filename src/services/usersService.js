import { api } from '../api/client';

/**
 * GET /api/v1/users/list — the member list, filtered, sorted and paged server-side.
 *
 * Params: page, limit, sabha_id, role_id, followup_by_id, search, alpha,
 * status, sort_by, sort_dir.
 *
 * Returns the paginated envelope — { items, page, limit, total_records,
 * total_pages, has_next_page, has_previous_page } — where each item is
 * { id, user_name, mobile_number, status, role_name, followup_by_id_name,
 * pradesh_id/name, mandal_id/name, sabha_id/name, failed_login_attempts,
 * is_locked }.
 *
 * `user_name` and `followup_by_id_name` already arrive as first + middle + last
 * combined; `status` is a boolean (true = active/Attending).
 *
 * Every filter has to be a server param now that the browser only holds one
 * 100-record block: filtering or sorting that block locally would silently
 * describe the block rather than the result set.
 */
export const usersService = {
  list: (params) => api.get('/api/v1/users/list', { params }),
  byId: (userId) => api.get(`/api/v1/users/${userId}`),

  /**
   * GET /api/v1/users/not-logged-in — members in the caller's own hierarchy
   * scope who have never signed in (is_first_login still true), Sabha-wise.
   *
   * Rank >= 20 only (Yuva Seva and above); the backend 403s below that. Returns
   * an array of { id, full_name, mobile_number, sabha_id, sabha_name }.
   */
  notLoggedIn: () => api.get('/api/v1/users/not-logged-in'),

  /**
   * GET /api/v1/dashboard-overview/member/{userId} — another member's "My
   * Dashboard" figures (Sabha age, attendance windows, last Sabha) plus their
   * follow-up person's name + mobile. Rank >= 20 and the target must be in the
   * caller's hierarchy scope; the backend 403s otherwise. Returns
   * { user_id, full_name, mobile_number, sabha_name, stats, spiritual_friend_name, spiritual_friend_mobile }.
   */
  memberStats: (userId) => api.get(`/api/v1/dashboard-overview/member/${userId}`),

  /**
   * GET /api/v1/users/by-role/{role_id} — every member holding exactly that role,
   * each row carrying its pradesh_id / mandal_id / sabha_id.
   *
   * Used by the hierarchy tree to name each level's Head and to tally a Sabha's
   * Nimit Sevaks and Yuvaks: one request per role for the whole tree, bucketed by
   * hierarchy id on this side. `/users/list?role_id=` cannot do this — its filter
   * is `role_id <= n` ("that rank and below"), not an exact role.
   *
   * ⚠ This endpoint has no hierarchy clamp of its own (the backend documents the
   * gap): it answers with holders of the role across every region, not just the
   * caller's. That is harmless for the tree, which only ever looks up ids it has
   * already been shown, but do not treat the raw list as scoped.
   */
  byRole: (roleId) => api.get(`/api/v1/users/by-role/${roleId}`),

  /**
   * GET /api/v1/users/today-birthdays — whose birthday is today.
   *
   * TWO LISTS IN ONE ANSWER, and the difference between them is who is expected
   * to act:
   *
   *   users     everyone in the caller's SCOPE with a birthday today, already
   *             sorted by tier: personal follow-ups first, then same Sabha,
   *             then same Mandal, then wider. Scope narrows for Yuvak (own
   *             Sabha only) and widens for Pradesh / SuperAdmin (own Pradesh
   *             or global) — for everyone else it is the caller's own Mandal.
   *   followup  the caller's PERSONAL follow-ups. A strict subset of `users`,
   *             kept for compatibility — the Birthdays page now reads
   *             `row.tier === 'personal'` directly.
   *
   * Each row is `{ user_id, user_name, mobile_number, sabha_name, tier,
   * contact }`:
   *
   *   tier      'personal' | 'sabha' | 'mandal' | 'wider' — how this row was
   *             reached from the caller. Decides ordering (server-side) and
   *             the star + "Your follow-up" label on personal rows.
   *   contact   whether Call + WhatsApp are permitted for this caller on this
   *             row. TRUE on personal always; on same-Sabha rows for Sabha
   *             rank and above; on same-Mandal rows for Mandal rank and above;
   *             and TRUE on `is_leader` rows regardless of rank. Yuva Seva
   *             sees contact=true only on personal follow-ups (plus any
   *             leader); Yuvak sees contact=false on the Sabha but TRUE on
   *             their own follow-up sevak and Sabha / Mandal leaders. The
   *             Follow-up Birthdays tile on the Admin dashboard reads its
   *             count from the same flag, so the tile and the buttons agree.
   *   is_leader TRUE when this row is one of the caller's own bottom-up chain
   *             (follow-up sevak, Sabha Head / DB Manager, Mandal Head / DB
   *             Manager). The Birthdays page draws a crown next to the name.
   *             Union-scoped: a Yuvak's Mandal Head appears on the list even
   *             though the Sabha clamp would otherwise hide them.
   *
   * The one member-list endpoint with no permission gate at all: any
   * authenticated, active user may call it, Yuvaks included. That is what lets
   * the Yuvak dashboard show it — `/users/list` stops at Yuva Seva.
   *
   * No `dob` comes back, deliberately — the endpoint has already answered whose
   * birthday it is, so the date itself would be a personal detail the caller
   * never needed. There is therefore no age to show, and nothing to compute one
   * from. `mobile_number` and `sabha_name` are both nullable.
   *
   * An empty list is a normal day, not an error.
   */
  todayBirthdays: () => api.get('/api/v1/users/today-birthdays'),

  /**
   * POST /api/v1/users/send-birthday-wish — queues a birthday wish from the
   * signed-in member to another. Body `{ user_id, message }`, both required.
   *
   * Answers 201 with the queued record: `{ id, user_id, send_user_id, message,
   * status, wish_date }`. `send_user_id` is the SENDER and is taken from the
   * token — it is not sent, and must not be. `status` comes back `pending`: the
   * wish is queued rather than delivered, so a success here means "accepted for
   * sending", which is what the toast says.
   *
   * THE MESSAGE IS THE SENDER'S OWN, not a template the backend fills in — which
   * is why the popup that calls this makes it a required field rather than
   * hiding a default. It is NOT the WhatsApp route either: that one never
   * reaches the API at all, being composed in the browser and handed to WhatsApp
   * so it goes out from the sender's own number (see utils/birthdayWish.js).
   */
  sendBirthdayWish: ({ userId, message }) =>
    api.post('/api/v1/users/send-birthday-wish', { user_id: userId, message }),

  /**
   * GET /api/v1/users/my-birthday-wishes — the wishes sent TO the signed-in
   * member. The other side of `send-birthday-wish`.
   *
   * Takes no parameters: whose wishes is not a choice, it is whoever the token
   * belongs to. Each record is the one the POST returns — `{ id, user_id,
   * send_user_id, message, status, wish_date }` — so the SENDER is
   * `send_user_id`, and `user_id` is the recipient, which is to say the caller.
   * Whether a sender's NAME rides along is not something this app can require,
   * so the screen reads every plausible spelling and falls back to a person
   * rather than to an id (see BirthdaysPage).
   *
   * An empty list is the normal case — most days nobody has a birthday.
   */
  myBirthdayWishes: () => api.get('/api/v1/users/my-birthday-wishes'),

  /**
   * POST /api/v1/users/ — create a member.
   *
   * The trailing slash is required: the spec declares `/api/v1/users/` and not
   * the bare form. FastAPI redirects the bare path with a 307, which axios does
   * follow, but a redirected POST carrying a body through the dev proxy is not
   * something to depend on.
   *
   * Body is `UserCreate`, which declares no `educations` / `jobs` — those are
   * split off by the caller and written to their own endpoints below. See
   * `useCreateUser`.
   *
   * Asks for the envelope so the backend's own success message can be shown
   * verbatim, and so `data.id` is reachable for the follow-up writes.
   */
  create: (payload) => api.post('/api/v1/users/', payload, { envelope: true }),

  /**
   * POST /api/v1/users/{parentId}/children — register a child who has NO mobile
   * number of their own, under a parent (guardian). The child becomes a full
   * member (own attendance / sabha / dashboard) but cannot sign in; the parent
   * operates the account and receives its messages. No mobile is sent — the
   * backend generates a unique placeholder and links the child to the parent.
   * Body is `ChildCreate` (first/middle/last name, gender, dob, category_id,
   * relation_id, optional sabha/role). Envelope for the backend's own message.
   */
  createChild: (parentId, payload) =>
    api.post(`/api/v1/users/${parentId}/children`, payload, { envelope: true }),

  // Promote a parent-managed child to a full, independent member: a real unique
  // login number, managed_by cleared, login enabled. Same USERS:CREATE right.
  graduateChild: (userId, mobile) =>
    api.post(`/api/v1/users/${userId}/graduate`, { mobile_number: mobile }, { envelope: true }),

  // ── Sub-resources of one member ────────────────────────────────────────
  // Each list is its own request, fetched only when the tab that shows it is
  // opened. Each row is written individually rather than as part of the member
  // payload, so adding one education does not resubmit the whole record.
  educations: (userId) => api.get(`/api/v1/users/${userId}/educations`),
  createEducation: (userId, payload) =>
    api.post(`/api/v1/users/${userId}/educations`, payload, { envelope: true }),
  updateEducation: (userId, educationId, payload) =>
    api.patch(`/api/v1/users/${userId}/educations/${educationId}`, payload, { envelope: true }),
  deleteEducation: (userId, educationId) =>
    api.delete(`/api/v1/users/${userId}/educations/${educationId}`, { envelope: true }),

  jobs: (userId) => api.get(`/api/v1/users/${userId}/jobs`),
  createJob: (userId, payload) =>
    api.post(`/api/v1/users/${userId}/jobs`, payload, { envelope: true }),
  updateJob: (userId, jobId, payload) =>
    api.patch(`/api/v1/users/${userId}/jobs/${jobId}`, payload, { envelope: true }),
  deleteJob: (userId, jobId) =>
    api.delete(`/api/v1/users/${userId}/jobs/${jobId}`, { envelope: true }),

  // ── Family ────────────────────────────────────────────────────────────────
  // Verified against the running API on 2026-08-02. The earlier guesses here
  // were wrong in both directions: the POST body was invented
  // (`member_user_id`, which the API does not accept) and the DELETE identified
  // its target with a query param it ignores.
  //
  // The shape that is actually right: **the path names the person joining or
  // leaving**, not the member whose screen you are on. Both endpoints answer
  // with the whole family, `{ family_id, members: [FamilyMember] }`, where a
  // FamilyMember is `{ id, user_id, user_name, relation_id, relation_name }`.

  /** The user's family, or `{ family_id: 0, members: [] }` when they have none. */
  family: (userId) => api.get(`/api/v1/users/${userId}/family`),

  /**
   * GET /api/v1/families/{family_id} — the same payload, reached by family
   * rather than by member. The user form does not need it (it already holds the
   * member whose family is shown) but it is the entry point for any screen that
   * has only a family id.
   */
  familyById: (familyId) => api.get(`/api/v1/families/${familyId}`),

  /**
   * POST /api/v1/users/{user_id}/family-member — put THIS user in a family.
   *
   * With `familyId` they join that family under `relationId`. Without it a new
   * family is founded with them as its head, and the API requires `relationId`
   * to be the "Family Head" relation. That is why linking the first relative to
   * a member who has no family is two calls — see useFamilyMutations.
   */
  joinFamily: (userId, { relationId, familyId = null }) =>
    api.post(
      `/api/v1/users/${userId}/family-member`,
      { relation_id: Number(relationId), ...(familyId ? { family_id: Number(familyId) } : {}) },
      { envelope: true }
    ),

  /**
   * DELETE /api/v1/users/{user_id}/family-member — take THIS user out of their
   * family. No body, no params: the path is the whole request.
   *
   * The backend refuses to remove the head while other members remain, so the
   * roster does not offer it on that row.
   */
  leaveFamily: (userId) =>
    api.delete(`/api/v1/users/${userId}/family-member`, { envelope: true }),

  /**
   * PATCH /api/v1/users/{id} — the edit form's save. Gated by USERS:UPDATE.
   * Returns the envelope so the backend's own wording reaches the toast.
   *
   * Body is `UserUpdate`, which is NOT the same shape as `UserCreate`. It omits
   * seven fields the form still sends, and Pydantic ignores them silently:
   *
   *   mobile_number, reference_by_id, pradesh_id, mandal_id, sabha_id,
   *   role_id, followup_by_id
   *
   * That matches how the app works rather than breaking it — mobile and Sampark
   * ID are readOnlyOnEdit, placement moves via Quick Transfer, role via Assign
   * Role, follow-up via Change Follow-up, each through its own endpoint. It is
   * written down because it is invisible: making one of those seven editable on
   * this form would appear to work and change nothing.
   */
  update: (userId, payload) => api.patch(`/api/v1/users/${userId}`, payload, { envelope: true }),

  /**
   * GET /api/v1/role-permissions/user/{user_id}/assignable-roles — the roles this
   * member may be moved to, already narrowed by the backend to what the caller is
   * allowed to grant. Rendered exactly as returned: no ordering, ranking or
   * filtering is applied on this side.
   */
  assignableRoles: (userId) =>
    api.get(`/api/v1/role-permissions/user/${userId}/assignable-roles`),

  /**
   * PATCH /api/v1/users/{user_id}/role
   * Body: { role_id }
   *
   * ⚠ The body key is inferred — the spec says only "pass the selected role as
   * per the API specification", and the docs answer 403 to anything but a
   * browser. `role_id` follows the naming used everywhere else in this API. One
   * line to correct if it differs.
   */
  updateRole: (userId, roleId) =>
    api.patch(`/api/v1/users/${userId}/role`, { role_id: roleId }, { envelope: true }),

  /**
   * PATCH /api/v1/users/update-pending-followup/{user_id}
   * Body: { followup_by_id }
   *
   * Reassigns who follows this member up, from the Follow-up column on the list.
   */
  updateFollowup: (userId, followupById) =>
    api.patch(
      `/api/v1/users/update-pending-followup/${userId}`,
      { followup_by_id: followupById },
      { envelope: true }
    ),

  /**
   * PATCH /api/v1/users/status/bulk — the only status-write endpoint the API
   * exposes; a single-member toggle is just a batch of one.
   * Body: { user_ids: int[], status: bool }. Gated by USERS:BULK_STATUS_UPDATE.
   *
   * Returns the envelope: `data` is null and `detail` carries the message the
   * backend wants shown ("Status updated successfully for: …").
   */
  updateStatusBulk: (userIds, status) =>
    api.patch(
      '/api/v1/users/status/bulk',
      { user_ids: userIds, status },
      { envelope: true }
    ),
};
