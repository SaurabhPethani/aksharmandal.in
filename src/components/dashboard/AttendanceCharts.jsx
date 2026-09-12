import { useMemo } from 'react';
import { PieChart, TrendingUp } from 'lucide-react';
import { Skeleton } from '../ui';
import TrendChart from '../charts/TrendChart';
import { readWeekDate } from '../../utils/dates';
import { formatNumber } from '../../utils/format';

// The two attendance charts + two small formatters used by the per-member stats
// modal (MemberStatsDialog.jsx), so a leader viewing another member sees the
// same 8-week line and 52-week donut the member sees on their own dashboard.
//
// ⚠ These mirror the inline versions in MyDashboard.jsx (the signed-in
// member's own "My Dashboard"). They were NOT hoisted out of that file — its
// self view still owns its copies — so if you change the chart maths in one,
// change it in the other. Kept separate on purpose: the member view must not
// risk the main dashboard.
//
// `title` is a prop because the self view says "My Last 8 Weeks" while the
// member view says "Last 8 Weeks".

/** "20 / 30" — the part over the whole, as one figure. */
export function Ratio({ part, whole }) {
  return (
    <span>
      {part ?? '—'}
      <span className="text-sm font-semibold text-text-faint"> / {whole ?? '—'}</span>
    </span>
  );
}

/** "2y 3m" — tenure from `sabha_age`, years and months only (days dropped). */
export function formatSabhaAge(age) {
  if (!age) return null;
  const parts = [
    age.year ? `${age.year}y` : null,
    age.month ? `${age.month}m` : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(' ');
  if (age.days && age.days > 0) return 'This month';
  return 'Today';
}

// `label: 'Sabha'` pairs with formatSeriesValue returning Present/Absent.
const SELF_SERIES = [{ key: 'present', label: 'Sabha', color: '#3389C9' }];

/** The personal 8-week attendance line (present = 100, absent = 0). */
export function AttendanceTrendCard({ weeks, loading, title = 'Last 8 Weeks' }) {
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
    [weeks],
  );

  return (
    <div className="panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
            <TrendingUp className="h-4 w-4" />
          </span>
          <h3 className="panel-title">{title}</h3>
        </div>
      </div>

      <TrendChart
        points={points}
        series={SELF_SERIES}
        loading={loading}
        height={220}
        pointLabel={(p) => (p.attended ? 'P' : 'A')}
        formatSeriesValue={(p) => (p.attended ? 'Present' : 'Absent')}
        hideYAxis
      />
    </div>
  );
}

// ── The 52-week donut, present against absent. See MyDashboard's original for
//    the full rationale of the geometry; the maths here is unchanged. ──
const VB_W = 404;
const VB_H = 214;
const CX = 202;
const CY = 104;
const RING_STROKE = 30;
const RING_RADIUS = 62;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const RING_GAP = 3;
const LEADER_START = RING_RADIUS + RING_STROKE / 2;
const LABEL_X = LEADER_START + 18;
const BOX_PAD_X = 13;
const BOX_H = 30;
const BOX_RX = 8;
const boxWidth = (text) => Math.round(text.length * 7) + BOX_PAD_X * 2;
const PRESENT_COLOUR = '#15803D'; // success-fg
const ABSENT_COLOUR = '#E9878A'; // a lighter danger — chosen for colour-blind ΔE

/** THE YEAR AS ONE RING — `last_52w`, present vs absent. */
export function AttendanceYearDonut({ year, loading, title = 'Last 52 Weeks' }) {
  const total = Number(year?.total) || 0;
  const present = Number(year?.present) || 0;
  const absent = Number(year?.absent) || 0;

  const arcFor = (n) => (total > 0 ? (n / total) * RING_LENGTH : 0);
  const presentArc = arcFor(present);
  const absentArc = arcFor(absent);
  const gap = presentArc > 0 && absentArc > 0 ? RING_GAP : 0;
  const startDeg = 270 - (total > 0 ? present / total : 0) * 180;

  const labelAt = (text, right) => {
    const w = boxWidth(text);
    const endX = CX + (right ? LABEL_X : -LABEL_X);
    return {
      points: [
        [CX + (right ? LEADER_START : -LEADER_START), CY],
        [endX, CY],
      ],
      box: { x: right ? endX : endX - w, y: CY - BOX_H / 2, w },
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
      ...labelAt(`Present ${formatNumber(present)}`, false),
    },
    {
      key: 'absent',
      label: 'Absent',
      count: absent,
      colour: ABSENT_COLOUR,
      ...labelAt(`Absent ${formatNumber(absent)}`, true),
    },
  ];

  const missed = total > 0 ? `${Math.round((absent / total) * 100)}%` : '—';

  return (
    <div className="panel">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
          <PieChart className="h-4 w-4" />
        </span>
        <h3 className="panel-title">{title}</h3>
      </div>

      {loading ? (
        <div className="flex justify-center py-2">
          <Skeleton className="h-[154px] w-[154px] rounded-full" />
        </div>
      ) : !year ? (
        <p className="py-10 text-center text-sm text-text-muted">
          No attendance recorded in the last year.
        </p>
      ) : (
        <div className="flex justify-center">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="h-auto w-full max-w-[404px]"
            role="img"
            aria-label={`Last 52 weeks: ${present} present and ${absent} absent of ${total} Sabhas.`}
          >
            <g transform={`rotate(${startDeg - 90} ${CX} ${CY})`}>
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
