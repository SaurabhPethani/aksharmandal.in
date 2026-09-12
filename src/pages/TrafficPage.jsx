import { useState } from 'react';
import { Users, LogIn, UserPlus, Clock, Smartphone, ChevronDown, ChevronUp } from 'lucide-react';
import { PageHeader, Skeleton, ErrorState } from '../components/ui';
import { Modal } from '../components/Overlays';
import { Breadcrumbs } from '../components/Navigation';
import { Select } from '../components/form';
import { useTraffic, useActiveMembers, useDayMembers } from '../hooks/useAnalytics';
import { formatNumber } from '../utils/format';

// SuperAdmin-only traffic dashboard. Reads GET /analytics/traffic (login events
// + presence minutes) and draws it with plain SVG/CSS — the app ships no chart
// library, and these are simple enough not to want one.

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const fmtDay = (iso) => {
  const [y, m, d] = String(iso).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(m) - 1] ?? ''}`;
};

const hoursLabel = (mins) => {
  const m = Number(mins) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-primary tnum">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-text-muted">{hint}</div>}
    </div>
  );
}

/** A vertical bar time-series. `data` is [{date, value}]; `barClass` colours it.
 *  If `onBarClick` is given, bars become clickable to drill into that day. */
function BarSeries({ title, data, barClass = 'bg-accent', unit, onBarClick, activeDate }) {
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        <span className="text-xs text-text-muted tnum">{formatNumber(total)}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="flex h-40 items-stretch gap-[2px]">
        {data.map((d) => {
          const v = Number(d.value) || 0;
          const clickable = Boolean(onBarClick);
          return (
            <button
              key={d.date}
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onBarClick(d.date) : undefined}
              className={`group flex h-full flex-1 flex-col justify-end ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              title={`${fmtDay(d.date)}: ${formatNumber(v)}${unit ? ` ${unit}` : ''}${clickable ? ' — click for members' : ''}`}
            >
              <div
                className={`${barClass} ${v > 0 ? 'min-h-[2px]' : ''} w-full rounded-t transition-opacity group-hover:opacity-80 ${activeDate === d.date ? 'ring-2 ring-primary' : ''}`}
                style={{ height: `${(v / max) * 100}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-text-muted tnum">
        <span>{data.length ? fmtDay(data[0].date) : ''}</span>
        <span>{data.length ? fmtDay(data[data.length - 1].date) : ''}</span>
      </div>
      {onBarClick && <p className="mt-1 text-[10px] text-text-faint">Tap a day to see who.</p>}
    </div>
  );
}

function RepeatChart({ data }) {
  const max = Math.max(1, ...data.map((d) => Number(d.users) || 0));
  const LABELS = { '1': 'Once', '2': 'Twice', '3-4': '3–4 times', '5+': '5+ times' };
  return (
    <div className="card p-4">
      <h3 className="mb-1 text-sm font-semibold text-primary">Repeat visits this week</h3>
      <p className="mb-3 text-xs text-text-muted">How many times members signed in over the last 7 days.</p>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.bucket} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-text-muted">{LABELS[d.bucket] ?? d.bucket}</span>
            <div className="h-4 flex-1 rounded bg-bg">
              <div
                className="h-4 rounded bg-primary"
                style={{ width: `${((Number(d.users) || 0) / max) * 100}%`, minWidth: d.users ? '4px' : 0 }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-semibold text-primary tnum">{formatNumber(d.users)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MethodSplit({ split }) {
  const pin = Number(split?.PIN) || 0;
  const pwd = Number(split?.PASSWORD) || 0;
  const total = pin + pwd;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-primary">Sign-in method</h3>
      <div className="flex h-4 w-full overflow-hidden rounded bg-bg">
        <div className="h-4 bg-accent" style={{ width: `${pct(pin)}%` }} title={`PIN: ${pin}`} />
        <div className="h-4 bg-primary" style={{ width: `${pct(pwd)}%` }} title={`Password: ${pwd}`} />
      </div>
      <div className="mt-3 flex justify-between text-xs">
        <span className="flex items-center gap-1.5 text-text-muted">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" /> PIN
          <span className="font-semibold text-primary tnum">{formatNumber(pin)} ({pct(pin)}%)</span>
        </span>
        <span className="flex items-center gap-1.5 text-text-muted">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" /> Password
          <span className="font-semibold text-primary tnum">{formatNumber(pwd)} ({pct(pwd)}%)</span>
        </span>
      </div>
    </div>
  );
}

/** Top-row KPI: Mobile vs PC, as counts + the mobile share. */
function MobilePcCard({ split }) {
  const m = Number(split?.Mobile) || 0;
  const pc = Number(split?.PC) || 0;
  const t = Number(split?.Tablet) || 0;
  const total = m + pc + t;
  return (
    <StatCard
      icon={Smartphone}
      label="Mobile vs PC"
      value={total ? `${formatNumber(m)} : ${formatNumber(pc)}` : '—'}
      hint={total ? `${Math.round((m / total) * 100)}% mobile${t ? ` · ${formatNumber(t)} tablet` : ''}` : 'awaiting logins'}
    />
  );
}

function DeviceSplit({ split, browsers }) {
  const m = Number(split?.Mobile) || 0;
  const pc = Number(split?.PC) || 0;
  const t = Number(split?.Tablet) || 0;
  const total = m + pc + t;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const maxB = Math.max(1, ...(browsers ?? []).map((b) => Number(b.count) || 0));
  const Dot = ({ cls }) => <span className={`inline-block h-2.5 w-2.5 rounded-sm ${cls}`} />;
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-primary">Device</h3>
      {total === 0 ? (
        <p className="text-sm text-text-muted">No device data yet.</p>
      ) : (
        <>
          <div className="flex h-4 w-full overflow-hidden rounded bg-bg">
            <div className="h-4 bg-accent" style={{ width: `${pct(m)}%` }} title={`Mobile: ${m}`} />
            <div className="h-4 bg-primary" style={{ width: `${pct(pc)}%` }} title={`PC: ${pc}`} />
            <div className="h-4 bg-success-fg" style={{ width: `${pct(t)}%` }} title={`Tablet: ${t}`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
            <span className="flex items-center gap-1.5"><Dot cls="bg-accent" /> Mobile <b className="text-primary tnum">{formatNumber(m)} ({pct(m)}%)</b></span>
            <span className="flex items-center gap-1.5"><Dot cls="bg-primary" /> PC <b className="text-primary tnum">{formatNumber(pc)} ({pct(pc)}%)</b></span>
            <span className="flex items-center gap-1.5"><Dot cls="bg-success-fg" /> Tablet <b className="text-primary tnum">{formatNumber(t)} ({pct(t)}%)</b></span>
          </div>
        </>
      )}
      {browsers?.length > 0 && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <p className="mb-2 text-xs font-semibold text-text-muted">Browsers</p>
          <div className="space-y-1.5">
            {browsers.slice(0, 5).map((b) => (
              <div key={b.browser} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs text-text-muted">{b.browser}</span>
                <div className="h-3 flex-1 rounded bg-bg">
                  <div className="h-3 rounded bg-primary" style={{ width: `${((Number(b.count) || 0) / maxB) * 100}%`, minWidth: b.count ? '4px' : 0 }} />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-semibold text-primary tnum">{formatNumber(b.count)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MembersTable({ rows }) {
  if (!rows.length) return <p className="px-4 py-6 text-sm text-text-muted">No activity in this period.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-text-muted">
          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">Member</th>
          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide">Logins</th>
          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide">Time on site</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.user_id} className="border-t border-line-soft">
            <td className="px-4 py-2.5 text-primary">{u.user_name}</td>
            <td className="px-4 py-2.5 text-right text-primary tnum">{formatNumber(u.logins)}</td>
            <td className="px-4 py-2.5 text-right text-primary tnum">{hoursLabel(u.minutes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TopUsers({ rows, days }) {
  const [showAll, setShowAll] = useState(false);
  const allQ = useActiveMembers(days, showAll);
  const display = showAll && allQ.data ? allQ.data : rows;
  return (
    <div className="card overflow-hidden p-0">
      <h3 className="border-b border-line-soft px-4 py-3 text-sm font-semibold text-primary">
        Most active members{showAll && allQ.data ? ` (${allQ.data.length})` : ''}
      </h3>
      <div className="max-h-[440px] overflow-y-auto">
        <MembersTable rows={display} />
      </div>
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="flex w-full items-center justify-center gap-1 border-t border-line-soft px-4 py-2.5 text-xs font-semibold text-accent transition-colors hover:bg-primary-50"
      >
        {showAll
          ? (<>Show top 10 <ChevronUp className="h-3.5 w-3.5" /></>)
          : (<>View all members <ChevronDown className="h-3.5 w-3.5" /></>)}
      </button>
      {showAll && allQ.isLoading && <p className="px-4 pb-3 text-xs text-text-muted">Loading…</p>}
    </div>
  );
}

/** Who logged in / was new on one clicked day — shown in a popup. */
function DayPanel({ day, onClose }) {
  const q = useDayMembers(day.date, day.metric, true);
  const rows = q.data ?? [];
  const count = rows.length;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${day.label} · ${fmtDay(day.date)}`}
      description={q.data ? `${formatNumber(count)} ${count === 1 ? 'member' : 'members'}` : undefined}
      size="md"
    >
      {q.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} title="Could not load members" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-sm text-text-muted">
          No members {day.metric === 'new' ? 'joined' : 'signed in'} on this day.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.map((r) => (
            <li key={r.user_id} className="flex flex-wrap items-center gap-x-2 py-2.5 text-sm">
              <span className="text-primary">{r.user_name}</span>
              {day.metric === 'logins' && (
                <span className="text-xs text-text-muted">
                  · {formatNumber(r.logins)}× · {[r.methods, r.device, r.browser].filter(Boolean).join(' · ')}
                </span>
              )}
              <span className="ml-auto text-xs text-text-faint">
                {r.at ? new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function TrafficPage() {
  const [days, setDays] = useState('30');
  const [day, setDay] = useState(null); // { date, metric, label } when a bar is clicked
  const query = useTraffic(Number(days));
  const d = query.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Traffic"
        breadcrumbs={<Breadcrumbs items={[{ label: 'Traffic' }]} />}
        actions={[
          <Select
            key="range"
            aria-label="Time range"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            options={RANGES}
            placeholder={null}
            className="w-40"
          />,
        ]}
      />

      {query.isLoading && <Skeleton className="h-64 w-full" />}
      {query.error && (
        <div className="card">
          <ErrorState error={query.error} onRetry={query.refetch} title="Could not load traffic" />
        </div>
      )}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard icon={LogIn} label="Total logins" value={formatNumber(d.summary.total_logins)} hint={`${formatNumber(d.summary.unique_users)} unique members`} />
            <StatCard icon={UserPlus} label="First-time users" value={formatNumber(d.summary.new_users)} hint="new since launch, in range" />
            <StatCard icon={Users} label="Active today" value={formatNumber(d.summary.active_today)} hint={`${formatNumber(d.summary.active_this_week)} this week`} />
            <StatCard icon={Clock} label="Time on site" value={hoursLabel(d.summary.total_minutes)} hint={`avg ${hoursLabel(d.summary.avg_minutes_per_user)}/member`} />
            <MobilePcCard split={d.device_split} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarSeries
              title="Logins per day" data={d.logins_per_day} barClass="bg-accent" unit="logins"
              onBarClick={(dt) => setDay({ date: dt, metric: 'logins', label: 'Logins' })}
              activeDate={day?.metric === 'logins' ? day.date : null}
            />
            <BarSeries
              title="First-time users per day" data={d.new_users_per_day} barClass="bg-success-fg" unit="new"
              onBarClick={(dt) => setDay({ date: dt, metric: 'new', label: 'First-time users' })}
              activeDate={day?.metric === 'new' ? day.date : null}
            />
            <BarSeries title="Time on site per day" data={d.minutes_per_day} barClass="bg-primary" unit="min" />
            <RepeatChart data={d.repeat_distribution} />
          </div>

          {day && <DayPanel day={day} onClose={() => setDay(null)} />}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MethodSplit split={d.method_split} />
            <DeviceSplit split={d.device_split} browsers={d.browser_split} />
          </div>

          <TopUsers rows={d.top_users} days={Number(days)} />
        </>
      )}
    </div>
  );
}
