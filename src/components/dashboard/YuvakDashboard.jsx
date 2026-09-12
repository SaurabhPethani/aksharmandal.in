import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Cake, CalendarDays, ChevronRight, Clock, Flame, Mic, Phone, Play,
  Quote, Sparkles, Star, TrendingUp, Trophy, User,
} from 'lucide-react';
import { usePermissions, useMe, useTodayBirthdays } from '../../hooks';
import { NIMIT_SEVAK_LABEL } from '../../utils/memberFlags';
import { Button } from '../ui';
import QrCodeCard from './QrCodeCard';
import {
  ACHIEVEMENTS, ACTIVITY_MIX, ATTENDANCE_TREND, QUOTES, RECENT_PRASANGAM,
  STATS, UPCOMING_SABHA,
} from './yuvakPlaceholders';

// The Yuvak's own dashboard — the second of the two the app ships, and the one
// DashboardPage picks when the signed-in member holds the Yuvak role. It answers
// "what does MY satsang look like" rather than "how is my hierarchy doing":
// there are no member counts, no percentages and no report tiles on it, because
// a Yuvak reads none of those endpoints.
//
// WHAT IS REAL AND WHAT IS NOT. The name, the QR code and the spiritual-family
// card (Nimit Sevak, Sabha, Mandal) are read from full-context and /users/me.
// Everything else — the streak, the celebrations, the two charts, the upcoming
// Sabha, the Prasangam list and the milestones — is placeholder content, kept in
// ./yuvakPlaceholders.js so the line between the two stays visible. Each is one
// hook away from going live; none of them invents a number from data the app
// already holds, which would be worse than an obvious fixture.

/** ACHIEVEMENTS[].icon → component. Adding a milestone type means adding a key. */
const ACHIEVEMENT_ICONS = { star: Star, trophy: Trophy, flame: Flame, mic: Mic };

// Animations are scoped with a `yd-` prefix and injected with the screen rather
// than added to index.css: nothing outside this dashboard uses them, and they
// leave with it if the design is replaced.
const KEYFRAMES = `
  @keyframes yd-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes yd-fade    { from { opacity: 0; } to { opacity: 1; } }
  @keyframes yd-flame {
    0%, 100% { transform: scale(1) rotate(-2deg); filter: brightness(1); }
    50%      { transform: scale(1.08) rotate(2deg); filter: brightness(1.15); }
  }
  @keyframes yd-pulse-ring {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,134,42,0); }
    50%      { box-shadow: 0 0 0 8px rgba(255,134,42,0.20); }
  }
  @keyframes yd-shine {
    0%   { transform: translateX(-120%) skewX(-12deg); }
    100% { transform: translateX(280%) skewX(-12deg); }
  }
  @keyframes yd-draw-line {
    from { stroke-dashoffset: 1000; }
    to   { stroke-dashoffset: 0; }
  }
  .yd-stagger > * { opacity: 0; animation: yd-fade-up 0.55s cubic-bezier(.2,.7,.3,1) forwards; }
  .yd-stagger > *:nth-child(1) { animation-delay: 0.02s; }
  .yd-stagger > *:nth-child(2) { animation-delay: 0.10s; }
  .yd-stagger > *:nth-child(3) { animation-delay: 0.18s; }
  .yd-stagger > *:nth-child(4) { animation-delay: 0.26s; }
  .yd-stagger > *:nth-child(5) { animation-delay: 0.34s; }
  .yd-stagger > *:nth-child(6) { animation-delay: 0.42s; }
  .yd-stagger > *:nth-child(7) { animation-delay: 0.50s; }
  .yd-stagger > *:nth-child(8) { animation-delay: 0.58s; }

  /* Every animation above is decoration. A reader who has asked their OS for
     less motion gets the same layout, held still.
     Only 'animation' is reset, not 'opacity': the decorative blobs are faded on
     purpose (opacity-20/30/40) and forcing them opaque would be a louder screen,
     not a calmer one. The one place opacity DOES have to be put back is the
     stagger's own 'opacity: 0' starting state, which its cancelled animation
     would otherwise never move off. */
  @media (prefers-reduced-motion: reduce) {
    .yd-stagger, .yd-stagger * { animation: none !important; }
    .yd-stagger > * { opacity: 1 !important; }
  }
`;

const greetingByHour = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 20) return 'Good evening';
  return 'Jai Swaminarayan';
};

/* ── Counter that runs up to its value (rAF, easeOutCubic) ────────────────── */
function AnimatedNumber({ value, duration = 900 }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let raf;
    let start;
    const tick = (now) => {
      if (start === undefined) start = now;
      const t = Math.min(1, (now - start) / duration);
      setN(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{n}</>;
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
function HeroGreeting({ firstName, streak, today }) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl"
      style={{
        background: 'linear-gradient(135deg, #003158 0%, #002849 35%, #1A3D6B 70%, #FF862A 140%)',
        boxShadow: '0 24px 64px rgba(0,49,88,0.32)',
      }}
    >
      <div
        className="absolute -right-10 -top-10 h-56 w-56 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,134,42,0.50) 0%, transparent 70%)' }}
      />
      <div
        className="absolute -right-24 bottom-0 h-72 w-72 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 70%)' }}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
        <div
          className="absolute left-0 top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          style={{ animation: 'yd-shine 3.5s ease-in-out 0.8s' }}
        />
      </div>

      <div className="relative px-6 py-7 sm:px-9 sm:py-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p
              className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/70"
              style={{ animation: 'yd-fade 0.6s ease-out' }}
            >
              {greetingByHour()} · {today}
            </p>
            <h1
              className="mb-2 font-display text-3xl font-bold leading-tight text-white sm:text-4xl"
              style={{ animation: 'yd-fade-up 0.7s cubic-bezier(.2,.7,.3,1) 0.05s both' }}
            >
              Jai Swaminarayan, {firstName}
            </h1>
            <p
              className="max-w-md text-sm leading-relaxed text-white/85 sm:text-base"
              style={{ animation: 'yd-fade-up 0.7s cubic-bezier(.2,.7,.3,1) 0.15s both' }}
            >
              May today bring you closer to Akshardham. The satsang walks beside you on every step.
            </p>
          </div>

          {streak > 0 && (
            <div
              className="flex flex-shrink-0 items-center gap-2.5 self-start rounded-2xl px-4 py-3 sm:self-auto"
              style={{
                background: 'rgba(255,255,255,0.14)',
                border: '1px solid rgba(255,255,255,0.24)',
                backdropFilter: 'blur(8px)',
                animation: 'yd-fade-up 0.7s cubic-bezier(.2,.7,.3,1) 0.25s both',
              }}
            >
              <span
                className="text-orange-300"
                style={{ animation: 'yd-flame 2.2s ease-in-out infinite', transformOrigin: 'center bottom' }}
              >
                <Flame className="h-7 w-7" fill="currentColor" />
              </span>
              <div>
                <p className="tnum text-2xl font-bold leading-none text-white">
                  <AnimatedNumber value={streak} />
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-white/70">Day streak</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Today's celebrations ─────────────────────────────────────────────────── */
// Real data: GET /api/v1/users/today-birthdays, everyone in the member's own
// Mandal with a birthday today.
//
// A COUNT AND A LINK, NOT A LIST. This card used to draw every celebrant with an
// avatar, their Sabha and a Send-wishes button that opened WhatsApp — a second,
// slightly different implementation of what the Birthdays page now does
// properly, with the wish popup, the API-backed send and the follow-up ordering.
// Two ways to wish someone meant two behaviours to keep in step, and the one on
// the dashboard was the poorer of them. So the dashboard answers only "is there
// anything today", the way every other tile does, and the page does the work.
//
// An empty day renders nothing at all rather than an empty-state box: "no
// birthdays today" is the normal case, and a card saying so every day would be
// noise on the one screen meant to feel like a welcome. Same for the loading
// state — a skeleton that usually resolves to nothing is worse than nothing.
function CelebrationsCard({ count, isLoading, error, onRetry }) {
  if (isLoading) return null;

  if (error) {
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Cake className="h-4 w-4" />
          </span>
          <p className="text-sm text-text-muted">Couldn’t load today’s birthdays.</p>
        </div>
        <Button onClick={onRetry} className="!px-4 !py-2 text-sm">Try again</Button>
      </div>
    );
  }

  if (!count) return null;

  return (
    <Link
      to="/birthdays"
      className="group relative block overflow-hidden rounded-3xl transition-transform hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(135deg, #FEF3C7 0%, #FFEDD5 50%, #FFE4CC 100%)',
        border: '1px solid rgba(251,191,36,0.32)',
        boxShadow: '0 8px 24px rgba(251,146,60,0.15)',
      }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full opacity-40"
        style={{ background: 'radial-gradient(circle, #FBBF24 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, #F97316 0%, transparent 70%)' }}
      />

      <div className="relative flex items-center gap-4 p-5">
        <div
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-white"
          style={{
            background: 'linear-gradient(135deg, #FBBF24, #F97316)',
            boxShadow: '0 4px 12px rgba(251,146,60,0.40)',
            animation: 'yd-pulse-ring 2.4s ease-in-out infinite',
          }}
        >
          <Cake className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold leading-tight text-primary">Today’s Celebrations</h3>
          {/* The count is the message, so it is the thing that is bold. */}
          <p className="mt-0.5 text-sm text-amber-900/80">
            <span className="tnum font-bold text-primary">{count}</span>
            {count === 1 ? ' birthday' : ' birthdays'} in your Mandal · send wishes
          </p>
        </div>

        <ChevronRight className="h-5 w-5 flex-shrink-0 text-amber-900/40 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

/* ── Stats strip ──────────────────────────────────────────────────────────── */
function YuvakStatCard({ icon: Icon, iconClass, label, value, accent, delay }) {
  return (
    <div
      className="panel group cursor-default transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
      style={{ animation: `yd-fade-up 0.55s cubic-bezier(.2,.7,.3,1) ${delay}s both` }}
    >
      <div className="flex items-start justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        {accent && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${accent.className}`}>
            {accent.text}
          </span>
        )}
      </div>
      <p className="tnum mt-3 font-display text-2xl font-bold leading-none text-primary">
        <AnimatedNumber value={value} />
      </p>
      <p className="mt-1.5 text-xs font-medium text-text-muted">{label}</p>
    </div>
  );
}

function StatsStrip({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <YuvakStatCard
        icon={Flame} iconClass="bg-orange-50 text-orange-500" label="Day streak"
        value={stats.streakDays} accent={{ text: 'On fire', className: 'bg-orange-50 text-orange-600' }} delay={0.05}
      />
      <YuvakStatCard
        icon={CalendarDays} iconClass="bg-primary-50 text-primary" label="Sabhas this month"
        value={stats.sabhasThisMonth} accent={{ text: 'On track', className: 'bg-primary-50 text-primary' }} delay={0.1}
      />
      <YuvakStatCard
        icon={Mic} iconClass="bg-purple-50 text-purple-500" label="Prasangams heard"
        value={stats.prasangamsHeard} accent={null} delay={0.15}
      />
      <YuvakStatCard
        icon={Sparkles} iconClass="bg-amber-50 text-amber-500" label="Days as User"
        value={stats.daysAsYuvak} accent={null} delay={0.2}
      />
    </div>
  );
}

/* ── Attendance trend ─────────────────────────────────────────────────────── */
function AttendanceTrendChart({ data }) {
  const W = 320;
  const H = 140;
  const PAD_X = 14;
  const PAD_TOP = 14;
  const PAD_BOTTOM = 22;

  const maxV = Math.max(...data.map((d) => d.count), 1);
  const stepX = (W - PAD_X * 2) / (data.length - 1);
  const pts = data.map((d, i) => ({
    x: PAD_X + i * stepX,
    y: PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * (1 - d.count / maxV),
    count: d.count,
    week: d.week,
  }));

  // Quadratic segments through the midpoints — a smooth line without a spline
  // library, and without overshooting a point the way a naive cubic does.
  const smooth = pts.map((p, i, arr) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = arr[i - 1];
    const cx = (prev.x + p.x) / 2;
    return `Q ${cx} ${prev.y} ${cx} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`;
  }).join(' ');
  const area = `${smooth} L ${pts[pts.length - 1].x} ${H - PAD_BOTTOM} L ${pts[0].x} ${H - PAD_BOTTOM} Z`;
  const last = pts[pts.length - 1];

  return (
    <div className="panel">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="panel-title">Attendance trend</h3>
          <p className="mt-0.5 text-xs text-text-muted">Last 8 weeks · sabhas attended</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success-fg">
          <TrendingUp className="h-3 w-3" /> Trending up
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" preserveAspectRatio="none" role="img" aria-label="Sabhas attended over the last eight weeks">
        <defs>
          <linearGradient id="yd-attend-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF862A" stopOpacity="0.40" />
            <stop offset="100%" stopColor="#FF862A" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={PAD_X} x2={W - PAD_X}
            y1={PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * p}
            y2={PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * p}
            stroke="#EEF2FA" strokeWidth="1" strokeDasharray="2 3"
          />
        ))}

        <path d={area} fill="url(#yd-attend-grad)" style={{ animation: 'yd-fade 0.9s ease-out 0.2s both' }} />
        <path
          d={smooth} fill="none" stroke="#FF862A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="1000" style={{ animation: 'yd-draw-line 1.4s cubic-bezier(.2,.7,.3,1) 0.1s forwards' }}
        />

        {pts.map((p) => (
          <circle
            key={p.week} cx={p.x} cy={p.y} r="3.5" fill="white" stroke="#FF862A" strokeWidth="2"
            style={{ animation: 'yd-fade 0.4s ease-out both' }}
          />
        ))}

        <circle cx={last.x} cy={last.y} r="4" fill="none" stroke="#FF862A" strokeWidth="1.5" opacity="0.5">
          <animate attributeName="r" from="4" to="14" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.6" to="0" dur="1.6s" repeatCount="indefinite" />
        </circle>

        {pts.map((p) => (
          <text key={`label-${p.week}`} x={p.x} y={H - 4} fill="#9BB5CB" fontSize="9" fontWeight="600" textAnchor="middle">
            {p.week}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ── Activity mix ─────────────────────────────────────────────────────────── */
function ActivityMixDonut({ data }) {
  const SIZE = 140;
  const STROKE = 18;
  const R = (SIZE - STROKE) / 2;
  const C = SIZE / 2;
  const circumference = 2 * Math.PI * R;

  let cursor = 0;
  const segments = data.map((d) => {
    const len = (d.value / 100) * circumference;
    const seg = { ...d, len, offset: cursor };
    cursor += len;
    return seg;
  });
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="panel">
      <div className="mb-3">
        <h3 className="panel-title">Activity mix</h3>
        <p className="mt-0.5 text-xs text-text-muted">Your month’s sadhana breakdown</p>
      </div>

      {/* Stacks below sm: the ring is a fixed 140px and the legend needs room for
          a label and a percentage, which together do not fit beside it on a
          360px phone — the bars ended up about 40px wide and unreadable. */}
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative flex-shrink-0">
          <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
            <circle cx={C} cy={C} r={R} fill="none" stroke="#EEF2FA" strokeWidth={STROKE} />
            {segments.map((s, i) => (
              <circle
                key={s.label} cx={C} cy={C} r={R} fill="none" stroke={s.color} strokeWidth={STROKE}
                strokeDasharray={`${s.len} ${circumference - s.len}`}
                strokeDashoffset={-s.offset}
                strokeLinecap="butt"
                style={{ animation: `yd-fade 0.7s ease-out ${0.15 + i * 0.15}s both` }}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="tnum font-display text-2xl font-bold leading-none text-primary">
              <AnimatedNumber value={total} /><span className="text-base">%</span>
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-text-faint">Coverage</p>
          </div>
        </div>

        <div className="w-full space-y-3 sm:flex-1">
          {data.map((d) => (
            <div key={d.label}>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                  <span className="text-xs font-semibold text-primary">{d.label}</span>
                </div>
                <span className="tnum text-xs font-bold text-text-muted">{d.value}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF2FA]">
                <div
                  className="h-full rounded-full"
                  style={{ background: d.color, width: `${d.value}%`, animation: 'yd-fade 0.8s ease-out 0.3s both' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Upcoming Sabha ───────────────────────────────────────────────────────── */
function DetailPill({ label, value, icon: Icon }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-faint">{label}</p>
        <p className="truncate text-xs font-semibold text-primary">{value}</p>
      </div>
    </div>
  );
}

function UpcomingSabhaCard({ sabha }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-[#E8EEF6] bg-white"
      style={{ boxShadow: '0 2px 16px rgba(0,49,88,0.07), 0 1px 4px rgba(0,49,88,0.04)' }}
    >
      <div
        className="relative border-b border-[#F0E5D8] px-5 py-5"
        style={{ background: 'linear-gradient(135deg, #FFF4EC 0%, #FFE4CC 100%)' }}
      >
        <div
          className="absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, #FFAE66 0%, transparent 70%)' }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Upcoming sabha</p>
            <h3 className="truncate font-display text-lg font-bold leading-tight text-primary">{sabha.title}</h3>
          </div>
          <div
            className="flex-shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-accent"
            style={{ boxShadow: '0 2px 8px rgba(255,134,42,0.20)', animation: 'yd-pulse-ring 2.6s ease-in-out infinite' }}
          >
            In {sabha.daysUntil} days
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DetailPill label="Date" value={sabha.date} icon={CalendarDays} />
          <DetailPill label="Time" value={sabha.time} icon={Clock} />
          <DetailPill label="Speaker" value={sabha.speaker} icon={User} />
        </div>

        <div className="rounded-2xl border border-[#E8EEF6] bg-[#F8FAFD] p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-faint">Topic</p>
          <p className="text-sm font-semibold text-primary">{sabha.topic}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {['#003158', '#FF862A', '#10B981', '#8B5CF6'].map((c) => (
              <span key={c} className="h-7 w-7 rounded-full border-2 border-white" style={{ background: c }} />
            ))}
          </div>
          <span className="text-xs font-semibold text-text-muted">+{sabha.attendees - 4} attending</span>
        </div>
      </div>
    </div>
  );
}

/* ── Daily inspiration ────────────────────────────────────────────────────── */
function DailyQuoteCard({ quote }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5"
      style={{
        background: 'linear-gradient(160deg, #1A3D6B 0%, #003158 100%)',
        boxShadow: '0 12px 32px rgba(0,49,88,0.22)',
      }}
    >
      <div
        className="absolute -right-6 -top-6 h-28 w-28 rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, #FF862A 0%, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #FFAE66 0%, transparent 70%)' }}
      />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Today’s inspiration</p>
        </div>
        <Quote className="h-7 w-7 text-accent/70" fill="currentColor" />
        <p className="my-3 text-base font-medium italic leading-relaxed text-white">“{quote.text}”</p>
        <p className="border-t border-white/15 pt-3 text-xs font-semibold text-white/65">— {quote.source}</p>
      </div>
    </div>
  );
}

/* ── Spiritual family — the one card on this screen that is entirely real ─── */
function SpiritualFamilyCard({ me, isLoading }) {
  const sevakName = me?.followup_by_id_name;
  const sevakMobile = me?.followup_by_id_mobile_number ?? me?.followup_by_id_mobile;
  const sabhaName = me?.sabha_name;
  const mandalName = me?.mandal_name;
  const hasAny = sevakName || sabhaName || mandalName;

  return (
    <div className="panel space-y-4">
      <p className="eyebrow">Your spiritual family</p>

      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}

      {!isLoading && !hasAny && (
        <p className="text-sm text-text-muted">
          Your {NIMIT_SEVAK_LABEL} and Sabha details will appear here once assigned.
        </p>
      )}

      {sevakName && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-faint">{NIMIT_SEVAK_LABEL}</p>
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #003158 0%, #FF862A 130%)' }}
            >
              {String(sevakName).trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-primary">{sevakName}</p>
              {sevakMobile && (
                <a
                  href={`tel:${sevakMobile}`}
                  className="mt-0.5 flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent"
                >
                  <Phone className="h-3 w-3 text-text-faint" />
                  {sevakMobile}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {(sabhaName || mandalName) && (
        <div className="space-y-2 border-t border-[#F0F4F9] pt-3">
          {sabhaName && (
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-text-muted">Sabha</p>
              <p className="text-sm font-semibold text-primary">{sabhaName}</p>
            </div>
          )}
          {mandalName && (
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-text-muted">Mandal</p>
              <p className="text-sm font-semibold text-primary">{mandalName}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Recent Prasangam ─────────────────────────────────────────────────────── */
// Rows do not navigate: the Prasangam module has no route in this app yet, and a
// link to a 404 is worse than a card that plainly says so.
function RecentPrasangamCard({ items }) {
  return (
    <div className="panel">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="panel-title">Recent Prasangam</h3>
          <p className="mt-0.5 text-xs text-text-muted">Pick up where the satsang left off</p>
        </div>
        <span className="rounded-full bg-bg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-faint">
          Coming soon
        </span>
      </div>

      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="-mx-1 flex items-center gap-3 rounded-2xl p-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-fuchsia-100 text-purple-600">
              <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-primary">{item.title}</p>
                {item.tag && (
                  <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    item.tag === 'Featured' ? 'bg-accent/10 text-accent' : 'bg-success-bg text-success-fg'
                  }`}>
                    {item.tag}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-text-muted">
                {item.speaker} · {item.duration} · {item.daysAgo}d ago
              </p>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#C0CDE0]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Milestones ───────────────────────────────────────────────────────────── */
function AchievementsCard({ achievements }) {
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="panel">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="panel-title">Milestones</h3>
          <p className="mt-0.5 text-xs text-text-muted">Your journey, marked</p>
        </div>
        <span className="tnum rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
          {unlockedCount}/{achievements.length}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {achievements.map((ach, i) => {
          const Icon = ACHIEVEMENT_ICONS[ach.icon] ?? Star;
          return (
            <div
              key={ach.id}
              className={`rounded-2xl border-2 p-3 text-center transition-all hover:-translate-y-0.5 ${
                ach.unlocked ? 'border-transparent bg-[#FAFBFD] hover:shadow-card' : 'border-dashed border-[#E2EAF4] bg-white'
              }`}
              style={{ animation: `yd-fade-up 0.5s ease-out ${0.1 + i * 0.06}s both` }}
            >
              <span
                className="mx-auto mb-1.5 flex h-11 w-11 items-center justify-center rounded-xl text-white"
                style={{
                  background: ach.unlocked ? ach.gradient : '#E2EAF4',
                  animation: ach.unlocked ? 'yd-pulse-ring 3s ease-in-out infinite' : 'none',
                }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <p className={`text-[11px] font-bold leading-tight ${ach.unlocked ? 'text-primary' : 'text-text-faint'}`}>
                {ach.label}
              </p>
              {!ach.unlocked && (
                <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#C0CDE0]">Locked</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Screen ───────────────────────────────────────────────────────────────── */
export default function YuvakDashboard() {
  const { userId, userName } = usePermissions();
  const { data: me, isLoading: meLoading } = useMe();
  // No permission gate on this one — the endpoint is open to any authenticated
  // member, which is what lets a Yuvak see it at all.
  const birthdays = useTodayBirthdays();

  const firstName = String(userName ?? '').trim().split(/\s+/)[0] || 'User';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  // One quote a day, the same one for everyone — the date picks it, so it does
  // not reshuffle on every render.
  const todayQuote = useMemo(() => QUOTES[new Date().getDate() % QUOTES.length], []);

  return (
    <>
      <style>{KEYFRAMES}</style>

      <div className="yd-stagger space-y-5">
        <HeroGreeting firstName={firstName} streak={STATS.streakDays} today={today} />

        {/*
          THREE PANELS, THE SAME THREE THE ADMIN DASHBOARD HAS: the app's left
          nav, this content column, and a rail on the right that the QR code
          lives in. Yuvak was the odd one out — its QR sat two thirds of the way
          down an inner grid, so the one thing on this screen a member opens it
          for at the Sabha was the thing furthest from the top.

          ONE CARD, ONE PLACE IN THE SOURCE, TWO LAYOUTS. It was rendered TWICE
          before — `lg:hidden` under the hero and `hidden lg:block` in the
          column — which is two cards to keep in step and two of everything they
          fetch. The rail comes FIRST in the DOM and `xl:order-2` moves it right
          on a wide screen, so a phone still gets the QR directly under the
          greeting where it can be produced without scrolling.

          `xl`, not `lg`: below it there is no room for a third column beside a
          320px sidebar, so the rail stacks. `top-[5.5rem]` clears AppShell's
          own sticky header.
        */}
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
          <aside className="space-y-5 xl:sticky xl:top-[5.5rem] xl:order-2 xl:w-[19rem] xl:flex-shrink-0">
            <QrCodeCard
              userId={userId}
              fullName={userName}
              hint="Show this at Sabha to mark your attendance"
            />
          </aside>

          <div className="min-w-0 flex-1 space-y-5 xl:order-1">
            <CelebrationsCard
              count={birthdays.users.length}
              isLoading={birthdays.isLoading}
              error={birthdays.error}
              onRetry={birthdays.refetch}
            />

            <StatsStrip stats={STATS} />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <AttendanceTrendChart data={ATTENDANCE_TREND} />
              <ActivityMixDonut data={ACTIVITY_MIX} />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="space-y-5 lg:col-span-2">
                <UpcomingSabhaCard sabha={UPCOMING_SABHA} />
                <RecentPrasangamCard items={RECENT_PRASANGAM} />
              </div>
              <div className="space-y-5">
                <DailyQuoteCard quote={todayQuote} />
                <SpiritualFamilyCard me={me} isLoading={meLoading} />
                <AchievementsCard achievements={ACHIEVEMENTS} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
