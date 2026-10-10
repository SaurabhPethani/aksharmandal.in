import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listService, reportService, yuvaSevaService } from '../services/reportService';
import { activityService } from '../services/activityService';
import { downloadFile } from '../utils/fileDownload';
import { useDebounced } from './core';
import { useServerPagination } from './usePagination';

// Dashboard figures, the weekly trend series, the activity feed, and the generic
// module-screen list.
//
// ⚠ useWeeklyTrends and useActivityLogs currently have NO caller: TrendChart and
// ActivityFeed are not imported anywhere, so /weekly-reports and /activity-logs
// are never requested. Either wire those components into the Dashboard or delete
// all four — see docs/AUDIT.md §8.1.

/**
 * The report reads answer `{ data, filters }`, where `filters` lists the scopes
 * this caller may filter by. Screens still want `query.data` to be the payload,
 * so the envelope is split here: `data` stays the payload and `filters` rides
 * alongside it.
 *
 * `filters` has shipped both beside `data` and inside it, so both are checked —
 * the block is an open object in the OpenAPI document, not a pinned schema.
 */
function withFilters(query) {
  const body = query.data;
  return {
    ...query,
    data: body?.data,
    filters: body?.data?.filters ?? body?.filters,
  };
}

/** Dashboard overview. Skipped entirely unless REPORTS:READ is granted. */
export function useOverview(params, enabled) {
  return withFilters(useQuery({
    queryKey: ['report-overview', params ?? null],
    queryFn: () => reportService.overview(params),
    enabled,
    // The figures stay on screen, dimmed, while the next filter loads — blanking
    // the row on every dropdown change makes the page flash.
    placeholderData: (prev) => prev,
  }));
}

/**
 * Compare report — two periods (A vs B) of the same granularity on
 * Present/Absent. `enabled` gates the request until both periods are chosen.
 * `filters` is split out for the scope bar, like useOverview.
 */
export function useCompare(params, enabled) {
  return withFilters(useQuery({
    queryKey: ['reports-compare', params ?? null],
    queryFn: () => reportService.compare(params),
    enabled,
    placeholderData: (prev) => prev,
  }));
}

/**
 * The members behind one retention KPI — the Lapsed / Retain / New drill-down.
 *
 * `bucket` is null until a tile is clicked, which is what `enabled` keys on: the
 * popup's request fires when it opens and not before. Closing the dialog sets
 * `bucket` back to null and the query goes idle; React Query keeps the answer,
 * so reopening the same tile under the same filters is instant.
 *
 * `params` MUST be the same scope object the overview was fetched with — it is
 * in the query key for that reason. The two endpoints resolve the same window,
 * so the list length equals the tile only while the filters agree, and keying on
 * `params` means changing a filter refetches rather than showing the old Sabha's
 * people under the new Sabha's number.
 *
 * No `placeholderData`: unlike the figures row, a stale list here would show one
 * bucket's members under another bucket's heading for a beat.
 */
export function useOverviewMembers(params, bucket, enabled = true) {
  const query = useQuery({
    queryKey: ['report-overview-members', bucket, params ?? null],
    queryFn: () => reportService.overviewMembers({ ...(params ?? {}), bucket }),
    enabled: enabled && Boolean(bucket),
  });
  return {
    ...query,
    members: query.data?.members ?? [],
    // The API's own count, kept separate from `members.length` so the dialog can
    // show what the server said it was sending rather than what arrived.
    total: query.data?.total ?? 0,
  };
}

/**
 * Weekly attendance trend, flattened for charting.
 *
 * GET /api/v1/weekly-reports nests Year -> Month -> Week; the chart wants a flat
 * ordered series, so flatten here rather than in the component. Every value is
 * passed through from the API — nothing is computed or estimated.
 */
export function useWeeklyTrends(params, enabled) {
  const query = withFilters(useQuery({
    queryKey: ['weekly-reports', params ?? null],
    queryFn: () => reportService.weeklyReports(params),
    enabled,
  }));

  const points = useMemo(() => {
    const years = query.data?.weekly_trends ?? [];
    const flat = [];
    for (const y of years) {
      for (const m of y.months ?? []) {
        for (const w of m.weeks ?? []) {
          flat.push({
            label: formatWeekLabel(w.week_date),
            sortKey: w.week_date,
            present: w.present_percentage,
            average4w: w['4w_present_average_percentage'],
            presentCount: w.present_count,
            absentCount: w.absent_count,
          });
        }
      }
    }
    return flat.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  }, [query.data]);

  return { ...query, points };
}

function formatWeekLabel(weekDate) {
  if (!weekDate) return '—';
  const d = new Date(weekDate);
  if (Number.isNaN(d.getTime())) return String(weekDate);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** The weekly trend, unflattened — the Reports page groups it by month itself. */
export function useWeeklyReports(params, enabled) {
  return withFilters(useQuery({
    queryKey: ['weekly-reports-raw', params ?? null],
    queryFn: () => reportService.weeklyReports(params),
    enabled,
    placeholderData: (prev) => prev,
  }));
}

/**
 * The Download Report tab's filter blocks, keyed by report.
 *
 * ONE FETCH FOR THE WHOLE TAB — the response describes every export, so a card
 * per request would ask for the same body five times. Cached long: the lists
 * are a fact about the caller's hierarchy and the records under it, which does
 * not move while someone is choosing a year from a dropdown.
 *
 * `enabled` is the caller's REPORTS:DOWNLOAD check — the endpoint is gated on
 * it, so asking without it is a guaranteed 403.
 */
export function useReportExportFilters(enabled = true) {
  return useQuery({
    queryKey: ['reports-export-filter'],
    queryFn: () => reportService.exportFilters(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * The Yuva Seva follow-up report. Returns the whole envelope, because the four
 * totals live beside `data` rather than in it.
 */
export function useYuvaSevaReport(params, enabled = true) {
  return useQuery({
    queryKey: ['yuva-seva-report', params ?? null],
    queryFn: () => reportService.yuvaSevaReport(params),
    enabled,
  });
}

/**
 * Logs one Yuva Seva.
 *
 * The report is invalidated on success: it counts these records, and the row the
 * entry was added from is showing figures that have just changed.
 */
export function useAddYuvaSeva() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => yuvaSevaService.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['yuva-seva-report'] }),
  });
}

/** Sabha-wise Present counts for the last four completed weeks. */
export function useWeeklySabhaReport(params, enabled) {
  return withFilters(useQuery({
    queryKey: ['weekly-sabha-report', params ?? null],
    queryFn: () => reportService.weeklySabhaReportList(params),
    enabled,
    placeholderData: (prev) => prev,
  }));
}

// A follow-up person's members no longer need a request of their own: the
// `sabha_id` report nests each person's members inside their row, so the whole
// Sabha tree arrives in one call. `useFollowupMembers` — one eager query per
// person — was removed when that nesting landed. The level-3
// `sabha_id + followup_user_id` shape still exists on the API for anything that
// wants a flat member list, but the Sabha report reads the nested members
// directly (see ReportsPage FollowupRows).

/** One sitting's attendance summary, by Sabha. Regular or special alike. */
export function useSabhaReport(sabhaDetailId) {
  return useQuery({
    queryKey: ['sabha-report', String(sabhaDetailId ?? '')],
    queryFn: () => reportService.sabhaReport(sabhaDetailId),
    enabled: Boolean(sabhaDetailId),
  });
}

/** Live per-follow-up-head report for one sitting (this + the prior 3 sittings). */
export function useSittingReportHeads(sabhaDetailId, enabled = true) {
  return useQuery({
    queryKey: ['sitting-report-heads', String(sabhaDetailId ?? '')],
    queryFn: () => reportService.sittingReportHeads(sabhaDetailId),
    enabled: enabled && Boolean(sabhaDetailId),
    staleTime: 15_000,
  });
}

/**
 * The recurring Special Sabha rules the caller may report on — the report's
 * dropdown. Scope-clamped server-side; gated SPECIAL_SABHA:REPORT (additive with
 * REPORTS:READ). Returns the whole envelope, since the rows sit under `.data`.
 */
export function useSpecialSabhaRules(enabled = true) {
  return useQuery({
    queryKey: ['special-sabha-rules'],
    queryFn: () => reportService.specialSabhaRules(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * The longitudinal report for one recurring Special Sabha — a per-member P/A
 * grid across recent weeks, a weekly present-count trend, summary tiles, and
 * at-risk follow-up lists. `params` is `{ schedule_id, weeks?, week_date? }`;
 * `enabled` gates it until a schedule is known. The whole envelope is returned —
 * the payload lives under `.data`.
 */
export function useSpecialSabhaHistory(params, enabled = true) {
  return useQuery({
    queryKey: ['special-sabha-history', params ?? null],
    queryFn: () => reportService.specialSabhaHistory(params),
    enabled: enabled && Boolean(params?.schedule_id),
  });
}

/**
 * That report's Excel — the Present attendees of one sitting.
 *
 * Its own hook because the screen that runs it knows the Sabha and nothing else;
 * see `useReportDownload` below for the Reports screen's own six.
 */
export function useSabhaReportExport() {
  const download = useReportDownload();
  return {
    ...download,
    mutateAsync: ({ sabhaDetailId, filename }) =>
      download.mutateAsync({
        path: '/api/v1/sabha-report/export',
        params: { sabha_detail_id: sabhaDetailId },
        filename: filename || `sabha-${sabhaDetailId}.xlsx`,
      }),
  };
}

/** `{ path, params }` -> `/path?a=1&b=2`, dropping null/undefined values. */
function withQuery(path, params) {
  const pairs = Object.entries(params ?? {}).filter(([, v]) => v != null && v !== '');
  if (!pairs.length) return path;
  const qs = pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${path}${path.includes('?') ? '&' : '?'}${qs}`;
}

/**
 * Downloads any of the report exports as an Excel file.
 *
 * On React Native the bytes are pulled outside axios (which has no reliable
 * binary response here) by `downloadFile` — it fetches with the bearer token,
 * saves to the Downloads folder on Android, and otherwise hands the file to the
 * share sheet. It returns `{ ok, mode?, reason? }` instead of throwing, so this
 * hook throws on failure to keep the `mutateAsync` contract the screens expect.
 *
 * One hook for all of them: they differ only in path, parameters and file name.
 */
export function useReportDownload() {
  return useMutation({
    // A download changes nothing on the server, so it is the one mutation that
    // does not refresh every query afterwards — see utils/queryClient.js.
    meta: { refreshOnSuccess: false },
    mutationFn: async ({ path, params, filename }) => {
      const res = await downloadFile(withQuery(path, params), filename || 'report.xlsx');
      if (!res.ok) {
        if (res.reason === 'cancelled') return false;
        throw new Error(res.reason || 'Could not download the file.');
      }
      return true;
    },
  });
}

/**
 * Recent activity feed — the one list endpoint that genuinely pages server-side,
 * so it runs the block strategy: one request per 100 records, four UI pages of
 * 25 from each. Owns its own page state; callers just render what it returns.
 */
export function useActivityLogs(enabled) {
  return useServerPagination({
    queryKey: ['activity-logs'],
    fetchBlock: (params) => activityService.list(params),
    enabled,
  });
}

/**
 * List data for a module screen, server-paged. `endpoint` comes from the
 * registry; passing null disables the query (unregistered module, or no read
 * access). Search is sent as a param, and falls back to a local filter on
 * endpoints that do not page yet.
 */
export function useModuleList(endpoint, { search } = {}) {
  const debouncedSearch = useDebounced(search, 350);
  return useServerPagination({
    queryKey: ['module-list', endpoint],
    fetchBlock: (params) => listService.fetch(endpoint, params),
    params: { search: debouncedSearch || undefined },
    enabled: Boolean(endpoint),
  });
}
