import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { Skeleton } from '../ui';

/**
 * The next few events, from `GET /api/v1/events`.
 *
 * Rendered only for a caller holding EVENTS:READ — that endpoint 403s without
 * it, so the card's query is gated rather than its output filtered (see
 * AdminDashboard). A REGISTER-only role never fires the request at all.
 *
 * UPCOMING MEANS UPCOMING. The endpoint returns every event ordered by date
 * DESCENDING — newest first, past events included — which is the right order
 * for a catalogue and exactly wrong for this card. So the rows are filtered to
 * today-or-later and re-sorted ASCENDING here: without that, "Upcoming Events"
 * would open with whatever happened longest ago.
 */

const LIMIT = 4;

/** Local midnight today, so an event happening later TODAY still counts. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** ms for an event's date, or null when it has none or it cannot be read. */
function dateOf(event) {
  if (!event?.date) return null;
  const ms = new Date(event.date).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** "10 Aug 2026, 7:00 PM" — the time only when the event carries one. */
function whenLabel(event) {
  const ms = dateOf(event);
  if (ms == null) return null;
  const day = new Date(ms).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  return event.time ? `${day}, ${event.time}` : day;
}

/**
 * Rotating tints, so consecutive rows are distinguishable at a glance.
 * Index-based and purely decorative — they carry no meaning, which is why they
 * are tints of the app's own accents rather than a data palette.
 */
const TINTS = [
  'bg-primary-50 text-primary',
  'bg-accent/10 text-accent',
  'bg-purple-50 text-purple-500',
  'bg-success-bg text-success-fg',
];

export default function UpcomingEvents({ events = [], loading, className = '' }) {
  const today = startOfToday();
  const upcoming = events
    .filter((e) => {
      const ms = dateOf(e);
      return ms != null && ms >= today;
    })
    .sort((a, b) => dateOf(a) - dateOf(b))
    .slice(0, LIMIT);

  return (
    <div className={`panel ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="panel-title">Upcoming Events</h3>
        <Link
          to="/events"
          className="flex-shrink-0 text-xs font-bold text-accent transition-colors hover:text-accent-hover"
        >
          View All
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : upcoming.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">Nothing scheduled yet.</p>
      ) : (
        <ul className="space-y-1">
          {upcoming.map((event, i) => (
            <li key={event.id}>
              <Link
                to="/events"
                className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-primary-50/50"
              >
                <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${TINTS[i % TINTS.length]}`}>
                  <CalendarDays className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-primary">
                    {event.title || 'Untitled event'}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {whenLabel(event) ?? 'Date to be confirmed'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
