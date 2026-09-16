import { MutationCache, QueryClient } from '@tanstack/react-query';

/**
 * The app's one React Query client — the same client as the web app, so the
 * hooks ported from it (src/hooks/use*.js) behave the same here.
 *
 * EVERY SUCCESSFUL WRITE REFRESHES EVERY READ. `mutationCache.onSuccess` below
 * invalidates every query after any successful mutation, once for the whole app,
 * so a new endpoint cannot forget to. Individual hooks may still invalidate
 * specific keys first; this is the backstop underneath them.
 *
 * A mutation that should NOT trigger it says so:
 *
 *   useMutation({ mutationFn, meta: { refreshOnSuccess: false } })
 */
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation?.meta?.refreshOnSuccess === false) return;
      queryClient.invalidateQueries();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A 401 has already been through the interceptor's silent refresh by the
      // time it surfaces, so retrying it would just repeat a known failure.
      retry: (failureCount, error) => {
        if (
          error?.status === 401 ||
          error?.status === 403 ||
          error?.status === 404
        )
          return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
