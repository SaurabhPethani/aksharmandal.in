import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, Download, FileBarChart, FileSpreadsheet, ImageDown,
  ListFilter, Loader2, Minus, Plus,
} from 'lucide-react';
import {
  useMe, useOverview, useOverviewMembers, usePermissions,
  useReportDownload, useReportExportFilters, useSabhaDetails, useToast,
  useWeeklyReports, useWeeklySabhaReport,
} from '../hooks';
import { Button, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { Breadcrumbs, Tabs } from '../components/Navigation';
import { Combobox, Select } from '../components/form';
import TrendChart from '../components/reports/TrendChart';
import ReportFilterBar from '../components/reports/ReportFilterBar';
import KpiMembersDialog from '../components/reports/KpiMembersDialog';
import ForbiddenPage from './ForbiddenPage';
import { ACTIONS, MODULES } from '../constants/permissions';
import { canDrillIntoKpi } from '../constants/roles';
import {
  SPECIAL_SABHA_CARD, MEMBERS_EXPORT_CARD, cardFor, controlsFrom, hierarchyControlsFrom, hierarchyParams,
} from '../utils/reportDownloads';
import {
  BLANK_FILTER, absentInWeek, filterParams, isPresent, memberCountLabel,
  presentCount, readPersonRow, readSabhaRow, weekColumns, weekLabel,
} from '../utils/reportFilters';
import { saveReportImage, shareReportOnWhatsApp } from '../utils/reportImage';
import { buildAbsentMessage, buildFullMessage, openSabhaWhatsApp } from '../utils/sabhaWhatsapp';
import { formatNumber } from '../utils/format';
import { pickRows } from '../utils/options';

// Reports.
//
//   the page itself   REPORTS:READ
//   Download Report   REPORTS:DOWNLOAD — the tab is not offered without it
//
// Three tabs over five endpoints:
//   /report-overview                    the six figures at the top
//   /weekly-reports                     Weekly Trend — chart and table
//   /weekly-sabha-report-list           Sabha Report
//   /reports-export-filter              the Download tab's own pickers
//   the /export endpoints               Download Report (see utils/reportDownloads.js)
//
// The Special Sabha export is deliberately absent from /reports-export-filter:
// it is chosen by SITTING rather than by period, so its card declares itself
// (SPECIAL_SABHA_CARD) and searches /attendance/sabhadetails?type=special. The
// same export is also reachable from that Sabha's own report page, via the
// Report link on an Attendance row.

const TAB_LIST = [
  { value: 'trend', label: 'Weekly Trend' },
  { value: 'sabha', label: 'Sabha Report' },
  { value: 'download', label: 'Download Report' },
];

/**
 * All six overview figures, in the API's own order. `key` is the response field.
 *
 * EVERY VALUE IS A PLAIN INTEGER. The endpoint used to answer
 * `{ number, percentage }` objects and this row read `.number` off them; it now
 * answers bare counts, so the value IS `data[key]`. There is no percentage to
 * print beside them any more — the one share in the payload is
 * `yuva_seva_rate`, which is itself the number on the card (`suffix: '%'`).
 *
 * ⚠ `total_users` IS THE ACTIVE MEMBER BASE — `COUNT(users)` where
 * `status = true`, not a head-count of every row in scope. It is the ceiling
 * for the four counts beside it and the denominator of `yuva_seva_rate`, so
 * nothing here can exceed it. (Under the previous contract the active base
 * arrived as `active_users` and `total_users` meant something else; that is why
 * this card once pointed at a different field.)
 *
 * `hint` is a STATIC descriptor of the window each figure covers — the API
 * sends no sub-figure, and a card that is just a bare number does not say
 * whether it means this week, this month, or all time.
 */
const OVERVIEW_CARDS = [
  { key: 'total_users', label: 'Total Members', hint: 'active members' },
  // The 4W / 12W pair reads as one measurement over two windows: distinct
  // members present at ≥1 Sabha in the window, each counted once. The dashboard
  // calls the 4-week one "Monthly Once" — same figure, older name.
  { key: 'active_in_4w', label: 'Active 4W', hint: 'last 4 weeks' },
  { key: 'active_in_12w', label: 'Active 12W', hint: 'last 12 weeks' },
  { key: 'last_sabha', label: 'Last Sabha', hint: 'latest week' },
  // ── The retention trio. All three read the same 12 completed weeks Active
  // 12W covers, cut into three equal 4-week blocks, newest first: W1 (weeks
  // 0-4), W2 (4-8), W3 (8-12). Equal blocks, so the figures mean the same thing
  // on the 1st of a month as on the 28th — the calendar-month version this
  // replaced compared 1 week against 4 early in a month and reported almost
  // everybody as lapsed.
  //
  //   Lapsed   W2 present, W1 absent            was coming, has stopped
  //   Retain   W3 present, W2 absent, W1 back   drifted off, won back
  //   New      W3 and W2 absent, W1 present     unseen for 12 weeks
  //
  // THEY DO NOT ADD UP TO THE MEMBER BASE, and are not meant to: a member who
  // attended right through appears in none of them. The row answers who needs
  // following up, not how many there are — Total Members and the Active 4W/12W
  // pair are the head-counts. Reading Retain as "our regulars" is the mistake
  // to avoid; the W2 gap is required, so it means WON BACK.
  //
  // COLOURED AS A TRAFFIC LIGHT — red / yellow / green, in that order, so the
  // three read as one scale rather than three unrelated tiles. They are the
  // only coloured cards on the row; the other five stay navy, which is what
  // lets these carry meaning at all.
  //
  // `headerClass`/`valueClass` are whole literal class strings because Tailwind
  // scans source text; a built-up `bg-${x}` never reaches the stylesheet.
  //
  // `drilldown: true` makes the figure a BUTTON that opens the member list
  // behind it. Only these three carry it — the other five are populations
  // (`total_users`) or reach measurements over overlapping windows, where a
  // "the N people who make up this number" list is either the whole Mandal or
  // not a coherent set. `drilldownHint` is the popup's subheading, which has
  // room for the sentence the 10px card hint does not.
  {
    key: 'lapsed',
    label: 'Lapsed',
    hint: 'stopped coming',
    headerClass: 'bg-danger-fg',
    valueClass: 'text-danger-fg',
    drilldown: true,
    drilldownHint: 'Came in weeks 4-8, absent for the last 4 completed weeks.',
  },
  {
    key: 'retained',
    label: 'Retain',
    hint: 'back after a gap',
    headerClass: 'bg-caution-fg',
    valueClass: 'text-caution-fg',
    drilldown: true,
    drilldownHint: 'Came in weeks 8-12, missed weeks 4-8, and are back in the last 4.',
  },
  {
    key: 'new_added',
    label: 'New',
    hint: 'first in 12 weeks',
    headerClass: 'bg-success-fg',
    valueClass: 'text-success-fg',
    drilldown: true,
    drilldownHint: 'Present in the last 4 completed weeks, with no attendance in the 8 before them.',
  },
  { key: 'yuva_seva_rate', label: 'Yuva Seva Rate', suffix: '%', hint: 'last 30 days' },
];

/** "18-05-2026" -> "18/05", the axis label; the table keeps the long form. */
// Weekly x-axis tick: "05-01-2026" -> "05-Jan". Day-then-month so the ticks
// read as dates, month abbreviated so a year of weeks stays legible; the year is
// dropped since every tick on one chart shares it.
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (value) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value ?? ''));
  return m ? `${m[1]}-${SHORT_MONTHS[Number(m[2]) - 1] ?? m[2]}` : String(value ?? '');
};

/** "18-05-2026" -> "18 May 2026". */
const longDate = (value) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value ?? ''));
  if (!m) return String(value ?? '—');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[1])} ${months[Number(m[2]) - 1]} ${m[3]}`;
};

const pct = (value) => (value == null ? '' : `${value}%`);

export default function ReportsPage({ module }) {
  const { can } = usePermissions();
  const moduleName = module?.name ?? MODULES.REPORTS;

  if (!can(moduleName, ACTIONS.READ)) {
    return <ForbiddenPage message="Viewing reports requires the Reports · Read permission." />;
  }
  return <Reports module={module} moduleName={moduleName} />;
}

function Reports({ module, moduleName }) {
  const { can } = usePermissions();
  const [tab, setTab] = useState('trend');

  // One filter state per tab — { year, pradeshId, mandalId, sabhaId }. They are
  // deliberately NOT shared: the overview answers a year, the Sabha report
  // answers the last four weeks and takes no year at all, and carrying a
  // selection between them would send a parameter the other endpoint ignores.
  const [overviewFilter, setOverviewFilter] = useState(BLANK_FILTER);
  const [trendFilter, setTrendFilter] = useState(BLANK_FILTER);
  const [sabhaFilter, setSabhaFilter] = useState(BLANK_FILTER);

  const canDownload = can(moduleName, ACTIONS.DOWNLOAD);

  const overviewParams = useMemo(() => filterParams(overviewFilter), [overviewFilter]);
  const overviewQ = useOverview(overviewParams, true);

  /**
   * The KPI drill-down: which of Lapsed / Retain / New has been clicked, or null.
   *
   * The CARD is held rather than its key, because the dialog wants the label and
   * the hint too — and keeping one piece of state means the heading and the list
   * can never describe different buckets.
   *
   * `useMe` supplies the role id for the affordance check. It is a cached lookup
   * the app already makes elsewhere, and it is fetched only for roles that got
   * this far — the page itself is behind REPORTS:READ.
   *
   * ⚠ THE BUTTON BEING HIDDEN IS NOT THE SECURITY BOUNDARY. The backend refuses
   * /report-overview/members below Yuva Seva rank; `canDrillIntoKpi` only keeps
   * a Yuvak from being offered a click that would answer 403.
   */
  const [drillCard, setDrillCard] = useState(null);
  const meQ = useMe();
  const canDrill = canDrillIntoKpi(meQ.data?.role_id);
  // SAME `overviewParams` the figures were fetched with — that is what makes the
  // list length equal the tile. Different filters would give a correct list of a
  // different question.
  const membersQ = useOverviewMembers(overviewParams, drillCard?.key ?? null, canDrill);
  const trendQ = useWeeklyReports(filterParams(trendFilter), tab === 'trend');
  // `sabha_id` is dropped: on this endpoint it is not a filter, it swaps the
  // response for that Sabha's follow-up persons — see reportService.
  const sabhaParams = useMemo(() => filterParams(sabhaFilter, ['sabha_id']), [sabhaFilter]);
  const sabhaQ = useWeeklySabhaReport(sabhaParams, tab === 'sabha');

  /**
   * The years the API has reported, accumulated as responses arrive.
   *
   * The `filters` block is the primary source; this is the fallback for the
   * responses that ship `filters.years: []` — a year appears here only because
   * `weekly_trends` carried it, never because a range was invented around today.
   */
  const [seenYears, setSeenYears] = useState([]);
  const reportedYears = (trendQ.data?.weekly_trends ?? []).map((y) => String(y.year));
  useEffect(() => {
    if (!reportedYears.length) return;
    setSeenYears((prev) =>
      reportedYears.every((y) => prev.includes(y)) ? prev : [...new Set([...prev, ...reportedYears])]
    );
  }, [reportedYears.join(',')]);

  /** The API's filter block, with years back-filled when it lists none. */
  const withYears = (filters) =>
    filters?.years?.length ? filters : { ...(filters ?? {}), years: seenYears };

  const tabs = canDownload ? TAB_LIST : TAB_LIST.filter((t) => t.value !== 'download');

  return (
    <div className="space-y-5">
      <PageHeader
        title={module?.label ?? 'Reports'}
        breadcrumbs={<Breadcrumbs items={[{ label: module?.label ?? 'Reports' }]} />}
      />

      <ReportFilterBar
        filters={withYears(overviewQ.filters)}
        value={overviewFilter}
        onChange={setOverviewFilter}
        busy={overviewQ.isFetching && !overviewQ.isLoading}
        // NO YEAR ABOVE THE KPI ROW. Every one of the eight figures is anchored
        // to the last COMPLETED Sabha week — `max(week_date) - 1 week`, read
        // from the data — and /report-overview ignores `year` outright. The
        // dropdown was therefore a control that changed nothing: pick 2025, the
        // numbers do not move, and the only thing left to conclude is that the
        // page is broken.
        //
        // Hierarchy stays, because Pradesh / Mandal / Sabha DO narrow these
        // figures. Year lives on under the tabs below, where the weekly trend
        // and the Sabha report genuinely span years.
        showYear={false}
      />

      <OverviewCards query={overviewQ} canDrill={canDrill} onDrill={setDrillCard} />

      <KpiMembersDialog
        isOpen={Boolean(drillCard)}
        onClose={() => setDrillCard(null)}
        card={drillCard}
        query={membersQ}
      />

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'trend' && (
        <WeeklyTrend
          query={trendQ}
          filters={withYears(trendQ.filters)}
          filterValue={trendFilter}
          onFilter={setTrendFilter}
          // The scope's own size, from the overview — the same active base the
          // Total Members card above prints, so the caption and the card cannot
          // read as two different member counts.
          memberCount={overviewQ.data?.total_users}
        />
      )}
      {tab === 'sabha' && (
        <SabhaReport
          query={sabhaQ}
          params={sabhaParams}
          filters={sabhaQ.filters}
          filterValue={sabhaFilter}
          onFilter={setSabhaFilter}
          canDownload={canDownload}
        />
      )}
      {/* No `years` prop any more: the Download tab gets its year lists — and
          every other filter — from /reports-export-filter itself. */}
      {tab === 'download' && canDownload && <DownloadReports />}
    </div>
  );
}

// ── Overview ───────────────────────────────────────────────────────────────

function OverviewCards({ query, canDrill, onDrill }) {
  if (query.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Tracks the card's real height, which came down with the type sizes —
            a skeleton that is taller than what replaces it shifts the tabs
            below the moment the figures land. */}
        {OVERVIEW_CARDS.map((c) => <Skeleton key={c.key} className="h-[90px] w-full" />)}
      </div>
    );
  }
  if (query.error) {
    return (
      <div className="card">
        <ErrorState error={query.error} onRetry={query.refetch} title="Could not load the overview" />
      </div>
    );
  }

  const data = query.data ?? {};
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {OVERVIEW_CARDS.map((card) => {
        // A bare integer straight off the payload — no `.number` to unwrap.
        const value = data[card.key];
        // A zero opens an empty dialog, so the number stays plain text — there
        // is nobody behind it to show, and a button that opens "Nobody in this
        // group" is a click that teaches the reader nothing.
        const drillable = canDrill && card.drilldown && Number(value) > 0;
        return (
          /* Stepped down from the original sizes — label 11→9px, figure
             30→20px, hint 12→10px, back when six cards had to share one `xl`
             row where four did before; the longer labels ("Yuva Seva Rate")
             and the widest figures were running up against the card edges.
             `tracking-wider` is what keeps a 9px uppercase label readable at
             that size; drop the tracking and it turns into a smear.
             There are eight cards now, laid out 4 × 2 from `lg` up rather than
             eight across — at eight per row the labels truncate again and the
             row reads as a strip of digits instead of eight distinct figures. */
          <div key={card.key} className="overflow-hidden rounded-card border border-line-soft bg-surface">
            <div className={`${card.headerClass ?? 'bg-primary'} px-3 py-2.5 text-center`}>
              <p className="truncate text-[9px] font-bold uppercase tracking-wider text-white">{card.label}</p>
            </div>
            <div className="px-3 py-4 text-center">
              {/* UNGROUPED, deliberately: 1000, not 1,000.
                  `formatNumber` is Intl 'en-IN', so it groups the Indian way —
                  1,000 and then 1,00,000 — and it is NOT used here for that
                  reason. It stays in use for the Weekly Trend and Sabha Report
                  tables below, where columns of grouped figures are easier to
                  compare down the column; these are single headline numbers
                  read one at a time, where the separator is just noise. */}
              {drillable ? (
                /* A real <button>, not a click handler on the <p>. The figure
                   opens a dialog, which is a keyboard-reachable action — and
                   the underline is what tells a reader it is one at all, since
                   the number otherwise looks identical to the five beside it
                   that do nothing. */
                <button
                  type="button"
                  onClick={() => onDrill(card)}
                  title={`Show the ${value ?? 0} members behind ${card.label}`}
                  className={`tnum font-display text-[20px] font-bold leading-none underline decoration-dotted underline-offset-4 transition-transform hover:scale-110 ${card.valueClass ?? 'text-primary'}`}
                >
                  {value ?? 0}{card.suffix ?? ''}
                </button>
              ) : (
                <p className={`tnum font-display text-[20px] font-bold leading-none ${card.valueClass ?? 'text-primary'}`}>
                  {value ?? 0}{card.suffix ?? ''}
                </p>
              )}
              <p className="mt-1.5 text-[10px] text-text-muted">{card.hint}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Weekly Trend ───────────────────────────────────────────────────────────

/**
 * `{ weekly_trends: [ { year, months: [ { month, weeks: [...] } ] } ] }`
 * flattened to a list of weeks, oldest first, with the month kept for the
 * table's group headings.
 */
function readWeeks(data) {
  const out = [];
  for (const year of data?.weekly_trends ?? []) {
    for (const month of year.months ?? []) {
      for (const week of month.weeks ?? []) {
        out.push({
          month: `${month.month} ${year.year}`,
          weekDate: week.week_date,
          present: week.present_count ?? 0,
          presentPct: week.present_percentage,
          absent: week.absent_count ?? 0,
          absentPct: week.absent_percentage,
          average4w: week['4w_present_average_count'] ?? 0,
          average4wPct: week['4w_present_average_percentage'],
          reach4w: week.grt_1_in_4_week_count ?? 0,
          reach4wPct: week.grt_1_in_4_week_percentage,
        });
      }
    }
  }
  return out;
}

function WeeklyTrend({ query, filters, filterValue, onFilter, memberCount }) {
  const weeks = useMemo(() => readWeeks(query.data), [query.data]);
  // Everything the tooltip shows travels with the point — including Absent,
  // which is not plotted but is asked about the moment Present is read.
  //
  // OLDEST WEEK ON THE LEFT, most recent on the right — a left-to-right
  // timeline. The API returns weeks newest-first, so the chart reverses them;
  // the table below keeps the API's newest-first order.
  const points = [...weeks].reverse().map((w) => ({
    label: shortDate(w.weekDate),
    weekLabel: w.weekDate,
    month: w.month,
    present: w.present,
    presentPct: w.presentPct,
    absent: w.absent,
    absentPct: w.absentPct,
    average4w: w.average4w,
    average4wPct: w.average4wPct,
    reach4w: w.reach4w,
    reach4wPct: w.reach4wPct,
  }));

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.error) {
    return (
      <div className="card">
        <ErrorState error={query.error} onRetry={query.refetch} title="Could not load the weekly trend" />
      </div>
    );
  }

  // Month headings in the table, in the order the weeks arrived.
  const months = [];
  for (const w of weeks) if (!months.includes(w.month)) months.push(w.month);

  return (
    <div className="space-y-4">
      <ReportFilterBar
        filters={filters}
        value={filterValue}
        onChange={onFilter}
        busy={query.isFetching && !query.isLoading}
        yearAllLabel="Current year"
      />

      <div className="card space-y-1">
        <h2 className="section-title">Weekly attendance — all Sabhas in your scope</h2>
        <p className="text-sm text-text-muted">
          {memberCount != null ? `${formatNumber(memberCount)} members · ` : ''}completed weeks only
        </p>
        <TrendChart points={points} monthLabel={months.length === 1 ? months[0] : null} />
      </div>

      {weeks.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                {['Week', 'Present', 'Absent', '4-wk Avg Present', 'Monthly Once'].map((h, i) => (
                  <th
                    key={h}
                    className={`table-th px-5 py-3.5 ${i === 0 ? '' : '!text-right'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <FragmentGroup key={month} month={month} rows={weeks.filter((w) => w.month === month)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** One month: a heading row, then its weeks. */
function FragmentGroup({ month, rows }) {
  return (
    <>
      <tr className="bg-bg/70">
        <td colSpan={5} className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          {month}
        </td>
      </tr>
      {rows.map((w) => (
        <tr key={w.weekDate} className="border-t border-line-soft">
          <td className="whitespace-nowrap px-5 py-3.5 text-sm font-semibold text-primary">{longDate(w.weekDate)}</td>
          <NumberCell value={w.present} percentage={w.presentPct} />
          <NumberCell value={w.absent} percentage={w.absentPct} />
          <NumberCell value={w.average4w} percentage={w.average4wPct} />
          <NumberCell value={w.reach4w} percentage={w.reach4wPct} />
        </tr>
      ))}
    </>
  );
}

/** A count with its share beside it — the share is the API's, never computed. */
function NumberCell({ value, percentage }) {
  return (
    <td className="whitespace-nowrap px-5 py-3.5 text-right">
      <span className="tnum text-sm font-bold text-primary">{formatNumber(value)}</span>
      {percentage != null && <span className="tnum ml-2 text-xs text-text-muted">{pct(percentage)}</span>}
    </td>
  );
}

// ── Sabha Report ───────────────────────────────────────────────────────────
//
// One endpoint, two shapes, and the answer changes with what is asked (see
// reportService.weeklySabhaReportList):
//
//   level 1  no params   one row per Sabha, week COUNTS
//   level 2  sabha_id     that Sabha's follow-up persons, EACH with their
//                         members nested under `members` (Y/N per week)
//   level 3  sabha_id + followup_user_id   one person's members, flat — still
//                         served for the API contract, but the screen no longer
//                         needs it: the members already arrive nested at level 2.
//
// A follow-up person's row is a SUMMARY OF THEIR MEMBERS — "16 members", and how
// many of those 16 came in each week — not that person's own attendance. Those
// four numbers are the point of the collapsed row: they are what the reader
// scans down the column to find who to chase, WITHOUT opening anybody.
//
// SO THE WHOLE TREE ARRIVES IN ONE REQUEST PER OPEN SABHA. The members are
// nested in the level-2 answer, so the collapsed counts are on screen the
// instant a Sabha opens, with no per-person fetch behind them. This replaced an
// earlier design that fired level 3 for every person the moment a Sabha opened —
// N identical `?sabha_id=` calls — which the nesting made unnecessary. The
// absent-only filter reads the same nested members to hide a person whose people
// all came.
//
// Everything below the top level is therefore counted here, from rows the API
// sent. Nothing is estimated, and the Sabha row's own counts are the API's.

/** How a week column is sorted when nothing has been clicked: newest, biggest first. */
const DEFAULT_DIR = 'desc';

/**
 * The scope's name for FILENAMES AND CAPTIONS only — the Mandal, or a plain
 * fallback so a download is never called "-.png".
 *
 * Not for the screen: the heading above the table prints `mandal_name` itself,
 * and prints nothing when the response carries none. A line reading "Sabha
 * Report" over a table on the Sabha Report tab says nothing twice.
 */
const scopeName = (payload) => payload?.mandal_name || 'Sabha Report';

/**
 * A sortable column heading.
 *
 * The arrow shows only on the active column: an arrow on every heading is noise,
 * and a greyed-out one reads as disabled.
 */
function SortHeader({ label, colKey, sort, onSort, align = 'right' }) {
  const active = sort.key === colKey;
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`table-th px-4 py-3 ${align === 'left' ? '' : '!text-right'}`}>
      <button
        type="button"
        onClick={() => onSort(colKey)}
        aria-label={`Sort by ${label}`}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-primary ${
          align === 'left' ? '' : 'flex-row-reverse'
        } ${active ? 'text-primary' : ''}`}
      >
        {label}
        {active && <Arrow className="h-3 w-3 shrink-0" />}
      </button>
    </th>
  );
}

/**
 * A signed figure: green above zero, red below, grey at nothing.
 *
 * `null` is not zero and is drawn as "—". A row the API sent no `change` for has
 * not reported a flat week; it has reported nothing, and "0" would be this
 * screen inventing the one number it is not allowed to invent.
 *
 * `size` because the same figure appears on two row heights — a Sabha's and a
 * follow-up person's — and they must line up in one column.
 */
function ChangeCell({ value, suffix = '', size = 'sabha' }) {
  const scale = size === 'sabha' ? 'px-4 py-3 text-sm' : 'px-4 py-2.5 text-xs';

  if (value == null) {
    return <td className={`whitespace-nowrap text-right text-text-faint ${scale}`}>—</td>;
  }

  const n = Number(value);
  const tone = n > 0 ? 'text-success-fg' : n < 0 ? 'text-danger-fg' : 'text-text-muted';
  return (
    <td className={`tnum whitespace-nowrap text-right font-semibold ${scale} ${tone}`}>
      {n > 0 ? '+' : ''}{formatNumber(n)}{suffix}
    </td>
  );
}

/** The round expand / collapse control on a Sabha or follow-up row. */
function ExpandButton({ open, onClick, label, size = 'sabha' }) {
  const Icon = open ? Minus : Plus;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-full border transition-colors ${
        open
          ? 'border-primary bg-primary text-white'
          : 'border-line-strong bg-surface text-primary hover:bg-primary-50'
      } ${size === 'sabha' ? 'h-6 w-6' : 'h-5 w-5'}`}
    >
      <Icon className={size === 'sabha' ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
    </button>
  );
}

/** One member's week: P present, A absent. The API sends Y/N. */
function AttendanceMark({ present }) {
  return (
    <span className={`text-xs font-bold ${present ? 'text-success-fg' : 'text-danger-fg'}`}>
      {present ? 'P' : 'A'}
    </span>
  );
}

/**
 * A small WhatsApp action on a follow-up person's row — the mark plus a one-word
 * label ("Absent" / "Full"). WhatsApp green so it is known on sight, and quiet
 * enough not to crowd the name it sits beside.
 */
function WhatsAppReportButton({ label, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex items-center gap-1 rounded-full border border-[#25D366] px-2 py-0.5 text-[11px] font-semibold text-[#128C7E] transition-colors hover:bg-[#25D366]/10"
    >
      <WhatsAppIcon className="h-3 w-3" />
      {label}
    </button>
  );
}

/**
 * Level 2 (and 3) for one open Sabha: its follow-up persons, each with their
 * members underneath.
 *
 * ONE request per open Sabha. The `sabha_id` call returns each follow-up person
 * WITH their members nested under `members`, so the whole tree — the collapsed
 * counts, and the member rows an expander reveals — comes from that single
 * answer. It used to be one request per person on top of this one (the counts
 * had to be on screen before anyone clicked), which turned opening a busy Sabha
 * into a dozen identical `?sabha_id=` calls; nesting the members server-side
 * removed every one of them. The query lives here rather than in the parent so
 * that closing a Sabha stops asking, and React Query caches each Sabha
 * separately, making a reopen free.
 */
function FollowupRows({ params, sabha, columns, latestWeek, absentOnly, colSpan }) {
  const toast = useToast();
  const meQ = useMe();
  // The signed-in manager signs the reports they send. Built defensively from
  // whichever name fields /me carries; a neutral fallback lives in the util.
  const senderName = useMemo(() => {
    const me = meQ.data;
    if (!me) return '';
    return (me.user_name || [me.first_name, me.last_name].filter(Boolean).join(' ') || me.name || '').trim();
  }, [meQ.data]);
  const [open, setOpen] = useState(() => new Set());

  const peopleQ = useWeeklySabhaReport({ ...params, sabha_id: sabha.sabhaId }, true);
  const people = useMemo(
    () => (peopleQ.data?.data?.[0]?.users ?? []).map(readPersonRow).filter(Boolean),
    [peopleQ.data]
  );

  // Members ride along inside each person, so the map is built from the SAME
  // response — no second fetch. Keyed by person id, in the shape the rows below
  // already expect ({ loading, error, rows }); the data is here, so loading is
  // always false. A person with nobody under them gets an empty list.
  const membersByUser = useMemo(() => {
    const byUser = {};
    for (const raw of peopleQ.data?.data?.[0]?.users ?? []) {
      const uid = raw?.user_id;
      if (uid == null) continue;
      byUser[uid] = {
        loading: false,
        error: null,
        rows: Array.isArray(raw.members) ? raw.members : [],
      };
    }
    return byUser;
  }, [peopleQ.data]);

  const toggle = (userId) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });

  // Hand a head their week's report on WhatsApp, ready to send. `members` is the
  // FULL roster (not the absent-only view) — the message does its own grouping.
  const sendWhatsApp = (person, members, kind) => {
    const meta = { sabhaName: sabha.name, columns, senderName };
    const message = kind === 'absent'
      ? buildAbsentMessage(person, members, meta)
      : buildFullMessage(person, members, meta);
    const hadNumber = openSabhaWhatsApp(person.whatsapp || person.mobile, message);
    if (!hadNumber) {
      toast.info(`No number on file for ${person.name} — pick the contact in WhatsApp.`);
    }
  };

  if (peopleQ.isLoading) {
    return (
      <tr className="border-t border-line-soft bg-bg/40">
        <td colSpan={colSpan} className="px-6 py-3">
          <Skeleton className="h-3 w-56" />
        </td>
      </tr>
    );
  }
  if (peopleQ.error) {
    return (
      <tr className="border-t border-line-soft">
        <td colSpan={colSpan} className="px-6 py-3 text-sm text-danger-fg">
          Could not load this Sabha&apos;s follow-up persons.
        </td>
      </tr>
    );
  }
  if (!people.length) {
    return (
      <tr className="border-t border-line-soft bg-bg/40">
        <td colSpan={colSpan} className="px-6 py-3 text-sm text-text-muted">
          No follow-up persons in this Sabha.
        </td>
      </tr>
    );
  }

  return people.flatMap((person) => {
    const state = membersByUser[person.userId] ?? { loading: true };
    const all = (state.rows ?? []).map(readPersonRow).filter(Boolean);
    const shown = absentOnly ? absentInWeek(all, latestWeek) : all;
    const expanded = open.has(person.userId);

    // Absent-only hides a person whose members were all present — the point of
    // the filter is the list of people still to chase. Not while their members
    // are still loading, though: that would hide rows that are about to matter.
    if (absentOnly && state.rows && !shown.length) return [];

    const rows = [
      <tr key={person.userId} className="border-t border-line-soft bg-bg/40">
        <td className="py-2.5 pl-6 pr-2 align-middle">
          {person.userId != null && (
            <ExpandButton
              size="followup"
              open={expanded}
              onClick={() => toggle(person.userId)}
              label={expanded ? `Collapse ${person.name}` : `Expand ${person.name} to see their members`}
            />
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-sm text-primary">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{person.name}</span>
            {/* Hand this head their week's report on WhatsApp, ready to send.
                Two flavours: the absentee nudge, and the full roster. Shown
                only once the members are in — nothing to send without them. */}
            {all.length > 0 && (
              <span className="flex items-center gap-1">
                <WhatsAppReportButton
                  label="Absent"
                  title={`WhatsApp ${person.name} — absentees to follow up`}
                  onClick={() => sendWhatsApp(person, all, 'absent')}
                />
                <WhatsAppReportButton
                  label="Full"
                  title={`WhatsApp ${person.name} — full weekly report`}
                  onClick={() => sendWhatsApp(person, all, 'full')}
                />
              </span>
            )}
          </div>
        </td>
        {/* The person's own week-over-week change, in the Sabha rows' Change
            column — the API sends one per follow-up person. This cell used to
            not exist: the name spanned two columns and swallowed it. */}
        <ChangeCell value={person.change} size="followup" />
        {/* The member count sits under % Change — the column a person's row has
            no percentage for. With the filter on it reads
            "4 members / 16": how many are being shown, out of how many they
            carry. The count keeps its noun, so the pair cannot be misread as a
            present/total score like the member rows below carry. */}
        <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-text-muted">
          {state.loading ? '…' : state.error ? '!' : memberCountLabel(shown.length, all.length, absentOnly)}
        </td>
        {columns.map((week) => (
          <td
            key={week}
            className="tnum whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold text-primary"
            title={state.loading ? 'Loading' : `Present members: ${presentCount(shown, week)} of ${shown.length}`}
          >
            {state.loading ? '…' : state.error ? '!' : presentCount(shown, week)}
          </td>
        ))}
      </tr>,
    ];

    if (!expanded) return rows;

    if (state.loading) {
      rows.push(
        <tr key={`${person.userId}-loading`} className="border-t border-line-soft">
          <td colSpan={colSpan} className="px-6 py-2 pl-16">
            <Skeleton className="h-3 w-48" />
          </td>
        </tr>
      );
    } else if (state.error) {
      rows.push(
        <tr key={`${person.userId}-error`} className="border-t border-line-soft">
          <td colSpan={colSpan} className="px-6 py-2 pl-16 text-sm text-danger-fg">{state.error}</td>
        </tr>
      );
    } else if (!shown.length) {
      rows.push(
        <tr key={`${person.userId}-empty`} className="border-t border-line-soft">
          <td colSpan={colSpan} className="px-6 py-2 pl-16 text-sm text-text-muted">
            {absentOnly
              ? `Every member of ${person.name} was present on ${latestWeek || 'the latest week'}.`
              : `No members assigned to ${person.name}.`}
          </td>
        </tr>
      );
    } else {
      for (const member of shown) {
        rows.push(
          <tr key={`${person.userId}-${member.userId}`} className="border-t border-line-soft">
            <td />
            <td className="whitespace-nowrap py-2 pl-12 pr-4 text-sm text-primary">
              {member.name}
            </td>
            <td className="tnum whitespace-nowrap px-4 py-2 text-right text-xs text-text-muted" colSpan={2}>
              {member.present}/{member.total || columns.length}
            </td>
            {columns.map((week) => (
              <td key={week} className="whitespace-nowrap px-4 py-2 text-center">
                <AttendanceMark present={isPresent(member, week)} />
              </td>
            ))}
          </tr>
        );
      }
    }

    return rows;
  });
}

/** One Sabha: its own row, and its follow-up persons when it is open. */
function SabhaRows({ params, row, columns, latestWeek, absentOnly, colSpan, open, onToggle }) {
  return (
    <>
      <tr className="border-t border-line-soft">
        <td className="py-3 pl-4 pr-2 align-middle">
          {/* Only a real Sabha id can be drilled into — the endpoint needs one,
              so a row without it stays plain text. */}
          {row.sabhaId != null && (
            <ExpandButton
              open={open}
              onClick={onToggle}
              label={open ? `Collapse ${row.name}` : `Expand ${row.name} to see follow-up persons`}
            />
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-primary">{row.name}</td>
        <ChangeCell value={row.change} />
        <ChangeCell value={row.changePct} suffix="%" />
        {columns.map((week) => (
          <td key={week} className="tnum whitespace-nowrap px-4 py-3 text-right text-sm text-primary">
            {row.weeks[week] != null ? formatNumber(row.weeks[week]) : '—'}
          </td>
        ))}
      </tr>
      {open && (
        <FollowupRows
          params={params}
          sabha={row}
          columns={columns}
          latestWeek={latestWeek}
          absentOnly={absentOnly}
          colSpan={colSpan}
        />
      )}
    </>
  );
}

function SabhaReport({ query, params, filters, filterValue, onFilter, canDownload }) {
  const toast = useToast();
  const download = useReportDownload();
  /** The element the picture is taken of — the table and its heading. */
  const captureRef = useRef(null);
  /** Which of the three toolbar actions is running: null | 'excel' | 'png' | 'whatsapp'. */
  const [running, setRunning] = useState(null);
  const [absentOnly, setAbsentOnly] = useState(false);
  const [openSabhas, setOpenSabhas] = useState(() => new Set());
  const [sort, setSort] = useState({ key: null, dir: DEFAULT_DIR });

  const payload = query.data;
  const rows = useMemo(
    () => (Array.isArray(payload?.data) ? payload.data.map(readSabhaRow).filter(Boolean) : []),
    [payload]
  );
  const totals = useMemo(() => readSabhaRow(payload?.totals), [payload]);
  const columns = useMemo(() => weekColumns([...rows, totals].filter(Boolean)), [rows, totals]);

  /** The week the absent-only filter asks about, and the default sort column. */
  const latestWeek = columns[0];
  const sortKey = sort.key ?? latestWeek ?? 'name';

  const sorted = useMemo(() => {
    const valueOf = (row) => {
      if (sortKey === 'name') return row.name;
      if (sortKey === 'change') return row.change;
      if (sortKey === 'pct') return row.changePct;
      return row.weeks[sortKey] ?? 0;
    };
    const compare = sortKey === 'name'
      ? (a, b) => String(valueOf(a)).localeCompare(String(valueOf(b)), undefined, { sensitivity: 'base' })
      : (a, b) => Number(valueOf(a)) - Number(valueOf(b));
    return [...rows].sort((a, b) => (sort.dir === 'asc' ? compare(a, b) : compare(b, a)));
  }, [rows, sortKey, sort.dir]);

  const onSort = (key) =>
    setSort((prev) => {
      const current = prev.key ?? latestWeek ?? 'name';
      if (current === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      // A new column starts in the direction that answers the obvious question:
      // names A-Z, numbers biggest first.
      return { key, dir: key === 'name' ? 'asc' : DEFAULT_DIR };
    });

  const toggleSabha = (sabhaId) =>
    setOpenSabhas((prev) => {
      const next = new Set(prev);
      if (next.has(sabhaId)) next.delete(sabhaId); else next.add(sabhaId);
      return next;
    });

  const scope = scopeName(payload);
  const busy = running !== null || rows.length === 0;

  /**
   * Excel comes from the SERVER, built off the SAME queries this screen reads —
   * so the file IS this report, not a different one. Two sheets: "Summary" is
   * the visible table (a row per Sabha, the four weeks, Change / % Change, and
   * the Total row), and "Details" is the drill-down every Sabha expands into
   * (its follow-up persons, then each member with a P / A per week).
   *
   * It covers the caller's whole scope at its default sort, so it ignores the
   * absent-only toggle and which rows happen to be expanded — those only change
   * what is READ on screen; the file always carries the full tree. The picture
   * button below is the one that captures the screen exactly as it stands.
   */
  const exportExcel = async () => {
    setRunning('excel');
    try {
      await download.mutateAsync({
        path: '/api/v1/weekly-sabha-report/export',
        params,
        filename: `sabha-report-${scope}.xlsx`,
      });
      toast.success('Excel downloaded.');
    } catch (err) {
      toast.error(err?.message || 'Excel download failed.');
    } finally {
      setRunning(null);
    }
  };

  const saveImage = async () => {
    setRunning('png');
    try {
      const result = await saveReportImage({ element: captureRef.current, scope });
      if (!result.ok) {
        if (result.reason !== 'cancelled') toast.error(result.reason);
      } else if (result.mode === 'share') {
        toast.info('Share sheet opened — choose "Save to Photos" or "Save image" to keep it.');
      } else {
        toast.success('Image saved.');
      }
    } finally {
      setRunning(null);
    }
  };

  const shareWhatsApp = async () => {
    setRunning('whatsapp');
    try {
      const result = await shareReportOnWhatsApp({ element: captureRef.current, scope });
      if (!result.ok) {
        if (result.reason !== 'cancelled') toast.error(result.reason);
      } else if (result.mode === 'clipboard') {
        toast.info('Image copied — pick a chat in WhatsApp Web and press Ctrl+V.');
      } else if (result.mode === 'fallback') {
        toast.info('WhatsApp Web opened — attach the image that was just downloaded.');
      }
    } finally {
      setRunning(null);
    }
  };

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.error) {
    return (
      <div className="card">
        <ErrorState error={query.error} onRetry={query.refetch} title="Could not load the Sabha report" />
      </div>
    );
  }

  const filterBar = (
    <ReportFilterBar
      filters={filters}
      value={filterValue}
      onChange={onFilter}
      busy={query.isFetching && !query.isLoading}
      // The endpoint takes no `year` — it always reports the last four completed
      // weeks — so offering one would be a control that changes nothing.
      showYear={false}
    />
  );

  if (!rows.length) {
    return (
      <div className="space-y-4">
        {filterBar}
        <div className="card">
          <p className="py-6 text-sm text-text-muted">No Sabha figures for the last four weeks.</p>
        </div>
      </div>
    );
  }

  // expander + Sabha + Change + % Change + one per week.
  const colSpan = 4 + columns.length;

  return (
    <div className="space-y-4">
      {filterBar}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setAbsentOnly((v) => !v)}
          disabled={running !== null}
          aria-pressed={absentOnly}
          aria-label={absentOnly ? 'Showing absent members only — click to show all' : 'Show only members absent in the latest week'}
          title={
            absentOnly
              ? `Absent-only is on (week of ${latestWeek || '—'}). Click to show everyone.`
              : `Show only members absent on ${latestWeek || 'the latest week'}`
          }
          className={`inline-flex items-center justify-center rounded-full border p-2.5 transition-colors disabled:opacity-50 ${
            absentOnly
              ? 'border-danger-fg bg-danger-fg text-white'
              : 'border-line-strong bg-surface text-primary hover:bg-primary-50'
          }`}
        >
          <ListFilter className="h-5 w-5" />
        </button>

        {canDownload && (
          <ToolbarButton
            onClick={exportExcel}
            busy={running === 'excel'}
            disabled={busy}
            label="Download as Excel (.xlsx)"
            icon={FileSpreadsheet}
          />
        )}
        <ToolbarButton
          onClick={saveImage}
          busy={running === 'png'}
          disabled={busy}
          label="Save the report as an image (PNG)"
          icon={ImageDown}
        />
        <ToolbarButton
          onClick={shareWhatsApp}
          busy={running === 'whatsapp'}
          disabled={busy}
          label="Share the report on WhatsApp"
          icon={WhatsAppIcon}
          accent
        />
      </div>

      {absentOnly && (
        <p className="text-right text-xs font-semibold text-danger-fg">
          Showing only members absent on {latestWeek || 'the latest week'} — the counts on each
          follow-up row count those members only.
        </p>
      )}

      <div
        ref={captureRef}
        className={`card overflow-x-auto p-0 transition-opacity ${
          query.isFetching && !query.isLoading ? 'opacity-60' : ''
        }`}
      >
        {payload?.mandal_name && (
          <p className="px-4 pt-4 text-[11px] font-bold uppercase tracking-wider text-text-muted">
            {payload.mandal_name}
          </p>
        )}
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr>
              <th className="table-th w-8 px-2 py-3">
                <span className="sr-only">Expand</span>
              </th>
              <SortHeader label="Sabha" colKey="name" sort={{ key: sortKey, dir: sort.dir }} onSort={onSort} align="left" />
              <SortHeader label="Change" colKey="change" sort={{ key: sortKey, dir: sort.dir }} onSort={onSort} />
              <SortHeader label="% Change" colKey="pct" sort={{ key: sortKey, dir: sort.dir }} onSort={onSort} />
              {columns.map((week) => (
                <SortHeader
                  key={week}
                  label={weekLabel(week)}
                  colKey={week}
                  sort={{ key: sortKey, dir: sort.dir }}
                  onSort={onSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <SabhaRows
                key={row.sabhaId ?? row.name}
                params={params}
                row={row}
                columns={columns}
                latestWeek={latestWeek}
                absentOnly={absentOnly}
                colSpan={colSpan}
                open={openSabhas.has(row.sabhaId)}
                onToggle={() => toggleSabha(row.sabhaId)}
              />
            ))}

            {/* The API's own totals row. `change_percentage` cannot be summed
                from the rows, so nothing here is added up locally. */}
            {totals && (
              <tr className="border-t-2 border-line bg-bg/60">
                <td />
                <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-primary">Total</td>
                <ChangeCell value={totals.change} />
                <ChangeCell value={totals.changePct} suffix="%" />
                {columns.map((week) => (
                  <td key={week} className="tnum whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-primary">
                    {totals.weeks[week] != null ? formatNumber(totals.weeks[week]) : '—'}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A round icon button in the report toolbar. */
function ToolbarButton({ onClick, busy, disabled, label, icon: Icon, accent = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={busy ? 'Preparing…' : label}
      className={`inline-flex items-center justify-center rounded-full border p-2.5 transition-colors disabled:opacity-50 ${
        accent
          ? 'border-accent bg-accent text-white hover:bg-accent-hover'
          : 'border-line-strong bg-surface text-primary hover:bg-primary-50'
      }`}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
    </button>
  );
}

/** WhatsApp's mark. Lucide has no brand icons, and this button has to be known on sight. */
function WhatsAppIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.52 3.48A11.9 11.9 0 0 0 12.05 0C5.5 0 .17 5.34.17 11.89c0 2.1.55 4.15 1.6 5.96L0 24l6.34-1.66a11.9 11.9 0 0 0 5.7 1.45h.01c6.55 0 11.87-5.34 11.87-11.89 0-3.18-1.24-6.17-3.4-8.42zM12.05 21.4h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.76.99 1-3.67-.24-.38a9.87 9.87 0 0 1-1.51-5.26c0-5.45 4.43-9.88 9.88-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.9 6.99c0 5.45-4.43 9.9-9.85 9.9zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15s-.77.97-.94 1.17c-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37s-1.04 1.02-1.04 2.48 1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z" />
    </svg>
  );
}

// ── Download Report ────────────────────────────────────────────────────────

/**
 * THE CARDS ARE THE API'S OWN KEYS, in the order it returns them — not a list
 * kept here. `/reports-export-filter` says which exports exist, which controls
 * each one takes, what is in them, and where each download goes, so a report
 * added or moved server-side appears here without a frontend change.
 *
 * Only the human wording is local (`cardFor`), and only the Special Sabha card
 * is declared outright — that one is picked by sitting rather than by period,
 * which is why the endpoint deliberately does not describe it.
 */
function DownloadReports() {
  const filtersQ = useReportExportFilters(true);
  // The Members export is the one card here that answers to USERS:READ rather
  // than REPORTS:DOWNLOAD (the gate on the tab itself). Hide it when the caller
  // lacks that grant, so we never offer a download that would 403.
  const { can } = usePermissions();
  const canExportMembers = can(MODULES.USERS, ACTIONS.READ);

  // The tab is only reachable with REPORTS:DOWNLOAD, which is the same gate the
  // endpoint applies — so an error here is a real failure, not a permission
  // case, and is worth showing rather than swallowing.
  const blocks = useMemo(() => Object.entries(filtersQ.data ?? {}), [filtersQ.data]);

  /**
   * PRADESH / MANDAL / SABHA ARE CHOSEN ONCE, FOR THE WHOLE TAB.
   *
   * Every export takes the same trio and the endpoint returns the same three
   * lists in every block, so repeating them on all six cards was the same
   * choice asked six times — and left the reader free to pick one Sabha here
   * and a different one two cards down. Keyed by query parameter, and each card
   * takes only the ones ITS block declares (see `hierarchyParams`).
   */
  const [scope, setScope] = useState({});

  // Built from the first block that carries them — they are identical across
  // reports, so any block answers the question of what this role may pick.
  const hierarchy = useMemo(
    () => hierarchyControlsFrom(blocks.find(([, b]) => hierarchyControlsFrom(b).length)?.[1]),
    [blocks]
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Each report downloads as an Excel (.xlsx) file, scoped to your hierarchy.
        Every filter below lists only the values that have records behind them.
      </p>

      {filtersQ.error && (
        <div className="card">
          <ErrorState
            error={filtersQ.error}
            onRetry={filtersQ.refetch}
            title="Could not load the report filters"
          />
        </div>
      )}

      {/* The shared bar. Rendered only when this role has any of the three to
          choose from — a Sabha Head is fixed to their own Sabha and gets none,
          and an empty row of nothing is worse than no row.

          NO CASCADE between them, deliberately: the endpoint takes no
          parameters and so returns flat lists with no parent ids to filter a
          child list by. Picking a Mandal outside the chosen Pradesh is possible
          and the export answers it the same way it answers any other
          combination — with that Mandal's rows. */}
      {hierarchy.length > 0 && (
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-3">
          {hierarchy.map((control) => (
            <Select
              key={control.name}
              aria-label={control.label}
              title={control.label}
              value={scope[control.name] ?? ''}
              onChange={(e) => setScope((s) => ({ ...s, [control.name]: e.target.value }))}
              options={control.options}
              placeholder={null}
              className="w-full sm:w-44"
            />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {filtersQ.isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56 w-full" />)
          : blocks.map(([key, block]) => (
            <DownloadCard
              key={key}
              card={cardFor(key)}
              exportUrl={block?.export_url}
              // The whole block, not a prebuilt control list: `month` is nested
              // under `year`, so the controls depend on the card's OWN year
              // selection and have to be derived inside it.
              block={block}
              scopeParams={hierarchyParams(block, scope)}
            />
          ))}
        {/* Always offered: it needs no filter block, so it does not wait on the
            request above and does not disappear if that request fails. The
            shared trio still applies — /sabha-report/export takes all three. */}
        <DownloadCard
          card={SPECIAL_SABHA_CARD}
          exportUrl={SPECIAL_SABHA_CARD.exportUrl}
          // No block: this card has no period dimensions, only its own search.
          scopeParams={scope}
          picksSpecialSabha
        />
        {/* Members profile export — no block and no card-level controls, just
            the shared Pradesh/Mandal/Sabha bar. /users/export takes all three,
            so the same `scope` object drives it. Shown only with USERS:READ. */}
        {canExportMembers && (
          <DownloadCard
            card={MEMBERS_EXPORT_CARD}
            exportUrl={MEMBERS_EXPORT_CARD.exportUrl}
            scopeParams={scope}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One export.
 *
 * `controls` and `exportUrl` both come from this report's block on
 * /reports-export-filter, so the card draws whatever that export accepts and
 * posts back to the URL the endpoint named. `card` is wording only.
 *
 * `scopeParams` is the tab-wide Pradesh / Mandal / Sabha choice, already
 * narrowed to the ones this export accepts — the card just merges it in.
 */
function DownloadCard({
  card, exportUrl, block, scopeParams = {}, picksSpecialSabha = false,
}) {
  const toast = useToast();
  const download = useReportDownload();
  // Keyed by QUERY PARAMETER (`pradesh_id`, not `pradesh`) so the selections are
  // already in the shape the export takes.
  //
  // HOLDS ONLY WHAT WAS TOUCHED. Anything absent falls back to the control's
  // own `defaultValue`, rather than being seeded into state on mount — so a
  // control whose options change (a refetch, a new year appearing) picks up its
  // new default instead of holding a value that is no longer offered.
  const [values, setValues] = useState({});

  /**
   * Rebuilt on every selection, because `month` is nested under `year`: pick a
   * different year and that year's month list is what comes back.
   */
  const controls = useMemo(() => controlsFrom(block, { selected: values }), [block, values]);

  /**
   * A selection is only honoured while it is STILL ON OFFER.
   *
   * This is what keeps the year and month controls in step. 2026 holds January
   * to August and 2025 holds July to December, so a reader who picks March
   * under 2026 and then switches to 2025 is holding a month that year does not
   * have — and the export would be sent `month=3` for a year with no March on
   * record. Falling back to the control's own default drops them onto a real
   * month instead, and the same rule protects every other control against a
   * refetch that removes what was chosen.
   */
  const valueOf = (control) => {
    const chosen = values[control.name];
    if (chosen !== undefined && control.options.some((o) => o.value === chosen)) return chosen;
    return control.defaultValue ?? '';
  };
  /** Only the Special Sabha card: the sitting whose attendees are wanted. */
  const [sabhaDetailId, setSabhaDetailId] = useState('');

  /**
   * Every special Sabha — `?type=special` and nothing else.
   *
   * No `status` and no `attendance`: a report is asked for AFTER a Sabha has
   * happened, and both of those filters would hide exactly the Sabhas anyone
   * wants a report on. Fetched only by the card that needs it.
   */
  const specialQ = useSabhaDetails({ type: 'special' }, picksSpecialSabha);
  const specialOptions = useMemo(
    () =>
      pickRows(specialQ.data)
        .filter((row) => row?.id != null)
        .map((row) => ({
          value: String(row.id),
          label: row.special_sabha_name || row.sabha_name || `#${row.id}`,
          // The date disambiguates two sittings with the same name, and is what
          // someone searching by memory usually reaches for.
          meta: row.date ?? '',
        })),
    [specialQ.data]
  );

  const run = async () => {
    if (!exportUrl) return;
    // THE SELECTED VALUES GO STRAIGHT TO THE EXPORT, under the parameter names
    // the block's keys were mapped to. An empty selection is dropped entirely,
    // so "Current year" sends no `year` at all and the export applies its own
    // default. Only the controls this card actually drew can contribute, so a
    // stale value cannot survive the endpoint dropping a filter.
    const params = {};
    // The shared trio first, then this card's own dimensions. Empty means "not
    // chosen" and is dropped on both sides, so an untouched bar sends nothing.
    for (const [name, value] of Object.entries(scopeParams)) {
      if (value !== undefined && value !== '') params[name] = value;
    }
    for (const control of controls) {
      // `valueOf`, not `values[…]` — an untouched control still sends the
      // default it is showing, so the file always matches what is on screen.
      const value = valueOf(control);
      if (value !== '') params[control.name] = value;
    }
    if (picksSpecialSabha) {
      if (!sabhaDetailId) return;
      params.sabha_detail_id = sabhaDetailId;
    }
    try {
      await download.mutateAsync({
        path: exportUrl,
        params,
        // Stamped with the filters, so a folder of these is still readable.
        filename: `${card.filename}${Object.values(params).length ? ` - ${Object.values(params).join(' ')}` : ''}.xlsx`,
      });
      toast.success(`${card.title} downloaded.`);
    } catch (err) {
      toast.error(err?.message);
    }
  };

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-primary-50 text-primary">
          <FileBarChart className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-primary">{card.title}</h3>
          <p className="mt-0.5 text-sm text-text-muted">{card.description}</p>
        </div>
      </div>

      {picksSpecialSabha ? (
        <div className="space-y-1.5">
          {/* No caption — the placeholder below already reads "Search Special
              Sabha name…", which said it twice. */}
          <Combobox
            value={sabhaDetailId}
            onChange={setSabhaDetailId}
            options={specialOptions}
            disabled={specialQ.isLoading || Boolean(specialQ.error)}
            placeholder={
              specialQ.isLoading
                ? 'Loading…'
                : specialQ.error
                  ? 'Special Sabha list unavailable'
                  : 'Search Special Sabha name…'
            }
            searchPlaceholder="Search by name or date…"
            emptyLabel="No Special Sabha matches that search."
          />
        </div>
      ) : null}

      {/* Nothing at all when this export has no dimension of its own — the
          Special Sabha card has only its search, and an empty row would still
          cost the card a gap's worth of blank space. */}
      {controls.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          {/* No captions, and no "Current year" / "Default range" row either:
              each list opens on a real value (2026, Monthly) and downloads
              exactly that. `placeholder={null}` is what keeps Select from
              adding an empty first row back — with no such row in `options`,
              an auto-inserted one would be a blank that sends no parameter.
              `control.label` is the accessible name, since the visible text is
              now a bare year or month.

              Year / month / range ONLY. Pradesh / Mandal / Sabha are chosen once
              in the bar above the grid, since every export takes the same three
              and asking per card asked the same question six times. */}
          {controls.map((control) => (
            <Select
              key={control.name}
              aria-label={control.label}
              title={control.label}
              value={valueOf(control)}
              onChange={(e) => setValues((v) => ({ ...v, [control.name]: e.target.value }))}
              options={control.options}
              placeholder={null}
              className="w-40"
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Says why the button is inert, rather than leaving a dead control. */}
        {picksSpecialSabha && !sabhaDetailId ? (
          <p className="text-sm font-semibold text-accent">Search and select a Special Sabha.</p>
        ) : <span />}
        <Button
          variant="accent"
          onClick={run}
          busy={download.isPending}
          // No `export_url` means the filter request has not landed (or failed),
          // and there is nowhere to send the download yet.
          disabled={!exportUrl || (picksSpecialSabha && !sabhaDetailId)}
        >
          <Download className="h-4 w-4" />
          Download Excel
        </Button>
      </div>
    </div>
  );
}