import { useCallback, useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PermissionContext } from '../contexts/PermissionContext';
import { usersService } from '../services/usersService';
import { authService } from '../services/authService';
import { transferService } from '../services/transferService';
import { patchRowInList } from '../services/listCache';
import { readRows } from '../services/paginationService';
import { readBirthdayWishes } from '../utils/birthdayWish';
import { useAuth, useDebounced } from './core';
import { useServerPagination } from './usePagination';
import { LOOKUP_CACHE } from './cache';

// Everything that reads or writes a member: the list, one record, the row
// actions, and the two sub-resource collections.

/**
 * Member list — server-filtered, server-paged in 100-record
 * blocks. Every filter is a query param: with only one block in the browser,
 * anything applied locally would describe the block instead of the result set.
 *
 * Typing is debounced here rather than at the call site, so a search costs one
 * request when the user stops typing rather than one per keystroke.
 */
export function useMembers(
  { sabhaId, search, alpha, status, followupById, initialPage, onPageChange } = {},
  enabled
) {
  const debouncedSearch = useDebounced(search, 350);
  return useServerPagination({
    queryKey: ['members'],
    fetchBlock: (params) => usersService.list(params),
    initialPage,
    onPageChange,
    params: {
      sabha_id: sabhaId ?? undefined,
      search: debouncedSearch || undefined,
      alpha: alpha || undefined,
      // Omitted entirely when nothing is chosen, so the unfiltered call carries
      // no followup_by_id at all and the backend applies the caller's own scope.
      followup_by_id: followupById || undefined,
      status: status === '' || status == null ? undefined : status === 'true' || status === true,
    },
    enabled,
  });
}

/**
 * EVERY member of one Sabha, unpaged — for the scanner, which has to match a
 * scanned code against any member, not just the ten on a page.
 *
 * Deliberately NOT `useMembers`: that hook pages in 100-record blocks and
 * silently ignores any `limit` passed to it, so the scanner used to hold only
 * the first 100 members of a Sabha and answer "no member matches" for everyone
 * after that — indistinguishable from an invalid code.
 *
 * `truncated` is the guard against the same failure returning by another route:
 * if the backend caps `limit` below the Sabha's size, the caller is told so and
 * can say it on screen, rather than quietly scanning against a partial list.
 */
/**
 * How many 100-record pages this will walk before giving up. A Sabha of 2,000 is
 * already far beyond anything in the data; the cap only stops a bad
 * `total_records` from looping forever.
 */
const MAX_MEMBER_PAGES = 20;

export function useSabhaMembers(sabhaId, enabled) {
  const query = useQuery({
    // Its own key space: this is not a page of ['members'], and it must not be
    // patched by useUserListCache or evicted with the paged list.
    queryKey: ['sabha-members', sabhaId ?? null],
    /**
     * Pages through the whole Sabha rather than asking for it in one call.
     *
     * No `limit` is sent: the endpoint serves 100 and refuses to serve more, so
     * `limit: 5000` was a request the backend quietly declined — and the caller
     * was left with the first 100 members believing it had them all. Walking
     * `page=1,2,3…` until `total_records` is reached gets the rest, honestly.
     */
    queryFn: async () => {
      const first = await usersService.list({ sabha_id: sabhaId, page: 1 });
      const total = Number.isFinite(first?.total_records) ? first.total_records : null;
      const items = readRows(first);
      if (total == null || items.length === 0 || items.length >= total) return { ...first, items };

      const pages = Math.min(Math.ceil(total / items.length), MAX_MEMBER_PAGES);
      for (let page = 2; page <= pages; page += 1) {
        const next = await usersService.list({ sabha_id: sabhaId, page });
        const rows = readRows(next);
        if (!rows.length) break;
        items.push(...rows);
      }
      return { ...first, items };
    },
    enabled: enabled && Boolean(sabhaId),
  });

  const rows = readRows(query.data);
  const total = Number.isFinite(query.data?.total_records) ? query.data.total_records : null;

  // Still reported, and still shown on screen: a Sabha larger than the page cap
  // above would be partially loaded, and that has to be visible rather than
  // silently scanned against.
  return { ...query, rows, total, truncated: total != null && rows.length < total };
}

/**
 * Today's birthdays — the Yuvak dashboard's Celebrations card, the Admin
 * dashboard's Follow-up Birthdays tile, and the Birthdays page.
 *
 * TWO LISTS COME BACK (see usersService.todayBirthdays):
 *
 *   users     everyone in the caller's scope celebrating today, ALREADY
 *             SORTED by tier server-side (personal → sabha → mandal → wider).
 *             Each row carries `tier` and `contact`, which drive labelling and
 *             the Call/WhatsApp buttons on the Birthdays page.
 *   followup  the caller's PERSONAL follow-ups — a SUBSET of `users`, kept for
 *             compatibility. New code should read `row.tier === 'personal'`
 *             instead, since the "personal" cohort is the meaningful one and
 *             `followup` no longer maps to the dashboard tile's semantics
 *             (that tile now counts rows with `contact === true`).
 *
 * ⚠ THE OLD SHAPE IS STILL ACCEPTED. This endpoint used to answer a bare array,
 * and that is what `rows` and the fallback below are for: an array response is
 * read as `users` with no follow-up list, so a backend yet to ship the split
 * shows the same page with one empty section rather than an empty screen.
 *
 * Cached like a lookup, because it is one: the answer changes once a day, at
 * midnight IST, and re-asking on every remount would spend a request to be told
 * the same thing. All three lists are always arrays, so no caller has to decide
 * what an absent one means.
 */
export function useTodayBirthdays(enabled = true) {
  const query = useQuery({
    queryKey: ['today-birthdays'],
    queryFn: usersService.todayBirthdays,
    enabled,
    ...LOOKUP_CACHE,
  });

  const body = query.data;
  const users = Array.isArray(body) ? body : readRows(body?.users);
  const followup = readRows(body?.followup);

  // `rows` is the old name for `users` and is what the Celebrations card reads.
  return { ...query, rows: users, users, followup };
}

/**
 * The wishes sent TO the signed-in member.
 *
 * Fetched once after sign-in and read twice: the popup that announces them, and
 * the Birthdays page's second tab. One cache entry serves both, so opening the
 * page from the popup costs no request.
 *
 * `LOOKUP_CACHE` for the same reason the birthday list uses it — this changes at
 * most a handful of times on one day of the year, and a member who moves between
 * pages should not re-ask on every mount.
 */
export function useMyBirthdayWishes(enabled = true) {
  const query = useQuery({
    queryKey: ['my-birthday-wishes'],
    queryFn: usersService.myBirthdayWishes,
    enabled,
    ...LOOKUP_CACHE,
  });
  return { ...query, rows: readBirthdayWishes(query.data) };
}

/**
 * Sends one birthday wish — `{ userId, message }`, both required by the API.
 *
 * ONE KEY, NOT THE WHOLE CACHE. `refreshOnSuccess: false` still opts out of the
 * app-wide refresh in utils/queryClient — a wish changes nothing on any other
 * screen, and re-reading every list on the page to learn that would be a lot of
 * requests for one button.
 *
 * The birthday list itself IS different afterwards, though, which it did not
 * used to be: each row now carries `already_wished`, so the list is what
 * remembers the wish once the page is reloaded. Invalidated rather than patched
 * because the same member can appear twice — once in `users` and again in
 * `followup` — and a re-read keeps the two halves agreeing with no rule here
 * about which lists hold the same person.
 */
export function useSendBirthdayWish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, message }) => usersService.sendBirthdayWish({ userId, message }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['today-birthdays'] }),
    meta: { refreshOnSuccess: false },
  });
}

/**
 * One member's full record — the profile screen, the details page and the edit
 * form's prefill all read from here.
 *
 * full-context carries only user_name / role_name, so the detail endpoint is what
 * supplies mobile, status and the pradesh/mandal/sabha placement.
 *
 * The id is stringified into the key deliberately: it arrives as a string from
 * useParams and as a number from full-context, and two spellings of the same key
 * mean an invalidation can miss the entry that is actually mounted.
 *
 * YOUR OWN RECORD IS READ FROM A DIFFERENT ENDPOINT.
 *
 *   someone else   GET /users/{id}   USERS:READ + a scope match
 *   yourself       GET /users/me     no grant at all
 *
 * Both answer `UserDetailResponse`, so nothing downstream can tell which was
 * used. The split is about the gate, not the shape: `/users/{id}` checks
 * USERS:READ before it looks at WHO is being asked for, so a Yuvak — who holds
 * no such grant — got a 403 opening their own /profile, and the same 403 on the
 * Edit form behind it. Nobody needs permission to look at themselves.
 *
 * Detected here rather than at the five call sites so every one of them is
 * covered: the profile screen, the edit form's prefill, and the dialogs that
 * read a member's record. The context is read directly instead of through
 * `usePermissions()` — that one throws without a provider, and this hook is
 * reached from tests that mount no provider at all. No context just means no
 * signed-in id to match, which is the non-self path anyway.
 */
export function useProfile(userId) {
  const permissions = useContext(PermissionContext);
  const { activeUserId } = useAuth();
  // The permission context carries the signed-in id on the web; the app has the
  // session instead. Either one answering "this is you" routes to /users/me,
  // which a member may always read about themselves.
  const selfId = permissions?.userId ?? activeUserId;
  const isSelf =
    userId != null && selfId != null && String(selfId) === String(userId);

  return useQuery({
    queryKey: ['user', String(userId)],
    queryFn: () => (isSelf ? authService.me() : usersService.byId(userId)),
    enabled: Boolean(userId),
  });
}

/**
 * `updateUserInList(userId, changes)` — patch one member's row in the cached
 * list, in place, with no request.
 *
 * Every popup that changes one field calls this instead of invalidating. It runs
 * across every cached block and every filter combination, so the row is correct
 * whichever page the user pages back to.
 *
 * Use it only for changes the frontend can state exactly — a name it just picked
 * from a dropdown, a boolean it just flipped. Anything the server derives (a
 * display name resolved from an id it has not returned) should still be
 * refetched, or the table shows a value nothing confirmed.
 */
export function useUserListCache() {
  const queryClient = useQueryClient();
  return useCallback(
    (userId, changes) =>
      queryClient.setQueriesData({ queryKey: ['members'] }, (data) =>
        patchRowInList(data, userId, changes)
      ),
    [queryClient]
  );
}

/**
 * Attending / Not Attending toggle, via PATCH /api/v1/users/status/bulk.
 *
 * The row is patched with the value the server just accepted, rather than
 * optimistically before it: nothing moves until the response lands, so a failed
 * write leaves the row exactly as the backend last reported it.
 */
export function useMemberStatusUpdate() {
  const updateUserInList = useUserListCache();
  return useMutation({
    mutationFn: ({ userIds, status }) => usersService.updateStatusBulk(userIds, status),
    onSuccess: (_data, { userIds, status }) => {
      for (const id of userIds) updateUserInList(id, { status });
    },
  });
}

/**
 * POST /api/v1/users/, then the member's education and job rows.
 *
 * `UserCreate` declares neither `educations` nor `jobs` — each row is its own
 * endpoint under the member — so the payload is split by the caller. Sent inside
 * the member body they were accepted and silently discarded, and everything the
 * user typed on those two steps was lost with no error.
 *
 * The rows are written only after the member exists, because their URL contains
 * its id. They are NOT part of the create transaction: if the member is created
 * and a row fails, the member still exists and the failure is reported as a
 * count rather than rolled back — there is no endpoint to undo a create with,
 * and discarding a good member over a failed education row would be worse.
 *
 * One of the two writes that invalidates rather than patching the row: a new
 * member's position in the list depends on the active filters and page —
 * inserting it locally would put it somewhere the server would not. The form
 * navigates back to the list anyway, so the refetch happens during a remount
 * nobody is watching.
 *
 * Resolves `{ response, failedRecords }`.
 */
export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ user, educations = [], jobs = [] }) => {
      const response = await usersService.create(user);

      const newId = response?.data?.id;
      // `UserResponse` requires `id`, so this should always resolve. If a
      // deployment ever answers without one, the member is still created — the
      // rows are reported as failed rather than posted to `/users/undefined/…`.
      if (newId == null) {
        return { response, failedRecords: educations.length + jobs.length };
      }

      // allSettled, not all: one bad row must not abandon the rest.
      const written = await Promise.allSettled([
        ...educations.map((row) => usersService.createEducation(newId, row)),
        ...jobs.map((row) => usersService.createJob(newId, row)),
      ]);

      return { response, failedRecords: written.filter((r) => r.status === 'rejected').length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
  });
}

/**
 * POST /api/v1/users/{parentId}/children — register a no-mobile child under a
 * parent. Like useCreateUser, a new row the server derives, so it invalidates
 * the member list rather than patching. Resolves the envelope so the caller can
 * read the created child's id and the backend's own success message.
 */
export function useCreateChild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ parentId, child, educations = [], jobs = [] }) => {
      const response = await usersService.createChild(parentId, child);

      const newId = response?.data?.id;
      // Mirrors useCreateUser: the child's education/job rows are their own
      // endpoints, posted after the child exists. allSettled so one bad row
      // doesn't abandon the rest.
      if (newId == null) {
        return { response, failedRecords: educations.length + jobs.length };
      }
      const written = await Promise.allSettled([
        ...educations.map((row) => usersService.createEducation(newId, row)),
        ...jobs.map((row) => usersService.createJob(newId, row)),
      ]);
      return { response, failedRecords: written.filter((r) => r.status === 'rejected').length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
  });
}

/**
 * PATCH /api/v1/users/{id} — the full edit form.
 *
 * The other write that invalidates. The row shows values the *server* derives:
 * user_name from three name parts, role_name from role_id, sabha_name from
 * sabha_id. Patching those from the submitted payload would display names
 * nothing has confirmed. As with create, the form leaves for the list on
 * success, so the refetch is free.
 *
 * The single-field popups are the opposite case — they know the exact display
 * value because the user just picked it — and use useUserListCache instead.
 */
export function useUpdateUser(userId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => usersService.update(userId, payload),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['members'] }),
      queryClient.invalidateQueries({ queryKey: ['user', String(userId)] }),
    ]),
  });
}

/**
 * Roles this member may be moved to. Per member, because the backend narrows the
 * list by both the member and the caller — so it is keyed by user id and not
 * shared with the generic role lookup.
 */
export function useAssignableRoles(userId, enabled = true) {
  return useQuery({
    queryKey: ['assignable-roles', String(userId)],
    queryFn: () => usersService.assignableRoles(userId),
    enabled: enabled && Boolean(userId),
    ...LOOKUP_CACHE,
  });
}

/** Change a member's role. */
export function useUpdateRole() {
  const queryClient = useQueryClient();
  const updateUserInList = useUserListCache();
  const { session, reloadPermissions } = useAuth();
  return useMutation({
    mutationFn: ({ userId, roleId }) => usersService.updateRole(userId, roleId),
    onSuccess: async (_data, { userId, roleName }) => {
      // The caller picked this name off the list it was shown, so it is exactly
      // what the server just stored — no refetch needed to learn it.
      updateUserInList(userId, { role_name: roleName });
      // The member's own record is a different query and may be open behind the
      // dialog; marking it stale costs nothing unless it is actually mounted.
      queryClient.invalidateQueries({ queryKey: ['user', String(userId)] });

      /**
       * CHANGING YOUR OWN ROLE CHANGES THE APP AROUND YOU, and none of the
       * invalidation above reaches it. The caller's grants are not a query:
       * AuthContext fetches /full-context once at sign-in and holds it in state,
       * because the session boots from it before any provider below could ask.
       * So the sidebar, the role chip in the header and every route guard went
       * on describing the role held at sign-in until the page was reloaded by
       * hand — the one screen a role change is most visible on was the one that
       * did not move.
       *
       * Re-read only when the member IS the caller. A role change made to
       * somebody else cannot alter this session's own grants, and re-reading
       * for every row an admin edits would be a request per save.
       */
      if (session?.userId != null && String(session.userId) === String(userId)) {
        await reloadPermissions?.();
      }
    },
  });
}

/** Reassign a member's follow-up person. */
export function useUpdateFollowup() {
  const updateUserInList = useUserListCache();
  return useMutation({
    mutationFn: ({ userId, followupById }) => usersService.updateFollowup(userId, followupById),
    onSuccess: (_data, { userId, followupName }) =>
      updateUserInList(userId, { followup_by_id_name: followupName }),
  });
}

/** Quick Transfer from the members list. */
export function useQuickTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args) => transferService.createTransferRequest(args),
    // The member has NOT moved — a request was filed and the destination side
    // decides. So the list row is left alone: it still shows the Sabha they are
    // still in. Only the member's own record is marked stale, in case the
    // backend records the pending request on it.
    onSuccess: (_data, { userId }) =>
      queryClient.invalidateQueries({ queryKey: ['user', String(userId)] }),
  });
}




// ── Sub-resources of one member ────────────────────────────────────────────
// Each is a separate endpoint and each is fetched only when its own tab is
// opened — `enabled` is the tab being active. Opening the form therefore costs
// one request, not four, and re-opening a tab already visited costs none.

export function useUserEducations(userId, enabled) {
  return useQuery({
    queryKey: ['user-educations', String(userId)],
    queryFn: () => usersService.educations(userId),
    enabled: Boolean(userId) && enabled,
  });
}

export function useUserJobs(userId, enabled) {
  return useQuery({
    queryKey: ['user-jobs', String(userId)],
    queryFn: () => usersService.jobs(userId),
    enabled: Boolean(userId) && enabled,
  });
}

export function useUserFamily(userId, enabled) {
  return useQuery({
    queryKey: ['user-family', String(userId)],
    queryFn: () => usersService.family(userId),
    enabled: Boolean(userId) && enabled,
  });
}

/**
 * Create / update / delete for a member's education and job rows.
 *
 * Each invalidates only its own list — a new education refetches educations and
 * nothing else. The lists are small and the write already returned, so refetching
 * that one is cheaper than reasoning about where a server-generated id landed.
 */
function useRecordMutations(userId, key, service) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [key, String(userId)] });

  const create = useMutation({ mutationFn: (payload) => service.create(userId, payload), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, payload }) => service.update(userId, id, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id) => service.remove(userId, id), onSuccess: invalidate });

  return { create, update, remove, isPending: create.isPending || update.isPending || remove.isPending };
}

export const useEducationMutations = (userId) =>
  useRecordMutations(userId, 'user-educations', {
    create: usersService.createEducation,
    update: usersService.updateEducation,
    remove: usersService.deleteEducation,
  });

export const useJobMutations = (userId) =>
  useRecordMutations(userId, 'user-jobs', {
    create: usersService.createJob,
    update: usersService.updateJob,
    remove: usersService.deleteJob,
  });

/**
 * Linking and unlinking relatives on a member's Family tab. Add and remove are
 * the whole vocabulary — the API has no update for a membership, so a relation
 * is changed by removing the person and adding them back.
 *
 * `add` takes `{ memberUserId, relationId, familyId, headRelationId }` and is
 * two calls when the member has no family yet:
 *
 *   1. the member joins a family of their own — no `family_id`, so the API
 *      founds one and makes them its head. `headRelationId` is the id of the
 *      "Family Head" relation, looked up by name from /api/v1/relations by the
 *      caller rather than hardcoded here.
 *   2. the relative joins that family under the chosen relation.
 *
 * Both are `POST /users/{id}/family-member`, each naming the person joining.
 * Step 1 is skipped once a family exists. If step 2 fails the new family is
 * left standing with the member as its sole head, which is the state the next
 * attempt expects — no cleanup is attempted, since a partial rollback would
 * need a delete the backend refuses while members remain.
 */
export function useFamilyMutations(userId) {
  const queryClient = useQueryClient();
  const invalidate = (id = userId) =>
    queryClient.invalidateQueries({ queryKey: ['user-family', String(id)] });

  /**
   * `subjectId` is the member whose family this is. It is a per-call argument
   * rather than only the bound `userId` because on the add form the member is
   * created by this very action — the caller has the new id before the hook's
   * own props have caught up.
   */
  const add = useMutation({
    mutationFn: async ({ subjectId, memberUserId, relationId, familyId = null, headRelationId = null }) => {
      const subject = subjectId ?? userId;
      if (!subject) throw new Error('There is no member to add a family to yet.');

      let id = familyId;
      if (!id) {
        if (!headRelationId) throw new Error('The "Family Head" relation is missing from the relation list.');
        const founded = await usersService.joinFamily(subject, { relationId: headRelationId });
        id = founded?.data?.family_id;
        if (!id) throw new Error('The family was created but its id did not come back.');
      }
      return usersService.joinFamily(memberUserId, { relationId, familyId: id });
    },
    /**
     * Seeded from the write's own response, not invalidated.
     *
     * `GET /users/{id}/family` and `POST /users/{id}/family-member` return the
     * SAME schema — `StandardResponse_UserFamilyResponse_`, i.e.
     * `{ family_id, members[] }` — so the response already IS what a refetch
     * would fetch. Asking for it again was up to two extra GETs on the add flow:
     * one because creating the member flips `memberId` from undefined to an id
     * and mounts this query for the first time, and one from the invalidation.
     * With the row seeded and `staleTime: 30_000`, neither fires.
     *
     * Falls back to invalidating if the payload is not the shape expected, so an
     * API that stops returning the family still refreshes the roster rather than
     * leaving a stale one on screen.
     */
    onSuccess: (res, vars) => {
      const id = vars?.subjectId ?? userId;
      const family = res?.data;
      if (family && Array.isArray(family.members)) {
        queryClient.setQueryData(['user-family', String(id)], family);
        return;
      }
      invalidate(id);
    },
  });

  // The path names whoever is leaving — the relative, not the member whose
  // screen this is.
  //
  // Invalidates rather than seeding, unlike `add` above: DELETE answers a plain
  // `StandardResponse` with no typed `data`, so there is no family payload to
  // put in the cache and the list has to be re-read.
  const remove = useMutation({
    mutationFn: ({ memberUserId }) => usersService.leaveFamily(memberUserId),
    onSuccess: (_data, vars) => invalidate(vars?.subjectId),
  });

  return { add, remove, isPending: add.isPending || remove.isPending };
}
