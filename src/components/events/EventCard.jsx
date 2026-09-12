import { BarChart3, CalendarDays, MapPin, Pencil, Power } from 'lucide-react';
import { apiUrl } from '../../api/client';
import { NIMIT_SEVAK_LABEL, DOING_POOJA_LABEL } from '../../utils/memberFlags';

// On-screen names for the Level-2 target flags the API sends in `target_flags`.
const FLAG_LABELS = {
  is_ambrish: 'Ambrish',
  is_nimit_sevak: NIMIT_SEVAK_LABEL,
  doing_pooja: DOING_POOJA_LABEL,
};

/**
 * One event.
 *
 * The three counts come from the server (`total_registered_count` and friends);
 * nothing here counts registrations, so the card cannot disagree with the list
 * it was rendered from.
 *
 * THE WHOLE CARD IS THE CONTROL that opens the event's popup, where registering
 * now happens. It is a div with button semantics rather than a `<button>`,
 * because Edit and Deactivate are buttons of their own and nesting one inside
 * another is invalid HTML — those two stop the click from reaching the card, so
 * editing an event never opens its registration popup underneath.
 *
 * WITHOUT `onOpen` THE CARD IS NOT A CONTROL AT ALL — no cursor, no focus ring,
 * no role, no handler. That is the EVENTS:REGISTER-less caller: the popup exists
 * only to register, so a card that opened one showing nothing to do would be a
 * worse answer than a card that does not respond. They keep the full read view.
 */

/** "31 Aug 2026", or "20 Aug 2026 · 21:00" when a time is set. */
function whenLabel(date, time) {
  if (!date) return null;
  const d = new Date(date);
  const day = Number.isNaN(d.getTime())
    ? String(date)
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return time ? `${day} · ${time}` : day;
}

function Stat({ value, label, tone }) {
  return (
    <div className={`flex-1 rounded-control border px-2 py-2 text-center ${tone}`}>
      <p className="tnum font-display text-lg font-bold leading-none">{value ?? 0}</p>
      <p className="mt-1 text-[0.65rem] font-bold uppercase tracking-wide opacity-70">{label}</p>
    </div>
  );
}

export default function EventCard({ event, categoryNames, canUpdate, busy, onOpen, onEdit, onToggleStatus, onResults }) {
  const active = event.status !== false;
  const when = whenLabel(event.date, event.time);

  /** Keeps a nested control's click from also opening the popup. */
  const only = (fn) => (e) => { e.stopPropagation(); fn(event); };

  // Spread rather than branched in the JSX: without onOpen the card carries no
  // role, no tabIndex and no handlers, so assistive tech is not told it is a
  // control that then does nothing.
  const openable = onOpen
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `Register for ${event.title}`,
        onClick: () => onOpen(event),
        onKeyDown: (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault(); // Space would scroll the page
          onOpen(event);
        },
      }
    : {};

  return (
    <div
      {...openable}
      className={`flex flex-col overflow-hidden rounded-card border border-line-soft bg-surface shadow-card transition-all duration-200 ${
        onOpen
          ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2'
          : ''
      }`}
    >
      <div className="relative h-36 bg-bg">
        {event.image ? (
          <img
            /*
              `event.image` can be one of:
                • an absolute URL   — `https://…` (hosted elsewhere)
                • a data URI        — `data:image/…;base64,…` (inlined,
                                      how the current events were saved)
                • a blob URL        — `blob:…` (rare, used for previews)
                • a server path     — `/uploads/…` (needs the API origin)
              The regex catches every scheme + protocol-relative URLs; any
              value the browser can dereference on its own is passed
              through, and only bare server paths get the apiUrl prefix.
              Was `startsWith('http')` — the data URIs stored on prod fell
              through that check and were prefixed with the API host,
              producing 404s on every event card.
            */
            src={/^(https?:|data:|blob:|\/\/)/i.test(event.image) ? event.image : apiUrl(event.image)}
            alt=""
            // `object-contain`, not `cover`: an event image is often a poster or
            // a wide strip whose top/bottom carries the point, so fit the WHOLE
            // image inside the banner (centered on `bg-bg`) rather than filling
            // the box and cropping it.
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CalendarDays className="h-10 w-10 text-line-strong" />
          </div>
        )}
        <span
          className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            active ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success-fg' : 'bg-danger-fg'}`} />
          {active ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <p className="font-display text-base font-bold leading-tight text-primary">{event.title}</p>
          {event.category && <p className="text-sm font-semibold text-accent">{event.category}</p>}
        </div>

        {when && (
          <p className="flex items-center gap-1.5 text-sm text-text-muted">
            <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
            {when}
          </p>
        )}
        {event.location && (
          <p className="flex items-center gap-1.5 text-sm text-text-muted">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            {event.location}
          </p>
        )}
        {event.description && (
          <p className="text-sm leading-snug text-text-faint">{event.description}</p>
        )}

        {/* Who the event is aimed at. The API sends category IDs; the names come
            from the master-data lookup the page already loads. */}
        {(event.user_category?.length > 0 || event.target_flags?.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {event.user_category?.map((id) => (
              <span key={`c-${id}`} className="rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
                {categoryNames?.get(id) ?? `#${id}`}
              </span>
            ))}
            {/* Level-2 flag chips carry an accent tint so they read as a further
                narrowing of the demographic categories, not another category. */}
            {event.target_flags?.map((key) => (
              <span key={`f-${key}`} className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {FLAG_LABELS[key] ?? key}
              </span>
            ))}
          </div>
        )}

        <div className="mt-1 flex gap-2">
          <Stat value={event.total_registered_count} label="Total" tone="border-line-soft bg-bg text-primary" />
          <Stat value={event.confirmed_registered_count} label="Confirmed" tone="border-success-fg/20 bg-success-bg text-success-fg" />
          <Stat value={event.denied_registered_count} label="Denied" tone="border-danger-fg/20 bg-danger-bg text-danger-fg" />
        </div>

        {canUpdate && (
          <div className="mt-auto flex gap-2 pt-2">
            <button
              type="button"
              onClick={only(onEdit)}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-control border border-line-strong px-3 py-2 text-xs font-semibold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-white disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={only(onToggleStatus)}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-control border border-line-strong px-3 py-2 text-xs font-semibold text-primary transition-colors hover:border-primary disabled:opacity-50"
            >
              <Power className="h-3.5 w-3.5" />
              {active ? 'Deactivate' : 'Activate'}
            </button>
            {/* Only when there is a poll to read — an event with no custom
                fields has nothing to tally. */}
            {onResults && event.custom_fields?.length > 0 && (
              <button
                type="button"
                onClick={only(onResults)}
                disabled={busy}
                title="View responses"
                aria-label="View responses"
                className="inline-flex items-center justify-center gap-1.5 rounded-control border border-line-strong px-3 py-2 text-xs font-semibold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-white disabled:opacity-50"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
