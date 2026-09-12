import { MutationCache, QueryClient } from '@tanstack/react-query';

/**
 * The app's one React Query client.
 *
 * EVERY SUCCESSFUL WRITE REFRESHES EVERY READ.
 *
 * A create, update or delete used to leave the screen showing what was loaded
 * before it — the row saved, the API agreed, and the table went on displaying
 * the old value until the page was reloaded by hand. That is what the
 * `mutationCache.onSuccess` below fixes, and it fixes it once for every mutation
 * in the app rather than one hook at a time: a new endpoint cannot forget to
 * invalidate, because nothing has to remember.
 *
 * It is a refresh of the DATA, not of the page. `window.location.reload()` would
 * also work and would be worse: it re-downloads the whole app, and it throws
 * away the filters, the open tab, the expanded rows and the scroll position that
 * the person was mid-way through using. This asks the server for everything on
 * screen again and re-renders with the answer, which is the part they wanted.
 *
 * Individual hooks may still invalidate or patch specific keys — that is a
 * narrower, faster update and runs first. This is the backstop underneath it.
 *
 * A mutation that should NOT trigger it says so:
 *
 *   useMutation({ mutationFn, meta: { refreshOnSuccess: false } })
 *
 * which is for writes that change nothing a query reads — downloading a file is
 * the only one today.
 */
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation?.meta?.refreshOnSuccess === false) return;
      // No filter: every key is marked stale, and everything currently on screen
      // refetches. Keys that are not mounted refetch when they next are, so a
      // list behind a tab cannot show a value the write already changed.
      queryClient.invalidateQueries();
    },
  }),
  defaultOptions: {
    queries: {
      // Server data here changes on human timescales; refetching on every window
      // focus creates noise and extra load for no benefit.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // A 401 has already been through the interceptor's silent refresh by the
      // time it surfaces, so retrying it would just repeat a known failure.
      retry: (failureCount, error) => {
        if (error?.status === 401 || error?.status === 403 || error?.status === 404) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
