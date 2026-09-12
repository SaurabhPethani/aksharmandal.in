import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { usePermissions } from '../hooks';

// Spaced above rather than below — the trail now sits under the page title.
export function Breadcrumbs({ items = [] }) {
  return (
    <nav aria-label="Breadcrumb" className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
      <Link to="/dashboard" className="flex items-center gap-1 transition-colors hover:text-primary">
        <Home className="h-3.5 w-3.5" />
        Dashboard
      </Link>
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
          {item.to && i < items.length - 1 ? (
            <Link to={item.to} className="transition-colors hover:text-primary">{item.label}</Link>
          ) : (
            <span className="font-semibold text-primary">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/**
 * Tabs are data-driven — pass whatever the API produced. Nothing here assumes a
 * fixed tab set.
 *
 * TWO VARIANTS, AND THE SECOND EXISTS FOR ONE REASON: a screen that nests one
 * strip under another. The member page does — Profile | Permissions above the
 * record's own Personal | Sabha Details | Address | … — and drawn in the same
 * ink both rows read as one doubled strip, with the top row looking like a
 * heading for the bottom one rather than a control over it. "Which tab am I on"
 * then has two answers and no way to tell which is which.
 *
 * So the OUTER level asks for `variant="solid"`: a raised group of pills on a
 * tinted ground, which is a different object from a row of underlines rather
 * than a louder version of one. The inner level stays `underline` — the app's
 * default everywhere a strip stands alone, so nothing else changes shape.
 *
 * The distinction is FORM, not weight. Making the outer row bigger or bolder
 * would leave two of the same thing at two sizes, which reads as one strip that
 * has been badly aligned.
 *
 * AND THEY SCROLL SIDEWAYS RATHER THAN WRAP. Eight tabs is one comfortable line
 * on a desk and three stacked lines on a phone — at which point the strip stops
 * reading as one row of alternatives and becomes a block of text above the
 * content, taking a third of a small screen to do it. The same choice `Stepper`
 * below already makes, for the same reason. `scrollbar-none` hides the bar; the
 * row is walked by swiping, and the active tab is scrolled to on arrival.
 */
export function Tabs({ tabs = [], value, onChange, className = '', variant = 'underline' }) {
  const solid = variant === 'solid';
  const stripRef = useRef(null);

  /**
   * Bring the active tab into view. On a phone the strip is wider than the
   * screen, so a tab five along — Education, Job — can be selected and still be
   * off the edge, leaving the row looking as though nothing is selected at all.
   * `nearest` so a tab already visible does not jolt the row.
   */
  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [value]);

  return (
    <div className={solid ? className : `border-b border-line ${className}`}>
      <div
        ref={stripRef}
        className={
          solid
            ? 'scrollbar-none inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-primary-50/70 p-1'
            : 'scrollbar-none flex items-center gap-1 overflow-x-auto'
        }
      >
        {tabs.map((t) => {
          const key = t.value ?? t;
          const active = key === value;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-current={active ? 'page' : undefined}
              data-active={active}
              className={`shrink-0 whitespace-nowrap ${
                solid
                  ? `rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                    active
                      ? 'bg-surface text-primary shadow-[0_1px_4px_rgba(0,49,88,0.12)]'
                      : 'text-text-muted hover:text-primary'
                  }`
                  : `-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${
                    active
                      ? 'border-accent text-primary'
                      : 'border-transparent text-text-muted hover:text-primary'
                  }`
              }`}
            >
              {t.label ?? t}
              {t.count != null && (
                <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] text-primary">{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Horizontal step indicator for multi-step forms.
 *
 * Data-driven like Tabs: pass `{ key, label, badge }` and it renders them. The
 * badge is whatever the caller wants inside the circle — a completion
 * percentage for steps with required fields, the step number for optional ones.
 *
 * Scrolls sideways rather than wrapping: a stepper that reflows onto two lines
 * stops reading as a single progression.
 */
export function Stepper({ steps = [], value, onChange, className = '' }) {
  const activeIndex = steps.findIndex((s) => s.key === value);

  return (
    <div className={`overflow-x-auto scrollbar-none ${className}`}>
      <div className="flex min-w-[640px] items-start">
        {steps.map((step, i) => {
          const active = step.key === value;
          const done = i < activeIndex;

          return (
            <div key={step.key} className="relative flex min-w-0 flex-1 flex-col items-center">
              <button
                type="button"
                onClick={() => onChange(step.key)}
                className={`mb-2 max-w-full truncate px-1 text-xs font-semibold transition-colors ${
                  active ? 'text-primary' : 'text-text-muted hover:text-primary'
                }`}
              >
                {step.label}
              </button>

              <div className="relative flex h-10 w-full items-center justify-center">
                {/* Runs from this circle's centre to the next one's. Every column
                    is flex-1, so a full-width line spans exactly that gap. */}
                {i < steps.length - 1 && (
                  <span className="absolute left-1/2 top-1/2 h-px w-full bg-line-strong" aria-hidden="true" />
                )}
                <button
                  type="button"
                  onClick={() => onChange(step.key)}
                  aria-current={active ? 'step' : undefined}
                  className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border text-xs font-bold transition-all ${
                    active
                      ? 'border-transparent bg-primary text-white'
                      : done
                        ? 'border-primary/30 bg-primary-50 text-primary'
                        : 'border-line-strong bg-surface text-text-muted'
                  }`}
                  // The glow marks where you are without moving anything, so the
                  // row keeps its rhythm as the active step changes.
                  style={active ? { boxShadow: '0 0 0 5px rgba(255,134,42,0.20)' } : undefined}
                >
                  {step.badge ?? i + 1}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Renders children only when the given module/action is granted.
 * With no `action`, gates on module visibility instead.
 */
export function PermissionGate({ module, action, fallback = null, children }) {
  const { can, isVisible } = usePermissions();
  const ok = action ? can(module, action) : isVisible(module);
  return ok ? children : fallback;
}
