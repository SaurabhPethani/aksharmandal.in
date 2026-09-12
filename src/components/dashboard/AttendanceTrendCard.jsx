import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import TrendChart from '../charts/TrendChart';
import { formatNumber } from '../../utils/format';
import { readWeekDate } from '../../utils/dates';

/**
 * Weekly attendance, from `/dashboard-overview`'s `overall` block.
 *
 * The payload carries BOTH windows on every response — `attendance_last_4_week`
 * and `attendance_last_12_week`, passed in here as `last4` / `last12` — so the
 * switch below costs no request: it re-reads a list the page already has. Four
 * weeks is the default because it is the window anyone asks about first ("how
 * have the last few Sabhas gone"); twelve is there for the question that
 * follows it.
 *
 * ONE LINE, ONE MEASURE. `present_percentage` is what the chart plots.
 * `present_count` and `absent_count` ride along on the same rows and are shown
 * in the TOOLTIP, but a count and a percentage are two scales and would need two
 * axes — which is the one thing a chart must never have. On hover there is no
 * scale to disagree with, so that is where the three counts go.
 *
 * ⚠ `total` is the ONE derived number on this screen: `present_count +
 * absent_count`, because the payload carries no total of its own. It is a sum of
 * two counts from the same row rather than a figure taken over some other base,
 * which is what makes it safe — unlike this payload's percentages, which do not
 * share a base and are never combined. See AdminDashboard's note.
 */

/** The single series this card plots. `#3389C9` is the Reports chart's own
 *  subject colour, re-validated for a lone series on a light surface: inside the
 *  lightness band, over the chroma floor, and past 3:1 against the card. */
const SERIES = [{ key: 'present', label: 'Present %', color: '#3389C9' }];

const RANGES = [
  { key: 'last4', label: '4 weeks' },
  { key: 'last12', label: '12 weeks' },
];

/**
 * "13 (31.0%)" — the count, with the share it is of that week beside it.
 *
 * BOTH PERCENTAGES ARE THE API'S OWN, never `count / total`: `present_percentage`
 * and `absent_percentage` arrive on the row, and recomputing them here would
 * produce a figure that disagrees with the one plotted the moment the backend's
 * base is anything other than present + absent.
 *
 * A missing percentage leaves the count on its own rather than printing "(0.0%)",
 * which would state a share that was never reported.
 */
const countWithShare = (count, percentage) =>
  (percentage == null || percentage === ''
    ? formatNumber(count)
    : `${formatNumber(count)} (${Number(percentage).toFixed(1)}%)`);

/**
 * The window switch — a segmented control, not a dropdown.
 *
 * Two options, both worth naming: a `<select>` would hide half the choice
 * behind a click to show one word. Sits in one row above the chart, which is
 * where a filter that changes what is plotted belongs.
 */
function RangeSwitch({ value, onChange }) {
  return (
    <div className="flex items-center gap-0.5 rounded-control bg-bg p-0.5" role="group" aria-label="Trend window">
      {RANGES.map((r) => {
        const active = r.key === value;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onChange(r.key)}
            aria-pressed={active}
            className={`rounded-[0.6rem] px-3 py-1.5 text-xs font-semibold transition-colors ${
              active ? 'bg-surface text-primary shadow-card' : 'text-text-muted hover:text-primary'
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AttendanceTrendCard({ last4, last12, loading = false }) {
  const [range, setRange] = useState(RANGES[0].key);

  const points = useMemo(() => {
    const source = range === 'last12' ? last12 : last4;
    const weeks = Array.isArray(source) ? source : [];
    return weeks
      .map((w) => {
        // `week_date` is DD-MM-YYYY on this endpoint alone — see readWeekDate.
        const read = readWeekDate(w?.week_date);
        return {
          label: read?.label ?? String(w?.week_date ?? '—'),
          // Keyed on the date, not the label: "20 Jul" carries no year, so a
          // twelve-week window spanning New Year would repeat a key.
          sortKey: read?.key ?? w?.week_date,
          present: w?.present_percentage,
          presentCount: w?.present_count,
          // Carried for the tooltip only — `absent_percentage` is never plotted.
          // It is the complement of the line already on the chart, so a second
          // series for it would be the same information mirrored.
          absentPercentage: w?.absent_percentage,
          absentCount: w?.absent_count,
        };
      })
      // Oldest first. The API's order is not promised, and a line chart read
      // right-to-left says the opposite of what it means.
      .sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  }, [last4, last12, range]);

  return (
    <div className="panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
            <TrendingUp className="h-4 w-4" />
          </span>
          {/* The title names the measure, which is why the chart needs no legend. */}
          <h3 className="panel-title">Weekly Attendance</h3>
        </div>
        <RangeSwitch value={range} onChange={setRange} />
      </div>

      <TrendChart
        points={points}
        series={SERIES}
        loading={loading}
        height={240}
        // Two lines above each week's point — the ratio "10/15" over the
        // percentage it works out to. The chart still plots the percentage on
        // the y-axis; the labels are just the reader's shortcut to both facts
        // without opening the tooltip. A week with nothing recorded returns
        // null so the chart does not stamp "0/0 · 0%" over the axis.
        pointLabel={(p) => {
          const present = Number(p.presentCount) || 0;
          const absent = Number(p.absentCount) || 0;
          const total = present + absent;
          if (!total) return null;
          const pct = p.present == null || p.present === ''
            ? null
            : `${Number(p.present).toFixed(1)}%`;
          const ratio = `${formatNumber(present)}/${formatNumber(total)}`;
          return pct ? [ratio, pct] : [ratio];
        }}
        // Table view: Week | Present / Total | Present %. The count column
        // uses the API's own numbers, not `Present % × total / 100`, so
        // rounding never puts the two columns out of step.
        extraColumns={[
          {
            header: 'Present / Total',
            cell: (p) => {
              const present = Number(p.presentCount) || 0;
              const absent = Number(p.absentCount) || 0;
              const total = present + absent;
              if (!total) return '—';
              return `${formatNumber(present)} / ${formatNumber(total)}`;
            },
          },
        ]}
        tooltipExtras={(p) => {
          const present = Number(p.presentCount) || 0;
          const absent = Number(p.absentCount) || 0;
          // Nothing recorded that week: three zeroes say less than not asking.
          if (!present && !absent) return [];
          return [
            { label: 'Total', value: formatNumber(present + absent) },
            { label: 'Present', value: countWithShare(present, p.present) },
            { label: 'Absent', value: countWithShare(absent, p.absentPercentage) },
          ];
        }}
      />
    </div>
  );
}
