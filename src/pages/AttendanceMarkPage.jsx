import { useEffect, useMemo, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, CalendarDays, Clock, Mic } from 'lucide-react';
import { useSabhaDetails } from '../hooks';
import { EmptyState, ErrorState, PageHeader, PageLoader } from '../components/ui';
import { Breadcrumbs } from '../components/Navigation';
import AttendanceMarker from '../components/attendance/AttendanceMarker';
import { readDate, readTime } from '../utils/dates';
import { pickRows } from '../utils/options';

// Marking attendance for ONE sitting — the scanner, the member list and the
// writes, on the sitting whose Mark link was followed.
//
// A PAGE, NOT A POPUP. This was a dialog, and the dialog was the wrong container
// for it: taking attendance is not a quick confirmation, it is standing at a
// door for half an hour with a camera open, a member list, a search box and a
// pager. All of that inside a `max-h-[92vh]` panel meant the list scrolled
// inside a box that scrolled inside a page, the camera had a fraction of the
// screen, and the whole session was one stray backdrop click from closing. As a
// page it gets the full width, the browser's own Back, and a URL that can be
// reopened or sent to whoever is actually on the door.
//
// There is NO "select Sabha" control, and that is the point: the sitting was
// chosen by the link that opened this, so asking again would be asking the same
// question twice — and getting a different answer to it is exactly how
// attendance ends up on the wrong Sabha. What replaces it is the summary strip,
// which is read once before the first scan.
//
// Gated on ATTENDANCE:CREATE by the router, so a typed URL is refused with a 403
// rather than a 404.

const ATTENDANCE_PATH = '/attendance';

/** One fact in the summary strip. Absent facts are not rendered at all. */
function Fact({ icon: Icon, label, value, tnum = false }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-faint">{label}</p>
        <p className={`truncate text-sm font-semibold text-primary ${tnum ? 'tnum' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

export default function AttendanceMarkPage() {
  const { sabhaDetailId } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();

  /**
   * The sitting itself. Three sources, cheapest first — the fetch is a
   * fallback, not the default path:
   *
   *   1. Router state, when the Attendance page handed the row off on the click.
   *   2. The tab caches already populated by /attendance (Regular and Special),
   *      keyed the same way useSabhaDetails builds its keys.
   *   3. A fresh list fetch, only if neither of the above has it — the case
   *      for a bookmarked URL, a hard reload, or a sitting whose tab was never
   *      opened this session.
   *
   * The fallback keeps `status: null` so a CANCELLED sitting is still FOUND
   * and can say so, instead of falling through to "no such sitting" — the
   * tab caches carry only `status=true` (regular) or the special-tab set, so
   * a cancelled sitting reached by deep link won't live in either.
   */
  const preloadedSabha = useMemo(() => {
    const fromState = location.state?.sabha;
    if (fromState && String(fromState.id) === String(sabhaDetailId)) return fromState;

    const tabKeys = [
      ['sabha-details', 'regular', true, 'any'],
      ['sabha-details', 'special', 'any', 'any'],
    ];
    for (const key of tabKeys) {
      const data = queryClient.getQueryData(key);
      const hit = pickRows(data).find((r) => String(r.id) === String(sabhaDetailId));
      if (hit) return hit;
    }
    return null;
  }, [location.state, queryClient, sabhaDetailId]);

  const sabhasQ = useSabhaDetails({ status: null }, !preloadedSabha);
  const sabha = useMemo(
    () =>
      preloadedSabha ??
      pickRows(sabhasQ.data).find((r) => String(r.id) === String(sabhaDetailId)) ??
      null,
    [preloadedSabha, sabhasQ.data, sabhaDetailId]
  );

  const when = readDate(sabha?.date);
  const time = readTime(sabha?.time);
  const title = sabha?.special_sabha_name || sabha?.sabha_name || 'Mark Attendance';

  const header = (
    <PageHeader
      title="Mark Attendance"
      subtitle={sabha ? title : undefined}
      breadcrumbs={
        <Breadcrumbs items={[{ label: 'Attendance', to: ATTENDANCE_PATH }, { label: 'Mark Attendance' }]} />
      }
    />
  );

  if (sabhasQ.isLoading) return <PageLoader label="Loading Sabha" />;

  if (sabhasQ.error) {
    return (
      <div className="space-y-5">
        {header}
        <div className="card">
          <ErrorState error={sabhasQ.error} onRetry={sabhasQ.refetch} title="Could not load this Sabha" />
        </div>
      </div>
    );
  }

  if (!sabha) {
    return (
      <div className="space-y-5">
        {header}
        <div className="card">
          <EmptyState
            icon={CalendarDays}
            title="Sabha not found"
            hint="This sitting is not in your scope, or it no longer exists."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}

      {/* Verify before marking: which sitting, when, and who is speaking. */}
      <div className="card">
        <h2 className="font-display text-base font-bold leading-snug text-primary">{title}</h2>
        {/* Auto-fit rather than named breakpoints: the strip carries three facts
            or four depending on whether the sitting names a Vakta, and the
            breakpoint version stacked all of them into a column below 640px —
            four rows of one short fact each, on the screen most likely to be
            held at a door. `minmax(7rem,1fr)` fits as many across as the width
            actually allows, which is three on a phone and four from there up,
            and never overflows. The values already truncate. */}
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-3">
          <Fact icon={CalendarDays} label="Date" value={when?.date} tnum />
          <Fact icon={CalendarDays} label="Day" value={when?.day} />
          <Fact icon={Clock} label="Time" value={time} tnum />
          <Fact icon={Mic} label="Vakta" value={sabha?.vakta || null} />
        </div>
      </div>

      <div className="card">
        <AttendanceMarker sabhaDetailId={sabha.id} sabha={sabha} />
      </div>

      <BackToTop />
    </div>
  );
}

/**
 * Floating "back to top" button.
 *
 * Only appears once the reader has scrolled past ~600px — enough that the
 * summary strip and the counter tiles are off-screen — because the whole
 * point is to get back to the numbers when you're deep in a 200-name list.
 * Fixed to bottom-right, thumb-reachable on a phone.
 *
 * Uses `passive: true` on scroll so the listener never blocks the browser's
 * scroll thread, and re-attaches nothing across renders (no dependencies).
 */
function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const THRESHOLD = 600;
    const onScroll = () => setShow(window.scrollY > THRESHOLD);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      aria-label="Back to top of page"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-5 right-5 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-[0_2px_10px_rgba(0,49,88,0.35)] transition-transform hover:scale-105 active:scale-95 sm:h-12 sm:w-12"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
