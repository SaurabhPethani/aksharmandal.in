import { Activity, ArrowDown, ArrowUp, Cake, CalendarCheck, ClipboardCheck, UserCog, Users } from 'lucide-react';
import { usePermissions, useTodayBirthdays, usePresentAbsent } from '../../hooks';
import { MODULES } from '../../constants/permissions';
import { readWeekDate } from '../../utils/dates';
import { formatNumber } from '../../utils/format';
import OverviewStat, { TileAction } from './OverviewStat';
import AttendanceTrendCard from './AttendanceTrendCard';

// The "Yuvak Dashboard" tab — the hierarchy figures, for everyone the caller can
// see. DashboardPage tabs between this and ./MyDashboard (the `self` block).
//
// ⚠ IT DOES NOT FETCH. The `overall` block is passed in by DashboardPage, which
// makes the ONE /dashboard-overview request both tabs are drawn from. Fetching
// here would ask for the same payload twice and let the two tabs disagree about
// what "now" is.
//
// /report-overview IS GONE FROM THIS SCREEN. That endpoint belongs to Reports;
// the dashboard reads /dashboard-overview, which the backend forked from it so
// the two can change independently. See services/dashboardService.js.
//
// THE ONE ENDPOINT THIS FILE STILL ASKS FOR ITSELF:
//   /users/today-birthdays   none   the Follow-up Birthdays tile. Ungated, and
//                                   the list is counted rather than a count
//                                   read, so tile and page always agree. My
//                                   Dashboard reads the SAME query for its own
//                                   Birthdays Today tile — one cache entry,
//                                   whichever tab is opened first.
//
// Upcoming Events moved to ./MyDashboard. It is the one card here that was about
// what the READER is going to do rather than about the hierarchy they oversee,
// and /events went with it — this tab no longer asks for it at all.
//
// EVERY NUMBER IS THE API'S OWN. Nothing here sums, derives or estimates —
// percentages included.

/**
 * The headline row, read out of `data.overall`.
 *
 * The keys ARE the tile names: `total_users`, `absent_yuvak`, `most_regular`,
 * `monthly_once`, `untouched_yuvak`. That is the backend's doing —
 * /dashboard-overview names its fields after what the dashboard calls them, so a
 * tile and its field can no longer drift apart the way `atleast_1_in_4_weeks` /
 * "Monthly Once" had.
 *
 * `read` pulls the tile's value out of the block; `sub` builds its context line
 * from the same block, so the two can never describe different fields. `sub` is
 * still written per tile rather than generated: only three of these five carry a
 * percentage at all — the other two are plain integers, and a share worked out
 * here would be a fraction of a base nobody chose.
 */
const pct = (part) => (part?.percentage == null ? null : `${Number(part.percentage).toFixed(0)}%`);

/**
 * A coloured Present | Absent pair — "752 | 732", present green, absent red — as
 * a value element OverviewStat renders as-is. `null` when either half is missing,
 * so the tile falls back to its em dash rather than drawing "— | —". Used by both
 * the last-completed-week (P | A) tile and the Live Attendance tile.
 */
const coloredPA = (present, absent) =>
  present == null || absent == null ? null : (
    <span>
      <span className="text-success-fg">{formatNumber(present)}</span>
      <span className="px-1 text-text-faint">|</span>
      <span className="text-danger-fg">{formatNumber(absent)}</span>
    </span>
  );

/**
 * Same as coloredPA, plus a week-to-date up/down badge beside PRESENT only —
 * "598 ↑20 | 675". `presentDelta` is this week's present-so-far minus last
 * week's present at the same weekday/time; green up = ahead of last week, red
 * down = behind. No badge when the delta is zero or absent. Absent carries no
 * arrow — the comparison is deliberately Present-only.
 */
const coloredPAWithDelta = (present, absent, presentDelta) =>
  present == null || absent == null ? null : (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-success-fg">{formatNumber(present)}</span>
      {presentDelta ? (
        <span
          className={`inline-flex items-center text-xs font-semibold ${
            presentDelta > 0 ? 'text-success-fg' : 'text-danger-fg'
          }`}
        >
          {presentDelta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {formatNumber(Math.abs(presentDelta))}
        </span>
      ) : null}
      <span className="px-1 text-text-faint">|</span>
      <span className="text-danger-fg">{formatNumber(absent)}</span>
    </span>
  );

/**
 * A neutral "a | b" pair for two related counts that are not good/bad — the
 * merged Monthly Once | Most Regular tile. The two halves line up left-to-right
 * with the two halves of the label.
 */
const neutralPair = (a, b) =>
  a == null || b == null ? null : (
    <span>
      {formatNumber(a)}
      <span className="px-1 text-text-faint">|</span>
      {formatNumber(b)}
    </span>
  );

/**
 * A count with its week-on-week change as an up/down arrow badge — "1,484 ↑3",
 * green up / red down. The badge is dropped when the change is zero or the
 * previous figure is unknown, so the tile just shows the number then.
 */
const withDelta = (now, last) => {
  if (now == null) return null;
  const delta = last == null ? null : now - last;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>{formatNumber(now)}</span>
      {delta ? (
        <span
          className={`inline-flex items-center text-sm font-semibold ${
            delta > 0 ? 'text-success-fg' : 'text-danger-fg'
          }`}
        >
          {delta > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          {formatNumber(Math.abs(delta))}
        </span>
      ) : null}
    </span>
  );
};

/**
 * The Monday–Sunday span of a week, as "31-Aug to 6-Sep" (D-MMM, dash form).
 *
 * `weekDate` is the week's Monday in the API's DD-MM-YYYY form (see
 * readWeekDate). The Sunday is Monday + 6 days, formatted by round-tripping
 * through readWeekDate so both ends read the same way. For the live current
 * week the span is still in progress, so it ends at "today" rather than a
 * future Sunday — `{ live: true }` prints "7-Sep to today".
 */
function weekRange(weekDate, { live = false } = {}) {
  const wk = readWeekDate(weekDate); // { key: "2026-08-31", label: "31 Aug" }
  if (!wk) return null;
  const mon = wk.label.replace(' ', '-'); // "31-Aug"
  if (live) return `${mon} to today`;
  const [y, mo, d] = wk.key.split('-').map(Number);
  const sun = new Date(Date.UTC(y, mo - 1, d + 6)); // Date rolls month/year over
  const pad = (n) => String(n).padStart(2, '0');
  const sunLabel = readWeekDate(
    `${pad(sun.getUTCDate())}-${pad(sun.getUTCMonth() + 1)}-${sun.getUTCFullYear()}`
  )?.label?.replace(' ', '-');
  return sunLabel ? `${mon} to ${sunLabel}` : mon;
}

const TILES = [
  {
    key: 'total_users',
    label: 'Total Users',
    icon: Users,
    iconClass: 'bg-primary-50 text-primary',
    /**
     * `total_users` on /dashboard-overview is the ACTIVE member base
     * (`status = true`) — the same figure this tile has always shown, under the
     * name the dashboard actually uses for it.
     *
     * Not to be confused with the Reports endpoint's `total_users`, which counts
     * every row in scope including deactivated ones and reads higher than the
     * number of members anyone would say the Sabha has. The dashboard endpoint
     * does not send that figure at all.
     */
    // The count with its week-on-week change beside it — "1,484 ↑3", the arrow
    // (green up / red down) standing in for +/-. The gap to last week is who
    // joined this week.
    read: (d) => withDelta(d?.total_users?.number, d?.total_users_last_week),
    // The absolute last-week base beneath the count + arrow — "last week 1,482".
    sub: (d) =>
      d?.total_users_last_week != null ? `last week ${formatNumber(d.total_users_last_week)}` : null,
  },
  {
    /**
     * PRESENT / ABSENT — the last COMPLETED week's turnout as ONE figure,
     * `present_count / absent_count` read off the tail of
     * `attendance_last_4_week` (ordered oldest → newest, so the last entry is the
     * latest completed week; the in-progress week is excluded server-side).
     * Present is green, absent red — the two halves of the same week read at a
     * glance, where the old single "Absent User" tile left the reader to guess
     * the turnout the shortfall was measured against.
     *
     * Like every tile in this block it moves with the pradesh/mandal/sabha
     * filters. The value is a COLOURED RATIO ELEMENT, not a number, which
     * OverviewStat renders as-is (see its `value` note) — the same trick My
     * Dashboard uses for "20 / 30".
     *
     * DISTINCT FROM the Live Attendance tile beside it: that one is the IN-PROGRESS
     * week (roster-view); this tile is the last COMPLETED week's headline over the
     * active base. The sub line names the week so the two are never read as the
     * same figure.
     */
    key: 'present_absent',
    label: 'Last week',
    icon: ClipboardCheck,
    iconClass: 'bg-primary-50 text-primary',
    read: (d) => {
      const w = d?.attendance_last_4_week?.at(-1);
      return w ? coloredPA(w.present_count, w.absent_count) : null;
    },
    // The completed Monday–Sunday span the figures cover, e.g. "Week 31-Aug to 6-Sep".
    sub: (d) => {
      const w = d?.attendance_last_4_week?.at(-1);
      const r = w && weekRange(w.week_date);
      return r ? `Week ${r}` : null;
    },
  },
  {
    /**
     * LIVE ATTENDANCE — this week's Present | Absent, read from
     * /dashboard/present-absent (its `current_week` block), which the grid passes
     * in as the `live` source rather than the /dashboard-overview `data` every
     * other tile uses (that is what `source: 'live'` selects). Present green,
     * absent red.
     *
     * Distinct from the P | A tile beside it: that one is the last COMPLETED week
     * over the active base; this is the IN-PROGRESS week on the roster-view
     * definition (present anywhere / absent = roster - present) and moves as
     * attendance is taken through the week.
     */
    key: 'live_attendance',
    source: 'live',
    label: 'This week',
    icon: Activity,
    iconClass: 'bg-primary-50 text-primary',
    // Present carries a week-to-date up/down vs the same point last week; Absent
    // is plain (comparison is Present-only, per the spec).
    read: (live) => coloredPAWithDelta(live?.present, live?.absent, live?.present_delta),
    // The in-progress week, Monday to today, e.g. "Week 7-Sep to today".
    sub: (live) => {
      const r = live?.week_date && weekRange(live.week_date, { live: true });
      return r ? `Week ${r}` : null;
    },
  },
  {
    /**
     * MONTHLY ONCE | MOST REGULAR — the two engagement figures merged into one
     * tile: `monthly_once` (present in ≥1 of the last 4 completed weeks) on the
     * left, `most_regular` (present in ALL 4) on the right. The label's two halves
     * line up with the value's, so "1132 | 470" reads without needing colour.
     * Both are counted over the same 4 completed weeks against the active base.
     */
    key: 'monthly_regular',
    label: 'Monthly Once | Most Regular',
    wrapLabel: true,
    icon: CalendarCheck,
    iconClass: 'bg-success-bg text-success-fg',
    read: (d) => neutralPair(d?.monthly_once?.number, d?.most_regular?.number),
    sub: (d) => (pct(d?.monthly_once) ? `${pct(d.monthly_once)} attend monthly` : null),
  },
  // The Reports screen's other attendance-window figures — todays_attendance,
  // active_in_12_weeks, last_sabha — are deliberately NOT tiles here, and
  // /dashboard-overview does not send them. That is the split working as
  // intended: a question about attendance windows is pursued on Reports, and
  // putting all of them here made nine tiles of one row and buried the figures
  // the dashboard is opened for.
  {
    key: 'untouched_yuvak',
    label: 'Untouched User',
    icon: UserCog,
    iconClass: 'bg-accent/10 text-accent',
    read: (d) => d?.untouched_yuvak,
    // Shown only where the tile does NOT link — see `action` below.
    sub: () => 'Need attention',
    tone: 'attention',
    // The one overview tile with a screen behind it: Yuva Seva IS the follow-up
    // worklist, so the count and the people it counts are one click apart. Named
    // as a MODULE rather than as '/yuva-seva' — see moduleLink below.
    linkTo: MODULES.YUVA_SEVA,
    action: 'Follow up',
  },
];

/**
 * THE FOLLOW-UP BIRTHDAY TILE — this tab's one figure from outside the overview
 * payload, and the only birthday count left here.
 *
 * WHAT COUNTS AS A FOLLOW-UP DEPENDS ON THE CALLER'S RANK, so this tile can't
 * just read `followup.length` — that field is the strict personal set. The
 * rank-based rule the backend applies is:
 *
 *   Yuva Seva (20)              personal follow-ups only
 *   Sabha Head / DB Mgr (30/40) personal + everyone in the same Sabha
 *   Mandal Head / DB Mgr (50/60) personal + everyone in the same Mandal
 *   Pradesh / SuperAdmin        same as Mandal
 *
 * Every row from `/users/today-birthdays` carries a `contact` flag decided by
 * the backend with the exact rank rule above — the caller may Call / WhatsApp
 * this row. That is the same set the tile is meant to count, so the count
 * comes from `users.filter(u => u.contact).length` rather than from a separate
 * response field. Same source of truth as the Birthdays page's Call+WA
 * visibility, which is what keeps the tile and the page in step when the rule
 * changes.
 *
 * Its context line is the act rather than a sentence about the figure — "Send
 * wishes" is the only thing anyone does with a birthday count.
 */
const BIRTHDAY_PATH = '/birthdays';

export default function AdminDashboard({ data, loading = false }) {
  const { byName } = usePermissions();

  /**
   * Where a tile's module actually lives, for this caller.
   *
   * Read from full-context rather than hard-coded, for two reasons: the API's
   * own `route` wins over the registry's default path, so a backend that moves
   * a screen moves the tile's link with it; and a caller granted nothing on the
   * module gets `null` back, which leaves the tile a plain figure instead of a
   * link into a 403.
   */
  const moduleLink = (name) => {
    const mod = byName?.[name];
    return mod?.visible && mod.path ? mod.path : null;
  };

  // Ungated — /users/today-birthdays needs no grant at all, so this is the one
  // thing on this tab that is not behind a permission.
  const birthdays = useTodayBirthdays();

  // The Live Attendance tile reads this week's Present | Absent from
  // /dashboard/present-absent — a different endpoint to the rest of this block,
  // whose `current_week` block carries the live figures. Every other tile is
  // read from the /dashboard-overview `data` prop.
  const presentAbsent = usePresentAbsent();
  const live = presentAbsent.data?.current_week;
  const liveLoading = presentAbsent.isLoading;

  // The greeting, the QR rail and the two-column layout live in DashboardPage
  // now: they belong to the PAGE, not to this tab, and duplicating them here
  // would draw them twice the moment the reader switched to My Dashboard.
  return (
    <div className="space-y-6">
      {/*
        SIX TILES, THREE ACROSS, TWO ROWS:

          Total Users        P | A (last week)   Live Attendance   turnout now & then
          Monthly | Regular  Untouched User      Follow-up B'days  engagement & follow-up

        Two attendance tiles sit together on the top row — the last completed
        week's P | A and this week's live P | A — so "how did last week go" and
        "how is this week going" read side by side. Six divides by both 3 and 2,
        so nothing spans at either width.
      */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TILES.map((t) => {
          const to = t.linkTo ? moduleLink(t.linkTo) : null;
          // A `source: 'live'` tile reads the present-absent payload and its own
          // loading flag; every other tile reads the /dashboard-overview `data`.
          const src = t.source === 'live' ? live : data;
          const tileLoading = t.source === 'live' ? liveLoading : loading;
          return (
            <OverviewStat
              key={t.key}
              className={t.span ?? ''}
              label={t.label}
              wrapLabel={t.wrapLabel}
              icon={t.icon}
              iconClass={t.iconClass}
              value={t.read(src)}
              // The act replaces the sentence only where the tile really links
              // somewhere: underlined text that does nothing is worse than the
              // line it replaced.
              sub={to && t.action ? <TileAction>{t.action}</TileAction> : t.sub(src)}
              tone={t.tone}
              to={to}
              loading={tileLoading}
            />
          );
        })}

        {/* A count from a different endpoint to everything above, and a
            whole-tile link like Untouched Yuvak — both carry an act on their
            context line, so both behave the same way when you click one.

            Birthdays Today used to sit beside this one and is now on My
            Dashboard. See the note above BIRTHDAY_PATH. */}
        <OverviewStat
          label="Follow-up Birthdays"
          icon={Cake}
          /* The theme's warning pair, not the two raw hexes this used to carry.
             Every other chip on both tabs is a token pair (primary-50/primary,
             success, danger, accent), and one tile written in hex is a tile that
             stops following the palette the first time the palette moves. */
          iconClass="bg-warning-bg text-warning-fg"
          value={birthdays.error ? null : birthdays.users.filter((u) => u?.contact).length}
          sub={<TileAction>Send wishes</TileAction>}
          tone="attention"
          to={BIRTHDAY_PATH}
          loading={birthdays.isLoading}
        />
      </div>

      {/* Both windows ride on the response the tiles above are read from, so the
          4/12-week switch inside this card costs no request. */}
      <AttendanceTrendCard
        last4={data?.attendance_last_4_week}
        last12={data?.attendance_last_12_week}
        loading={loading}
      />
    </div>
  );
}
