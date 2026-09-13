import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceService } from '../services/attendanceService';

/**
 * Sabhas for a landing tab, or (with no type) every active one for the scanner.
 *
 * `status` is sent for regular Sabhas and NOT for special ones. A regular Sabha
 * is a standing weekly sitting, so the list is meant to be the live ones;
 * a special Sabha is a one-off event, and filtering those to `status=true`
 * hides the ones that have already been held — which is most of them, and
 * exactly what the Special tab exists to show.
 *
 * Pass `status` explicitly to override either way; `null` sends nothing.
 */
export function useSabhaDetails({ type, status, attendance } = {}, enabled = true) {
  const effective = status === undefined ? (type === 'special' ? null : true) : status;
  // `undefined` is dropped from a query string; `null` is how "deliberately not
  // sent" is spelled here, so it has to become undefined before it travels.
  //
  // `attendance` is `is_available_for_attendance` — 1 for sittings open to
  // marking, 0 for closed, omitted for both. Only the scanner passes it.
  const params = {
    type,
    ...(effective == null ? {} : { status: effective }),
    ...(attendance == null ? {} : { attendance }),
  };
  return useQuery({
    queryKey: ['sabha-details', type ?? 'all', effective ?? 'any', attendance ?? 'any'],
    queryFn: () => attendanceService.sabhaDetails(params),
    enabled,
  });
}

export function useSabhaSchedules(enabled = true) {
  return useQuery({
    queryKey: ['sabha-schedules'],
    queryFn: () => attendanceService.sabhaSchedules(),
    enabled,
  });
}

/**
 * Live attendance for one Sabha — totals and each member's marked status.
 * This is the source of truth the member rows render from, so marking refetches
 * it rather than mutating anything locally.
 */
export function useAttendanceSummary(sabhaDetailId) {
  return useQuery({
    queryKey: ['attendance', sabhaDetailId ?? null],
    queryFn: () => attendanceService.summary(sabhaDetailId),
    enabled: Boolean(sabhaDetailId),
  });
}

/**
 * Last week's Present/Absent for this sitting's Sabha, plus Present at the same
 * weekday+time last week — the two Mark-page comparison KPIs. Its own query key
 * so it is not swept by the per-mark summary refetch; it changes on human
 * timescales, so the default staleTime is fine.
 */
export function usePriorWeek(sabhaDetailId) {
  return useQuery({
    queryKey: ['attendance-prior-week', sabhaDetailId ?? null],
    queryFn: () => attendanceService.priorWeek(sabhaDetailId),
    enabled: Boolean(sabhaDetailId),
  });
}

/**
 * Marks one or more members.
 *
 * ONE REFETCH PER BURST, NOT ONE PER MARK. The Mark screen fires these
 * concurrently now — a marker tapping down a list of 240 can easily have five
 * in the air — and invalidating on every success meant five marks bought five
 * summary refetches of the whole sitting. On a slow connection that is the
 * thing that makes the screen feel stuck: the writes are quick, and then the
 * reads queue up behind each other.
 *
 * `onSettled` fires while THIS mutation is still counted as running, so
 * `isMutating() === 1` means "I am the last one" — the burst is over and one
 * refetch now reconciles everything. Any earlier mark in the same burst skips
 * it and lets the last one do the work.
 *
 * `onSettled` rather than `onSuccess`, so a burst whose final mark FAILS still
 * refetches: the screen must end up showing what the server really has, not
 * the optimistic state the failure left behind.
 *
 * A `mutationKey` purely so `isMutating` can count these and not every other
 * mutation in the app.
 */
export function useMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['mark-attendance'],
    /**
     * OPTS OUT OF THE APP-WIDE POST-WRITE REFRESH (see utils/queryClient.js).
     *
     * That backstop calls `invalidateQueries()` with NO filter on every
     * successful mutation, so a single attendance tick refetched everything
     * mounted: the header avatar, both notification-bell queries, the approvals
     * badge, the member roster, AND the summary — then the summary a second
     * time, because the cache-level callback and this hook's own `onSettled`
     * are two separate awaited passes (mutation.js lines 116 and 137).
     *
     * Nine requests for one checkbox, and a marker works down a list of 240.
     * It also defeated the burst coalescing below: that only ever collapsed THIS
     * hook's invalidation, while the global one fired once per mark regardless.
     *
     * Safe to skip here precisely because this hook already refreshes what the
     * write changed. Marking attendance does not alter the roster, the avatar,
     * a transfer request or an approval — the summary is the only read affected,
     * and `onSettled` below refetches exactly that, once per burst.
     */
    meta: { refreshOnSuccess: false },
    mutationFn: (args) => attendanceService.markBulk(args),
    /**
     * ONE SILENT RETRY, FOR CONNECTION FAILURES ONLY.
     *
     * React Query does not retry mutations by default, and rightly so — a
     * mutation that half-succeeded is not safe to repeat. This one IS: mark-bulk
     * SETS a status rather than incrementing anything, so applying it twice
     * lands the member in exactly the same place as applying it once.
     *
     * `status === 0` is the client's own code for "no response at all" (see
     * api/client.js) — offline, DNS, CORS, or the 15s timeout firing. Those are
     * the failures a phone actually produces walking between cells, and a
     * marker should not have to notice them. Anything the SERVER answered is
     * never retried: a 403 or a 422 will say the same thing the second time,
     * and repeating it only delays the error the user needs to see.
     */
    retry: (failureCount, error) => failureCount < 1 && error?.status === 0,
    retryDelay: 1_000,
    onSettled: (_data, _err, args) => {
      if (queryClient.isMutating({ mutationKey: ['mark-attendance'] }) > 1) return;
      queryClient.invalidateQueries({ queryKey: ['attendance', args.sabhaDetailId] });
    },
  });
}

/**
 * Creates a Special Sabha or a Schedule. `form` is a definition from
 * utils/attendanceFormSchema.js — it names both the service call and the list
 * query to refresh, so the tab behind the form shows the new row on return.
 */
export function useCreateAttendanceRecord(form) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => attendanceService[form.endpoint](payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: form.invalidate }),
  });
}

/**
 * Creates or updates, from the same definition: with an `id` the form's
 * `updateEndpoint` is called, without one its `endpoint`. One hook so the popup
 * that draws the fields does not branch on which it is doing.
 */
export function useSaveAttendanceRecord(form, id = null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      id == null
        ? attendanceService[form.endpoint](payload)
        : attendanceService[form.updateEndpoint](id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: form.invalidate }),
  });
}

/**
 * Calls off one sitting. The list is refetched rather than patched locally: a
 * cancel changes `status`, and which section a row belongs to is derived from
 * exactly that.
 */
export function useCancelSabhaDetail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => attendanceService.cancelSabhaDetail(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sabha-details'] }),
  });
}
