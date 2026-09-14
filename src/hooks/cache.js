// Cache profiles, shared by the domain hook files.
//
// Three profiles exist in total; the third is React Query's own default
// (30 s stale / 5 min gc, set in utils/queryClient.js) and is used by anything
// that does not name one of these. Keeping the two overrides here rather than in
// each domain file stops "how long is a lookup cached for" having two answers.

/**
 * Pradesh / Mandal / Sabha. Hierarchy rarely changes within a session, so it is
 * cached longer than the default and reused across drill-downs.
 */
export const HIERARCHY_CACHE = { staleTime: 5 * 60_000, gcTime: 10 * 60_000 };

/**
 * Master data, roles, follow-up people. Changes far less often than a session
 * lasts, and is shared by every screen that opens the user form.
 */
export const LOOKUP_CACHE = { staleTime: 10 * 60_000, gcTime: 30 * 60_000 };
