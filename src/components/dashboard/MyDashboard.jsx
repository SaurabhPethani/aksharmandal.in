import { useMemo } from 'react';
import {
  CalendarCheck, CalendarClock, CalendarDays, CheckCircle2, Gift, Hourglass, PieChart,
  TrendingUp, XCircle,
} from 'lucide-react';
import { usePermissions, useTodayBirthdays, useMe } from '../../hooks';
import { useEvents } from '../../hooks/useEvents';
import { formatNumber } from '../../utils/format';
import { Skeleton } from '../ui';
import OverviewStat, { TileAction } from './OverviewStat';
import UpcomingEvents from './UpcomingEvents';
import MySpiritualFriends from './MySpiritualFriends';
import TodaysThought from './TodaysThought';
import TrendChart from '../charts/TrendChart';
import { readClock, readWeekDate, readDate } from '../../utils/dates';

// The "My Dashboard" tab — /dashboard-overview's `self` block, which is about
// the signed-in member and nobody else.
//
// ⚠ THE FIGURES ARE NOT FETCHED HERE. DashboardPage makes the one
// /dashboard-overview request both tabs are drawn from and passes the block
// down, so the two tabs can never report two different moments.
//
// TWO THINGS THIS FILE ASKS FOR ITSELF. The rest is the `self` block.
//
//   /users/today-birthdays   none   the Birthdays Today tile — everyone in the
//                                   member's Mandal celebrating today. Moved
//                                   here from the Yuvak tab, which keeps the
//                                   follow-up count; the two lists overlap (one
//                                   is a subset of the other) and never sum, so
//                                   they read better a tab apart than side by
//                                   side inviting the addition. Same query key
//                                   as that tab's, so whichever is opened first
//                                   pays for both.
//
// UPCOMING EVENTS IS THE OTHER — /events, gated on
// EVENTS:READ. It sat on the Yuvak Dashboard until now, which is the tab about
// the hierarchy the reader oversees; an event is something the reader personally
// turns up to, so it belongs beside their own attendance. Moving the card moved
// the request with it: /events is issued when THIS tab is open and not before,
// since DashboardPage renders only the active one.
//
// NOTHING IN THE FIGURES IS AN AGGREGATE, and nothing in them moves when the
// scope filters move — the API sends this block unchanged whatever Pradesh /
// Mandal / Sabha the `overall` half is narrowed to. That is the whole point of
// the split: there is no other member's data in it to protect. The events list
// is the exception that proves it, which is why it carries a grant.

/**
 * "20 / 30" — the part over the whole, as one figure.
 *
 * Attendance is read as a ratio ("I have made 20 of 30"), and two tiles showing
 * 20 and 30 separately make the reader do the division. The denominator is
 * carried at a smaller weight so the tile still has ONE number in it.
 */
function Ratio({ part, whole }) {
  return (
    <span>
      {part ?? '—'}
      {/* One step under the numerator, which is itself one step down from what
          it was — see OverviewStat. The denominator has to read as subordinate
          to the figure, not as a second figure. */}
      <span className="text-sm font-semibold text-text-faint"> / {whole ?? '—'}</span>
    </span>
  );
}

/**
 * "2y 3m" — the tenure, from `sabha_age`, in years and months only.
 *
 * DAYS ARE DROPPED. On a tile that summarises a multi-year tenure, the
 * days part reads as false precision — "14y 10m 8d" invites the reader
 * to check whether the eight days are right, when the point of the tile
 * is the years. A tenure under a month is the only case where the day
 * count carries information, and that lands on the "This month" /
 * "Today" fallbacks rather than "0y 0m 5d".
 *
 * Parts that are zero are DROPPED rather than printed: "0y 3m" reads
 * as one fact, and "0y" in front of it does not add one. The API's
 * three parts are one duration split for display — never add them
 * together, and never read `days` as a day of the month.
 */
function formatSabhaAge(age) {
  if (!age) return null;
  const parts = [
    age.year ? `${age.year}y` : null,
    age.month ? `${age.month}m` : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(' ');
  // Sub-month tenure. `days` still says whether it is truly today or a
  // handful of days in — "Today" for a member who joined this week would
  // be wrong.
  if (age.days && age.days > 0) return 'This month';
  return 'Today';
}

/**
 * The personal 8-week line, from `self.last_8w`.
 *
 * A BOOLEAN ON A 0-100 AXIS. TrendChart plots percentages against a fixed
 * 0-100 scale, so an attended week is 100 and a missed one 0 — the line sits at
 * the top or the bottom and the shape of a member's habit is the whole point of
 * the chart. The number itself is never shown: `pointLabel` stamps "P" or "A"
 * on each mark, and `formatSeriesValue` reports "Present" / "Absent" in the
 * tooltip and the table — the reader never sees "100.0%" for what is really a
 * categorical yes/no.
 *
 * EIGHT ROWS, ALWAYS. The API sends a row per calendar week whether or not the
 * Sabha met, so the x-axis is evenly spaced and a quiet spell reads as a run of
 * zeroes rather than as a shorter history.
 */
// `label: 'Sabha'` pairs with `formatSeriesValue` returning Present/Absent, so
// the tooltip and the table header read "Sabha: Present" rather than the
// tautological "Attended: Present" the percentage label would produce.
const SELF_SERIES = [{ key: 'present', label: 'Sabha', color: '#3389C9' }];

function MyAttendanceCard({ weeks, loading }) {
  const points = useMemo(
    () =>
      (Array.isArray(weeks) ? weeks : []).map((w) => {
        // `week_date` is DD-MM-YYYY on this endpoint — see readWeekDate.
        const read = readWeekDate(w?.week_date);
        return {
          label: read?.label ?? String(w?.week_date ?? '—'),
          sortKey: read?.key ?? w?.week_date,
          present: w?.attended ? 100 : 0,
          attended: Boolean(w?.attended),
        };
      }),
    // The API already orders these oldest → newest, which is the direction a
    // line chart is read in, so there is nothing to sort here.
    [weeks],
  );

  return (
    <div className="panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
            <TrendingUp className="h-4 w-4" />
          </span>
          <h3 className="panel-title">My Last 8 Weeks</h3>
        </div>
      </div>

      <TrendChart
        points={points}
        series={SELF_SERIES}
        loading={loading}
        height={220}
        // "P" on top-line points, "A" on bottom-line points — the mark's
        // position and its letter both carry the same fact, so a reader who
        // does not look up at the axis still reads the row correctly.
        pointLabel={(p) => (p.attended ? 'P' : 'A')}
        // Tooltip and table both read "Present" / "Absent" instead of the
        // "100.0%" / "0.0%" the axis encodes.
        formatSeriesValue={(p) => (p.attended ? 'Present' : 'Absent')}
        // The percentage axis is furniture here — the P / A on each point
        // already tells the reader everything the position encodes.
        hideYAxis
      />
    </div>
  );
}

/**
 * THE YEAR AS ONE RING — `self.last_52w`, present against absent.
 *
 * A donut because the job is PART-TO-WHOLE and there are exactly two parts: 52
 * weeks is 52 Sabhas (the API fixes the denominator rather than counting the
 * weeks its register happens to hold), and every one of them is either attended
 * or missed. One ring with the total in the middle says "these are the halves of
 * that" in a single shape; two bars would put each against its own empty track
 * and lose the reading the card exists for.
 *
 * ⚠ IT WILL NOT MATCH `total_sabha_present` ON THE TILES ABOVE. That figure is
 * lifetime and follows the member across every Sabha they have belonged to;
 * this is one fixed year at their current one.
 *
 * ⚠ THE KEYS ARE `present` / `absent`, not the `attended` / `not_attended` the
 * other blocks use. The API names this block differently — read it, don't infer
 * it by analogy.
 *
 * ── THE SHAPE, AND WHY IT IS THIS ONE ───────────────────────────────────────
 *
 * Modelled on matplotlib's `pie_and_donut_labels` example: the names sit OUTSIDE
 * the ring, each on its own leader line back to the wedge it belongs to.
 *
 * That is what finally made this card quiet. Earlier versions kept adding
 * devices to prop up a colour pair that could not carry the reading — a legend
 * table ruled for a dozen rows holding two, then labels floating at computed
 * angles, then a hatched arc over the top. Four mechanisms saying one thing.
 *
 * A LEADER LINE SAYS IT ONCE. Position ties the word to its wedge, which is a
 * stronger tie than a legend's colour-matching and needs no second look.
 *
 * THE COLOUR WAS THE OTHER HALF OF THE FIX. `danger-fg` (#B91C1C) against
 * `success-fg` (#15803D) is ΔE 4.2 under deuteranopia — two arcs a red-green
 * reader cannot tell apart, which is what the hatch was there to rescue. A
 * LIGHTER red, #E9878A, measures ΔE 13.4 against the same green: comfortably
 * over the ΔE 8 floor, because the pair now differs in LIGHTNESS as well as in
 * hue, and lightness is the channel colour blindness leaves alone. The soft red
 * also stops a bad year rendering as a slab of saturated crimson — the loudest
 * thing on the tab, for the member least in need of being shouted at.
 *
 * ⚠ THE LIGHT RED IS 2.47:1 ON WHITE, under the 3:1 mark. That is allowed only
 * with relief, and the relief is the labels: each carries its own count in text,
 * so no quantity is knowable only by looking at the ring. Keep them.
 *
 * ONE PERCENTAGE ON THE CARD, in the middle, and it is the share MISSED. The
 * labels carry names and counts only. Two shares — one in the centre and one per
 * label — would be three numbers on a chart holding two facts.
 */
/**
 * The drawing. The viewBox is much wider than the ring because the labels sit
 * OUTSIDE it on leader lines — the box has to hold ring, elbows and words, or
 * the text clips at the card's edge.
 */
// Wide enough for the LONGEST label the data can produce — "Present 100" at
// full padding — with a few pixels to spare on each side. Checked, not guessed:
// 180 ± (95 + 96) = -11 … 371, so the box is 392 rather than the 360 the current
// figures happen to need.
const VB_W = 404;
const VB_H = 214;
const CX = 202;
const CY = 104;
const RING_STROKE = 30;
const RING_RADIUS = 62;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
/** The tutorial's white divider, as a gap in the stroke rather than a border. */
const RING_GAP = 3;
/**
 * THE RING IS TURNED SO THE LABELS DO NOT HAVE TO BE.
 *
 * Every earlier version placed each label at its wedge's midpoint angle, which
 * put the words wherever the data happened to point — and with one segment near
 * 100% the two midpoints land at twelve and six o'clock, so both leaders had to
 * climb over the ring to reach a box at the side. That is what made the last one
 * look like a diagram of something else.
 *
 * Rotating the ring solves it outright. Start the first segment at
 *
 *     start = 270° − (present share × 180°)
 *
 * and the two midpoints land on NINE and THREE O'CLOCK for any split at all —
 * 50/50, 1/51, all-or-nothing. The arithmetic is one line: present's midpoint is
 * `start + share×180`, which is 270° by construction, and absent's is half a
 * turn on from it because the two shares sum to one.
 *
 * So the leader is a short horizontal tick out of the ring's own side, the boxes
 * sit level with the middle of the ring, and nothing crosses anything. Where the
 * count "starts" on the dial is not a fact about the data — it is a free choice,
 * and this is what it buys.
 */
const LEADER_START = RING_RADIUS + RING_STROKE / 2;
/** How far out the tick ends — the label box begins exactly here. */
const LABEL_X = LEADER_START + 18;

/**
 * The label box — matplotlib's `bbox` on the annotation, in SVG.
 *
 * SVG cannot measure text before it is drawn, so the box is sized from the
 * string: 6.2px per character at 10px semibold, generous rather than exact.
 *
 * THE TEXT IS CENTRED IN THE BOX, which is what makes an approximate width
 * safe — a box a few pixels too wide carries a little more padding on each
 * side, evenly. Anchoring to an edge would spend the whole error on one side.
 *
 * ⚠ EVERY <text> IN THIS CHART SIZES ITSELF WITH THE SVG `fontSize` ATTRIBUTE,
 * NOT A TAILWIND `text-[Npx]` CLASS, and it has to stay that way. The dashboard
 * renders inside `.content-type`, which bumps each arbitrary text size by 1pt
 * (`.content-type .text-\[10px\] { font-size: 11.33px }` — see index.css). That
 * rule is right for prose and wrong for a drawing: it grew the label text 13%
 * while these box widths, computed in the SVG's own user units, stayed put, so
 * the words burst out of their boxes. An attribute is not a class, so no rule
 * matches it and 10 means 10.
 */
const BOX_PAD_X = 13;
const BOX_H = 30;
const BOX_RX = 8;
/** 7.0 per character at 12px semibold — generous against a real ~6.6. */
const boxWidth = (text) => Math.round(text.length * 7) + BOX_PAD_X * 2;

const PRESENT_COLOUR = '#15803D'; // success-fg
/** A lighter danger — see the ⚠ above before changing it back to #B91C1C. */
const ABSENT_COLOUR = '#E9878A';

function YearDonut({ year, loading }) {
  const total = Number(year?.total) || 0;
  const present = Number(year?.present) || 0;
  const absent = Number(year?.absent) || 0;

  // Drawn from the ARC LENGTHS rather than from percentages the API did not
  // send, and taken over `total` rather than over present+absent: if the two
  // ever fail to sum to the year, the ring shows the shortfall as unfilled track
  // instead of quietly rescaling itself to hide it.
  const arcFor = (n) => (total > 0 ? (n / total) * RING_LENGTH : 0);
  const presentArc = arcFor(present);
  const absentArc = arcFor(absent);

  /**
   * THE DIVIDER ONLY EXISTS WHERE THERE IS SOMETHING TO DIVIDE.
   *
   * The gap is taken off each arc's own length, which is right when both are
   * drawn and wrong when only one is: a member with no attendance at all got a
   * full red ring with a white nick cut out of it at twelve o'clock, reading as
   * a sliver of some third thing rather than as an unbroken year of absence.
   *
   * So it applies only when BOTH segments have length. A whole year on one side
   * draws as one closed ring.
   */
  const gap = presentArc > 0 && absentArc > 0 ? RING_GAP : 0;

  /**
   * WHERE THE RING STARTS — the one free choice on a donut, spent here on
   * putting both wedge midpoints on the horizontal.
   *
   * Degrees clockwise from twelve o'clock. See the note by LABEL_X for why this
   * lands present at nine o'clock and absent at three, whatever the split.
   */
  const startDeg = 270 - (total > 0 ? present / total : 0) * 180;

  /**
   * A label's leader and box. Both sit on the ring's own middle line, so the
   * leader is a horizontal tick out of the side rather than a path around the
   * shape — nothing to cross, and no diagonal for the eye to follow.
   *
   * A zero-length arc keeps its label and its tick: "Present 0" is a fact about
   * the year, and the reader should not have to infer it from a missing word.
   * The tick then points at the seam where that wedge would have begun, which is
   * exactly where the rotation has put it.
   */
  const labelAt = (text, right) => {
    const w = boxWidth(text);
    const endX = CX + (right ? LABEL_X : -LABEL_X);
    return {
      // Out of the ring's edge, straight across, stopping AT the box rather than
      // running under it — so the tick reads as touching its label.
      points: [
        [CX + (right ? LEADER_START : -LEADER_START), CY],
        [endX, CY],
      ],
      box: { x: right ? endX : endX - w, y: CY - BOX_H / 2, w },
      // Centred in the box, horizontally and on its middle line. `+3.5` is the
      // baseline offset for 10px text — SVG positions text on its baseline, not
      // on its centre, so a bare `y` would sit the words a third of a line high.
      textX: (right ? endX : endX - w) + w / 2,
      textY: CY + 4.2,
    };
  };

  const segments = [
    {
      key: 'present',
      label: 'Present',
      count: present,
      colour: PRESENT_COLOUR,
      // Left, always — and the rotation above is what puts the green wedge's
      // middle right beside it.
      ...labelAt(`Present ${formatNumber(present)}`, false),
    },
    {
      key: 'absent',
      label: 'Absent',
      count: absent,
      colour: ABSENT_COLOUR,
      // Right, always.
      ...labelAt(`Absent ${formatNumber(absent)}`, true),
    },
  ];

  // THE CENTRE IS THE MISS RATE, not the size of the year. "52 Sabhas" restated
  // the card's own title; the share missed is the one figure here a member would
  // actually repeat to somebody, and it is the number the ring is a picture of.
  const missed = total > 0 ? `${Math.round((absent / total) * 100)}%` : '—';

  return (
    <div className="panel">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
          <PieChart className="h-4 w-4" />
        </span>
        <h3 className="panel-title">My Last 52 Weeks</h3>
      </div>

      {loading ? (
        <div className="flex justify-center py-2">
          {/* Written out rather than interpolated — Tailwind scans this file as
              text, and a class it cannot see as a literal is never generated. */}
          <Skeleton className="h-[154px] w-[154px] rounded-full" />
        </div>
      ) : !year ? (
        <p className="py-10 text-center text-sm text-text-muted">
          No attendance recorded in the last year.
        </p>
      ) : (
        // ONE FIGURE. Ring, leaders and labels are a single drawing that scales
        // with the card, so there is no legend row to lay out underneath and
        // nothing to re-flow on a phone.
        <div className="flex justify-center">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="h-auto w-full max-w-[404px]"
            role="img"
            aria-label={
              `Last 52 weeks: ${present} present and ${absent} absent of ${total} Sabhas.`
            }
          >
            {/* THE ARCS ARE ROTATED, THE WORDS ARE NOT. Rotating the whole svg
                would stand every label on its side, so only this group turns.

                `-90` because an SVG dash pattern starts at three o'clock, and
                `startDeg` on top of it is the turn that lands the two wedge
                midpoints on the horizontal — see the note by LABEL_X. */}
            <g transform={`rotate(${startDeg - 90} ${CX} ${CY})`}>
              {/* The unfilled track, under both arcs. Visible only where present
                  and absent together fall short of the year — the honest way to
                  draw a gap in the record. */}
              <circle
                cx={CX} cy={CY} r={RING_RADIUS}
                fill="none" stroke="rgba(0,49,88,0.06)" strokeWidth={RING_STROKE}
              />
              <circle
                cx={CX} cy={CY} r={RING_RADIUS}
                fill="none"
                stroke={PRESENT_COLOUR}
                strokeWidth={RING_STROKE}
                strokeLinecap="butt"
                // The gap comes off the arc's own length, so the second segment
                // still starts where the running total says it does.
                strokeDasharray={`${Math.max(0, presentArc - gap)} ${RING_LENGTH}`}
              />
              <circle
                cx={CX} cy={CY} r={RING_RADIUS}
                fill="none"
                stroke={ABSENT_COLOUR}
                strokeWidth={RING_STROKE}
                strokeLinecap="butt"
                strokeDasharray={`${Math.max(0, absentArc - gap)} ${RING_LENGTH}`}
                strokeDashoffset={-presentArc}
              />
            </g>

            {/* The centre: how much of the year was missed.

                Sized to sit INSIDE the hole rather than to fill it — "100%" is
                the widest this can read, and at 30px it pressed against the
                ring on both sides. The figure is still the largest text on the
                card; it does not also have to be the biggest thing in it. */}
            <text
              x={CX}
              y={CY + 1}
              textAnchor="middle"
              fontSize="15"
              className="tnum fill-[#003158] font-display font-bold"
            >
              {missed}
            </text>
            <text
              x={CX}
              y={CY + 17}
              textAnchor="middle"
              fontSize="9"
              className="fill-[#9BB5CB] font-semibold uppercase tracking-wider"
            >
              Missed
            </text>

            {/*
              THE LABELS, OUTSIDE THE RING ON THEIR OWN LEADERS.

              Name and count, and deliberately NO percentage: the only share
              worth stating is in the middle of the ring, and repeating a second
              one out here would put three numbers on a chart with two facts in
              it. The leader is what ties the words to their wedge — position,
              not colour, which is also what keeps this readable for someone who
              cannot separate the two hues.

              TEXT WEARS INK, NOT THE SERIES COLOUR. The line carries identity;
              the words stay in the page's own text tokens.
            */}
            {segments.map((seg) => (
              <g key={seg.key}>
                <polyline
                  points={seg.points.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="none"
                  stroke={seg.colour}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* The bbox from the reference example. Its border is the
                    segment's own colour at a low opacity — enough to tie box to
                    wedge without turning two labels into two coloured chips
                    competing with the ring they describe. */}
                <rect
                  x={seg.box.x}
                  y={seg.box.y}
                  width={seg.box.w}
                  height={BOX_H}
                  rx={BOX_RX}
                  fill="#FFFFFF"
                  stroke={seg.colour}
                  strokeOpacity="0.45"
                  strokeWidth="1"
                />
                <text
                  x={seg.textX}
                  y={seg.textY}
                  // `middle`, always. It used to read `seg.align`, which the
                  // leader rewrite stopped returning — so it fell through to
                  // SVG's default of `start` and every label ran out of the
                  // right-hand side of its own box.
                  textAnchor="middle"
                  fontSize="12"
                  className="fill-[#5C7A96] font-semibold"
                >
                  {seg.label}
                  <tspan className="tnum fill-[#003158] font-bold"> {formatNumber(seg.count)}</tspan>
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

export default function MyDashboard({ data, loading = false }) {
  const { userId } = usePermissions();
  // Ungated — GET /events was relaxed to allow any authenticated caller to
  // read the ACTIVE list, so the card shows for Yuvaks too. Inactive events
  // are still hidden server-side from anyone without EVENTS:CREATE, and the
  // event pages (register / edit) still enforce their own grants.
  const eventsQ = useEvents('active', true);
  const events = Array.isArray(eventsQ.data) ? eventsQ.data : [];

  // ── My Followup: /users/me's `followup_by_id_name` and
  //    `followup_id_mobile` (present on the me-only shape). Sabha and
  //    Mandal Head rows were removed in successive product passes; the
  //    hierarchy fetch is gone with them. Bring `useSabhaById` /
  //    `useMandalById` back here if either level returns to the card.
  const meQ = useMe(Boolean(userId));
  const me = meQ.data;
  const spiritualLoading = meQ.isLoading;
  // Ungated — /users/today-birthdays needs no grant at all. Same query key as
  // the Yuvak tab's follow-up tile, so the two share one cache entry.
  const birthdays = useTodayBirthdays();

  const age = formatSabhaAge(data?.sabha_age);
  const total = data?.total_sabha_present;
  const last4 = data?.present_in_last_4w;
  // `attended` is a boolean the API always sends, so `false` is a real answer —
  // "you missed it" — and not a missing value. Only a wholly absent block is
  // unknown.
  const lastSabha = data?.last_sabha;
  // WHEN that last Sabha was held, shown inline beside "Attended". The API sends
  // `date` as the real sitting day (YYYY-MM-DD), not the week's Monday — see the
  // `last_sabha` block in the backend. The year is dropped ("17 Aug 2026" ->
  // "17 Aug"): the value line is tight, and a weekly rhythm makes the year read
  // as noise. `null` folds away — an old member with no last Sabha keeps a clean
  // "Not Attended" with nothing tacked on.
  const lastSabhaDay =
    (lastSabha?.date ? readDate(lastSabha.date)?.date.replace(/\s\d{4}$/, '') : null) || null;
  /**
   * WHEN AND WHERE THE MEMBER'S SABHA MEETS — `self.upcoming_sabha`.
   *
   * A RECURRING SLOT, NOT A DATED SESSION. The backend reads it from the Sabha's
   * one active `sabha_schedule` row, so it is the standing weekly appointment
   * ("Sunday, 18:30") and carries no date: it does not move as sessions are held
   * or missed, and it must not be described as "the next Sabha on the 17th".
   *
   * Null when the member has no Sabha, or their Sabha has no active schedule —
   * which is not the same as a meeting whose details are blank, and reads as its
   * own line rather than as an empty one.
   */
  const upcoming = data?.upcoming_sabha;

  return (
    <div className="space-y-6">
      {/* TODAY'S THOUGHT — the spiritual quote, above every stat. Its own
          block rather than a tile: the text is longer than a stat, and the
          gradient background is deliberately the loudest thing on this tab.
          Renders null when the store is empty, so a fresh deployment shows
          the six tiles below with nothing above them. */}
      <TodaysThought />

      {/*
        SIX TILES, THREE ACROSS, TWO ROWS:

          Sabha Age   Total Sabha Attended   Last 4 Weeks
          Last Sabha  Birthdays Today        Upcoming Sabha

        The first row is the record, the second is what is in front of the
        member — how the last sitting went, who to wish today, and when to turn
        up next.

        Six every time, so nothing spans: every tile is read from the one
        /dashboard-overview payload (Birthdays Today aside), and none of them is
        behind a grant that could take it away and leave a hole.
      */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/*
          SABHA AGE. A string, not a count — OverviewStat formats numbers with
          thousands separators, which would turn a tenure into "2y 3m 20d"
          only by luck. Passing the formatted string keeps the unit next to
          each part.

          `null` when the member has no joining date on record, which is most
          of the member base until somebody edits them. The tile then reads "—"
          rather than a zero tenure, and its context line says WHICH of the two
          it is: "joined today" and "we don't know" are not the same statement.
        */}
        <OverviewStat
          label="Sabha Age"
          icon={Hourglass}
          iconClass="bg-primary-50 text-primary"
          value={age}
          /* No line under a tenure. "Since joined" is what a Sabha Age IS, not
             something further to say about it — the label already carries the
             whole thought. The empty case keeps its line, because "—" on its own
             does not say which of the two it means. */
          sub={age ? null : 'Joining date not recorded'}
          loading={loading}
        />

        {/*
          THEIR WHOLE HISTORY AT THEIR OWN SABHA. Scoped to the member's current
          `sabha_id`, so a transfer DOES reset it — sessions attended at a
          previous Sabha are not counted, because this tile is about the Sabha
          they are in now.

          Its denominator is the register (sessions they were marked for), not a
          fixed window like the 4-week and 52-week tiles beside it, so the three
          will not line up. That is by design, not a disagreement.

          NO CONTEXT LINE UNDER THE RATIO. "Missed 0 of 1" restated the two
          numbers directly above it — the ratio already says how many of how
          many, and the miss count is the same fact subtracted. The line is kept
          for the empty case, where there is no ratio to read.
        */}
        <OverviewStat
          label="Total Sabha Attended"
          icon={CalendarClock}
          iconClass="bg-accent/10 text-accent"
          value={total ? <Ratio part={total.attended} whole={total.total_sabha} /> : null}
          /* The ratio above already carries the share — "2 / 4" and
             "50% attended" are one fact written twice, a line apart. The line
             stays for the empty case, where there is no ratio to read. */
          sub={total?.total_sabha ? null : 'No attendance recorded yet'}
          loading={loading}
        />

        {/*
          LAST 4 WEEKS. `total` is always 4 — a Sabha meets weekly, so four
          weeks is four Sabhas, and the API fixes the denominator rather than
          counting the weeks its records happen to hold. A week the Sabha did
          not meet is therefore a week not attended.

          A LIVE WINDOW — this week is one of the four. So the ratio reflects
          this week's Sabha the moment attendance is marked, and (by design)
          reads the current week as not-attended until then, dipping the ratio
          early in the week. See the matching note in the backend.

          Still rendered from `last4.total` rather than a literal 4, so the tile
          follows the API if that window is ever widened.

          No context line, for the same reason as the tile above it: the ratio
          already states how many of how many, and "Missed 4 of 4" was that same
          fact subtracted and printed again.
        */}
        <OverviewStat
          label="Last 4 Weeks"
          icon={CalendarCheck}
          iconClass="bg-success-bg text-success-fg"
          value={last4 ? <Ratio part={last4.attended} whole={last4.total} /> : null}
          tone={last4?.not_attended ? 'attention' : 'good'}
          loading={loading}
        />

        {/*
          LAST SABHA — a LIVE snapshot of the most recent regular Sabha,
          THIS week's included: the tile flips to this week the moment the
          member is marked for it. It FALLS BACK to the most recent earlier
          week when there is no current-week record yet — so, unlike the 4- and
          52-week windows (which keep a current-week slot that reads absent
          until marked), this tile never shows an empty current week. Rendered
          as a word rather than a number: the answer is yes or no, and "1"
          would be a count of nothing.

          "Attended" / "Not Attended", not "Present" / "Absent". The tile is
          about what the MEMBER did, and it reads as a sentence about them —
          the other three tiles on this step count attendance the same way.
          The field behind it is still `attended`; only the word changed.
        */}
        <OverviewStat
          label="Last Sabha"
          icon={lastSabha?.attended ? CheckCircle2 : XCircle}
          iconClass={
            lastSabha?.attended
              ? 'bg-success-bg text-success-fg'
              : 'bg-danger-bg text-danger-fg'
          }
          // The value is words, not a figure — OverviewStat sets those one step
          // down. A prop rather than a span wrapped round the value here, so the
          // rule belongs to every tile on both tabs and not to this one.
          phrase
          value={
            lastSabha ? (
              <>
                {lastSabha.attended ? 'Attended' : 'Not Attended'}
                {/* The day sits one weight and shade down from the verdict — it
                    answers "when", but the verdict is what the tile is read for,
                    so the date must not compete with it. */}
                {lastSabhaDay && (
                  <span className="ml-1 font-normal text-text-faint">· {lastSabhaDay}</span>
                )}
              </>
            ) : null
          }
          /*
            The line is encouragement rather than a restatement — the value
            already says what happened, so this says what it means for the
            member. A miss reads as the next thing to do, not as a scolding.
          */
          sub={lastSabha ? (lastSabha.attended ? 'One step ahead in spiritual growth.' : 'Your next step in spiritual growth awaits.') : null}
          tone={lastSabha?.attended ? 'good' : 'attention'}
          loading={loading}
        />

        {/*
          BIRTHDAYS TODAY — everyone in the member's own Mandal celebrating
          today, from /users/today-birthdays. Moved here from the Yuvak tab,
          which keeps the follow-up count.

          The COUNT IS THE LIST'S OWN LENGTH, not a number from a payload: this
          tile links to the page that shows those people, and the only way to
          be sure the two agree is to count what the page will draw.

          `birthdays.error` reads as "—" rather than as 0. A failed request is
          not the same statement as "nobody has a birthday today", and on the
          one day it matters that difference is the whole tile.

          A whole-tile link: "Send wishes" is the only thing anyone does with a
          birthday count, so the tile is the button.
        */}
        <OverviewStat
          label="Birthdays Today"
          icon={Gift}
          iconClass="bg-danger-bg text-danger-fg"
          value={birthdays.error ? null : birthdays.users.length}
          sub={<TileAction>Send wishes</TileAction>}
          tone="attention"
          to="/birthdays"
          loading={birthdays.isLoading}
        />

        {/*
          UPCOMING SABHA — the standing weekly slot, from the same payload as
          every other figure on this tab. It used to be picked out of
          /attendance/sabhadetails, which meant a second request, a date that
          drifted with the sessions, and ATTENDANCE:READ — a grant most members
          on this tab do not hold, so the tile was hidden from exactly the people
          it is for. The backend now sends it, so all three problems are gone.

          Day and time as the value, location under it. `phrase` because
          "Friday 9:00 PM" is words, not a count.

          The time is turned back into the way people say it — the API stores
          21:00 and the Mandal says nine o'clock. See readClock.
        */}
        <OverviewStat
          label="Upcoming Sabha"
          icon={CalendarDays}
          iconClass="bg-primary-50 text-primary"
          phrase
          value={
            upcoming
              ? [upcoming.day, readClock(upcoming.time)].filter(Boolean).join(' ')
              : null
          }
          /*
            NO LOCATION, NO LINE. `location` is null for most Sabhas, and
            "Location not recorded" is a sentence about the database rather than
            anything the member can use — on the common case it would be the one
            tile in the row saying something and saying nothing. Passing null
            drops the line entirely (see OverviewStat), so the tile ends on the
            day and time, which is the part that matters.

            A MISSING SCHEDULE STILL SPEAKS, though: that is a different fact —
            the Sabha has no meeting set at all, not merely no address — and the
            value above it is an em dash that would otherwise go unexplained.
          */
          sub={upcoming ? upcoming.location : 'No schedule set for your Sabha'}
          loading={loading}
        />

        {/* Last 52 Weeks was a tile here too. It is now the donut at the bottom
            of this tab — a ratio over a fixed year is a part-to-whole shape, and
            as a tile it was a third "N / M" in a row that already had two. */}
      </div>

      {/*
        WHAT IS COMING, THEN WHAT HAS HAPPENED — and the record is ordered
        nearest-first:

          tiles          where the member stands right now
          events         what is still ahead of them
          last 8 weeks   the recent habit, week by week
          last 52 weeks  the year, as one ring

        Events sits directly under the tiles because it is the only thing on
        this tab that can still be ACTED on: the two charts below it report a
        record that is already written. Reading order is the order of what the
        reader can do something about.
      */}
      <UpcomingEvents events={events} loading={eventsQ.isLoading} />

      {/* MY FOLLOWUP — the current content of the card. Sits under Events
          (the other "act on this now" block) and above the two habit
          charts. See MySpiritualFriends for the history of what has
          lived here. */}
      <MySpiritualFriends me={me} loading={spiritualLoading} />

      {/* The member's own habit over two months. Same block, same request — no
          extra fetch. */}
      <MyAttendanceCard weeks={data?.last_8w} loading={loading} />

      {/* And the year behind that, as a part-to-whole. Last because it is the
          longest window on the tab: the page reads outward from today. */}
      <YearDonut year={data?.last_52w} loading={loading} />
    </div>
  );
}
