import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarRange } from 'lucide-react';
import { useCompare, usePermissions } from '../hooks';
import { ACTIONS, MODULES } from '../constants/permissions';
import { BLANK_FILTER, filterParams } from '../utils/reportFilters';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { Breadcrumbs } from '../components/Navigation';
import ReportFilterBar from '../components/reports/ReportFilterBar';
import ForbiddenPage from './ForbiddenPage';
import { formatNumber } from '../utils/format';

// The Compare report — two periods of the SAME granularity (day↔day, week↔week,
// month↔month) placed side by side on Present / Absent, with the A−B change.
//
// Both periods are chosen by hand (Period A and Period B); B defaults to the one
// before A only as a starting point. Present/Absent are roster-view, scope-
// clamped by the same REPORTS layer every other report uses — the backend
// (`GET /reports/compare`) returns the two periods plus the delta, and the
// sibling `filters` block feeds the scope bar.

const GRANULARITIES = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

/** Sensible starting periods per granularity: A = now, B = the one before it. */
function defaultPeriods(g) {
  const now = new Date();
  if (g === 'month') return { a: ym(now), b: ym(addMonths(now, -1)) };
  return { a: ymd(now), b: ymd(addDays(now, -7)) };
}

/** The granularity switch — a segmented control. */
function GranularitySwitch({ value, onChange }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-control bg-bg p-0.5" role="group" aria-label="Granularity">
      {GRANULARITIES.map((g) => {
        const active = g.key === value;
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => onChange(g.key)}
            aria-pressed={active}
            className={`rounded-[0.6rem] px-4 py-1.5 text-sm font-semibold transition-colors ${
              active ? 'bg-surface text-primary shadow-card' : 'text-text-muted hover:text-primary'
            }`}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

/** A change badge — arrow + magnitude. `goodWhenPositive` decides the colour:
 *  Present up is good (green), Absent up is bad (red). Zero shows a flat dash. */
function DeltaBadge({ value, goodWhenPositive }) {
  if (value == null) return null;
  if (value === 0) return <span className="text-xs font-semibold text-text-muted">no change</span>;
  const positive = value > 0;
  const good = positive === goodWhenPositive;
  const cls = good ? 'text-success-fg' : 'text-danger-fg';
  const Arrow = positive ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${cls}`}>
      <Arrow className="h-4 w-4" />
      {formatNumber(Math.abs(value))}
    </span>
  );
}

/** One period's Present / Absent, with its label. */
function PeriodCard({ tag, period, loading }) {
  return (
    <div className="panel">
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-faint">{tag}</p>
      {loading ? (
        <Skeleton className="mt-1 h-4 w-32" />
      ) : (
        <p className="mt-0.5 truncate text-sm font-semibold text-primary" title={period?.label}>
          {period?.label ?? '—'}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-card border border-line-soft bg-bg/50 px-3 py-3 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Present</p>
          {loading ? (
            <Skeleton className="mx-auto mt-1.5 h-7 w-14" />
          ) : (
            <p className="tnum mt-1 font-display text-2xl font-bold leading-none text-success-fg">
              {formatNumber(period?.present ?? 0)}
            </p>
          )}
        </div>
        <div className="rounded-card border border-line-soft bg-bg/50 px-3 py-3 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Absent</p>
          {loading ? (
            <Skeleton className="mx-auto mt-1.5 h-7 w-14" />
          ) : (
            <p className="tnum mt-1 font-display text-2xl font-bold leading-none text-danger-fg">
              {formatNumber(period?.absent ?? 0)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const REPORTS_PATH = '/reports';

export default function ComparePage() {
  const { can } = usePermissions();

  const [granularity, setGranularity] = useState('week');
  const [a, setA] = useState(() => defaultPeriods('week').a);
  const [b, setB] = useState(() => defaultPeriods('week').b);
  const [filter, setFilter] = useState(BLANK_FILTER);

  // Switching granularity resets the two periods to that unit's defaults — a
  // day value (YYYY-MM-DD) is not a month value (YYYY-MM), so carrying it over
  // would send the backend a malformed period.
  const onGranularity = (g) => {
    setGranularity(g);
    const d = defaultPeriods(g);
    setA(d.a);
    setB(d.b);
  };

  const params = useMemo(
    () => ({ granularity, a, b, ...filterParams(filter) }),
    [granularity, a, b, filter]
  );
  const enabled = Boolean(a && b);
  const compareQ = useCompare(params, enabled);
  const data = compareQ.data;

  const inputType = granularity === 'month' ? 'month' : 'date';
  const inputHint =
    granularity === 'week' ? 'Pick any day — the whole week (Mon–Sun) is compared.' : null;

  if (!can(MODULES.COMPARE, ACTIONS.VIEW)) {
    return <ForbiddenPage message="The Compare report requires the Compare · View permission." />;
  }

  const periodInput = (label, val, onSet) => (
    <div className="min-w-0 flex-1">
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-muted">{label}</label>
      <input
        type={inputType}
        value={val}
        onChange={(e) => onSet(e.target.value)}
        className="w-full rounded-control border border-line-soft bg-surface px-3 py-2 text-sm text-primary focus:border-primary focus:outline-none"
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compare"
        subtitle="Two periods, side by side — Present & Absent"
        breadcrumbs={<Breadcrumbs items={[{ label: 'Reports', to: REPORTS_PATH }, { label: 'Compare' }]} />}
      />

      <div className="card space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
            <CalendarRange className="h-4 w-4" />
          </span>
          <GranularitySwitch value={granularity} onChange={onGranularity} />
        </div>

        {/* The two periods to compare. Snapping (week → Monday) is the backend's. */}
        <div className="flex flex-wrap items-end gap-3">
          {periodInput('Period A', a, setA)}
          <span className="pb-2 text-sm font-semibold text-text-muted">vs</span>
          {periodInput('Period B', b, setB)}
        </div>
        {inputHint && <p className="text-[11px] text-text-faint">{inputHint}</p>}

        {/* Scope — the caller's authorized pradesh/mandal/sabha, no Year. */}
        <ReportFilterBar
          filters={compareQ.filters}
          value={filter}
          onChange={setFilter}
          busy={compareQ.isFetching && !compareQ.isLoading}
          showYear={false}
        />
      </div>

      {compareQ.error ? (
        <div className="card">
          <ErrorState error={compareQ.error} onRetry={compareQ.refetch} title="Could not load the comparison" />
        </div>
      ) : !enabled ? (
        <div className="card">
          <EmptyState icon={CalendarRange} title="Pick two periods" hint="Choose Period A and Period B to compare." />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <PeriodCard tag="Period A" period={data?.period_a} loading={compareQ.isLoading} />
            <PeriodCard tag="Period B" period={data?.period_b} loading={compareQ.isLoading} />
          </div>

          {/* The change, A vs B. Present up is good; Absent up is bad. */}
          <div className="panel">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text-faint">
              Change (A vs B)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-card border border-line-soft bg-bg/50 px-4 py-3">
                <span className="text-sm font-semibold text-text-muted">Present</span>
                {compareQ.isLoading ? (
                  <Skeleton className="h-5 w-12" />
                ) : (
                  <DeltaBadge value={data?.delta?.present} goodWhenPositive />
                )}
              </div>
              <div className="flex items-center justify-between rounded-card border border-line-soft bg-bg/50 px-4 py-3">
                <span className="text-sm font-semibold text-text-muted">Absent</span>
                {compareQ.isLoading ? (
                  <Skeleton className="h-5 w-12" />
                ) : (
                  <DeltaBadge value={data?.delta?.absent} goodWhenPositive={false} />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
