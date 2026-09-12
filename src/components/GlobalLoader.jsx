import { useIsFetching, useIsMutating } from '@tanstack/react-query';

/**
 * One loading indicator for the whole app.
 *
 * Every request in this project goes through React Query, so `useIsFetching` and
 * `useIsMutating` see all of them — list pages, dropdowns, search, filters,
 * pagination, mutations — without a single page having to report its own state.
 * That is the point: a per-screen loader can only ever cover the screen that
 * remembered to add one.
 *
 * It appears the moment a request starts and leaves when the last one settles,
 * success or failure. Screen-level skeletons stay where they are: this answers
 * "something is happening", they answer "here is the shape of what is coming".
 */
export default function GlobalLoader() {
  const busy = useIsFetching() + useIsMutating() > 0;

  return (
    <div
      // Always mounted and faded rather than conditionally rendered, so a quick
      // request cannot flash a bar into existence and rip it out a frame later.
      className={`pointer-events-none fixed inset-x-0 top-0 z-[90] h-1 transition-opacity duration-200 ${
        busy ? 'opacity-100' : 'opacity-0'
      }`}
      role="status"
      aria-live="polite"
      aria-label={busy ? 'Loading, please wait' : ''}
    >
      <div className="h-full w-full overflow-hidden bg-accent/20">
        <div className="animate-loader-sweep h-full w-1/3 bg-accent" />
      </div>
    </div>
  );
}
