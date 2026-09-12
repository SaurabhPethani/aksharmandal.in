import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboardService';

// The dashboard's own read. Its Reports counterpart is useOverview in
// ./useReports.js, which still serves the Reports screen and is no longer used
// by /dashboard.

/**
 * GET /dashboard-overview, split into the two blocks the page tabs between.
 *
 * Returns the react-query result with `data` as the payload plus `overall` and
 * `self` lifted out of it, so a component can take just the half it draws
 * without reaching through two levels on every read.
 *
 * `filters` is pulled out of the envelope the same way useOverview does it —
 * the block ships beside `data` and would be discarded by the unwrapping the
 * other services use.
 *
 * Ungated: the endpoint takes no permission (see dashboardService), so unlike
 * useOverview there is no `enabled` argument to forget to pass.
 */
export function useDashboardOverview(params) {
  const query = useQuery({
    queryKey: ['dashboard-overview', params ?? null],
    queryFn: () => dashboardService.overview(params),
    // The figures stay on screen, dimmed, while the next filter loads —
    // blanking the row on every change makes the page flash.
    placeholderData: (prev) => prev,
  });

  const body = query.data;
  const data = body?.data;
  return {
    ...query,
    data,
    overall: data?.overall,
    self: data?.self,
    filters: data?.filters ?? body?.filters,
  };
}

/**
 * GET /dashboard/present-absent — Present / Absent / Pending for the current
 * (live) week and the last completed week over the caller's scope.
 *
 * Counts only; the member rows come from `usePresentAbsentMembers` on drill-down.
 * Only mounted on the User Dashboard tab (self-only roles get 403 from the
 * endpoint), so no `enabled` gate is needed here. Keeps the previous figures on
 * screen while a refetch is in flight, like `useDashboardOverview`.
 */
export function usePresentAbsent(params) {
  return useQuery({
    queryKey: ['present-absent', params ?? null],
    queryFn: () => dashboardService.presentAbsent(params),
    placeholderData: (prev) => prev,
  });
}

/**
 * GET /dashboard/present-absent/members — one bucket's roster for one week.
 *
 * `week` is `current` | `last`, `bucket` is `present` | `absent` | `pending`.
 * Disabled until a bucket is chosen (a tile is clicked), mirroring
 * `useOverviewMembers`, so no request fires for a dialog that is closed.
 *
 * The endpoint returns `user_name`; the shared `KpiMembersDialog` call sheet
 * reads `member.name`, so each row is aliased here — one place, rather than
 * every consumer reaching for the other key.
 */
export function usePresentAbsentMembers({ week, bucket, limit = 200, params, enabled = true }) {
  const query = useQuery({
    queryKey: ['present-absent-members', week, bucket, limit, params ?? null],
    queryFn: () =>
      dashboardService.presentAbsentMembers({ week, bucket, limit, ...(params ?? {}) }),
    enabled: enabled && Boolean(bucket),
    placeholderData: (prev) => prev,
  });
  const members = (query.data?.members ?? []).map((m) => ({ ...m, name: m.user_name }));
  return { ...query, members, total: query.data?.total ?? 0 };
}

/**
 * Does the `overall` block have anything worth a tab?
 *
 * The page hides a tab whose data is empty, and "empty" has to mean EVERY
 * figure is absent — not falsy. A real Sabha can legitimately report 0 absent
 * members and 0 untouched members in a good week, and treating that as "no
 * data" would hide the tab exactly when the numbers are best. So a figure
 * counts as present when the API sent a number at all, whatever that number is;
 * the block is empty only when the response carried none of them.
 */
export function hasOverallData(overall) {
  if (!overall) return false;
  const figures = [
    overall.total_users?.number,
    overall.monthly_once?.number,
    overall.absent_yuvak,
    overall.untouched_yuvak,
  ];
  if (figures.some((v) => v != null)) return true;
  return (
    (overall.attendance_last_4_week?.length ?? 0) > 0 ||
    (overall.attendance_last_12_week?.length ?? 0) > 0
  );
}

/**
 * Does the `self` block have anything worth a tab?
 *
 * Stricter than `hasOverallData`, and deliberately so. The three self counts
 * are ALWAYS sent — a member with no history gets zeros rather than nulls — so
 * "did the API send a number" would be true for everybody and the tab would
 * never hide. What makes this block worth showing is that the member has
 * something in it: a joining date, or an attendance record.
 *
 * ⚠ `present_in_last_4w.total` IS NOT A TEST. It is hard-coded to 4 by the API
 * — four weeks is four Sabhas whatever the records hold — so `total > 0` is
 * true for every member alive and would pin this tab open forever. Its
 * `attended` is the figure that carries information.
 */
export function hasSelfData(self) {
  if (!self) return false;
  return Boolean(
    self.sabha_age ||
    (self.total_sabha_present?.total_sabha ?? 0) > 0 ||
    (self.present_in_last_4w?.attended ?? 0) > 0
  );
}
