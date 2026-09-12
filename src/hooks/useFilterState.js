import { useCallback, useRef, useState } from 'react';

/**
 * Filter / search / sort / page state for a list screen.
 *
 * Deliberately NOT in the URL. The page address describes which page you are on,
 * not what you have typed into it; the API URL is a separate thing entirely, and
 * a query string that mirrors every keystroke turns the address bar into noise.
 *
 * But the state still has to outlive the component: opening a member's details
 * page and coming back unmounts the list, and plain useState would drop the
 * search, the filters and the page number. So values are mirrored into a
 * module-level store keyed by `scope` and read back when the screen remounts.
 *
 * Scope is per screen, not per instance — two mounts of the members list are the
 * same list and should agree. The store lives for the session: a full reload
 * starts clean, which is the right default for a filter nobody asked to keep.
 */
const memory = new Map();

export function useFilterState(scope, defaults = {}) {
  const [values, setValues] = useState(() => ({ ...defaults, ...(memory.get(scope) ?? {}) }));

  // The ref is what makes two calls in one event handler compose — `setSearch(v)`
  // followed by `setPage(1)`. Merging off `values` instead would have both start
  // from the same render's snapshot, and the second would discard the first.
  const latest = useRef(values);
  latest.current = values;

  const get = useCallback((key, fallback = '') => {
    const value = values[key];
    return value === undefined || value === '' ? fallback : value;
  }, [values]);

  /** Patch one or more values. '' and null clear a key back to its default. */
  const set = useCallback((patch) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    memory.set(scope, next);
    setValues(next);
  }, [scope]);

  /** Forget this screen's filters, e.g. on sign-out. */
  const clear = useCallback(() => {
    memory.delete(scope);
    latest.current = { ...defaults };
    setValues({ ...defaults });
    // `defaults` is read only here, and callers pass a literal — depending on it
    // would rebuild this callback every render for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  return { get, set, clear };
}

/** Drops every screen's remembered filters. Called on sign-out. */
export function clearAllFilterState() {
  memory.clear();
}
