import { startTransition, useEffect, useState } from 'react';

/**
 * How many of a list's rows to draw now: the first few at once, the rest a
 * moment later as a low-priority render that a touch can interrupt.
 *
 * Measured on the test phone (debug build, 2026-10-10): mounting 25 member
 * cards in one pass held the screen for 1.2 s after the data had arrived. The
 * first screenful costs a quarter of that.
 *
 * `key` names the set of rows. A new set starts small again; the same set
 * arriving again from a refetch does not.
 */
export function useStagedCount(total, key, first = 6) {
  const [stage, setStage] = useState({ key, count: first });
  const count = stage.key === key ? stage.count : first;

  useEffect(() => {
    if (count >= total) return undefined;
    const timer = setTimeout(() => {
      startTransition(() => setStage({ key, count: total }));
    }, 0);
    return () => clearTimeout(timer);
  }, [key, count, total]);

  return Math.min(count, total);
}
