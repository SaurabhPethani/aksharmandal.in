import { Loader2, Inbox, AlertCircle } from 'lucide-react';

// Primitives map onto the live site's component classes (defined in index.css),
// so shape/padding/shadow/hover match without re-deriving them here.

export function Card({ className = '', children, ...rest }) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
}

const BUTTON_CLASS = {
  primary: 'btn-primary',
  accent: 'btn-accent',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-outline !border-danger-fg/30 !text-danger-fg hover:!bg-danger-fg hover:!text-white',
};

export function Button({ variant = 'outline', className = '', busy = false, disabled, children, ...rest }) {
  return (
    <button
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 ${BUTTON_CLASS[variant] ?? BUTTON_CLASS.outline} ${className}`}
      {...rest}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/**
 * Skeleton placeholder. Sized by the caller so the loading layout occupies the
 * same box as the loaded one — no layout shift, and never a placeholder number.
 */
export function Skeleton({ className = '', ...rest }) {
  return <div className={`animate-pulse rounded-lg bg-bg ${className}`} aria-hidden="true" {...rest} />;
}

export function Loader({ label = 'Loading', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 p-8 text-sm text-text-muted ${className}`}>
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}…</span>
    </div>
  );
}

/** Full-page loader for lazy-route suspense and session boot. */
export function PageLoader({ label = 'Loading' }) {
  return <div className="grid min-h-[60vh] place-items-center"><Loader label={label} /></div>;
}

/**
 * Covers content that is already on screen while it is being replaced —
 * a page change, a sort, a filter, a slow response.
 *
 * The distinction from `Loader`: that one stands in for content that does not
 * exist yet, this one sits over content that is about to be stale. The old rows
 * stay visible underneath (so the table does not collapse and jump), but the
 * overlay takes pointer events, so a second sort cannot be fired at rows that
 * are already being replaced.
 *
 * The caller must be `relative` for this to anchor.
 */
export function BusyOverlay({ label = 'Loading' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-10 grid place-items-center rounded-card bg-white/65 backdrop-blur-[1px]"
    >
      <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-primary shadow-card">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        {label}…
      </span>
    </div>
  );
}

export function EmptyState({ title = 'Nothing to show', hint, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-50 text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold text-primary">{title}</p>
      {hint && <p className="max-w-md text-sm text-text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-danger-bg text-danger-fg">
        <AlertCircle className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold text-primary">{title}</p>
      <p className="max-w-md text-sm text-text-muted">{error?.message || 'Please try again.'}</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/**
 * Switch. Controlled and stateless on purpose — it renders `checked` and calls
 * `onChange`, never flipping itself. Screens that must wait for the server (the
 * member status toggle) therefore cannot drift out of sync with it.
 */
/**
 * `tone` colours the "on" state. Green is the default because the first switch
 * in the app answers "is this member attending" — a yes/no about a fact. The
 * permission switches answer "may they", which is the brand's accent, not a
 * health signal.
 */
const TOGGLE_ON = { success: 'bg-success-fg', accent: 'bg-accent' };

export function Toggle({ checked = false, onChange, disabled = false, label, tone = 'success', className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2
        ${checked ? TOGGLE_ON[tone] ?? TOGGLE_ON.success : 'bg-[#CBD5E1]'}
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:opacity-90'} ${className}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function Badge({ tone = 'neutral', children }) {
  const cls = { neutral: 'badge-neutral', ok: 'badge-green', bad: 'badge-red' }[tone] ?? 'badge-neutral';
  return <span className={cls}>{children}</span>;
}

/**
 * Dashboard metric tile. Padding is tighter than `.card` because the live layout
 * runs six across at xl.
 */
export function StatCard({ label, value, percentage, sub, loading, icon: Icon, iconClass = 'bg-primary-50 text-primary' }) {
  return (
    <div className="panel cursor-default transition-all duration-200 hover:-translate-y-0.5">
      <div className="mb-4 flex items-center gap-2.5">
        {Icon && (
          <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="text-sm font-semibold text-text-muted">{label}</span>
      </div>

      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="flex items-end gap-2.5">
          <p className="tnum font-display text-[1.9rem] font-bold leading-none text-primary">{value}</p>
          {percentage != null && (
            <span className="tnum mb-0.5 inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary">
              {Number(percentage).toFixed(1)}%
            </span>
          )}
        </div>
      )}
      {sub && !loading && <p className="mt-2 text-xs leading-snug text-text-muted">{sub}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumbs }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
        </div>
        {actions?.length > 0 && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {/* Below the title, not above it — the heading is what identifies the page,
          and the trail reads as a follow-on to it. */}
      {breadcrumbs}
    </div>
  );
}
