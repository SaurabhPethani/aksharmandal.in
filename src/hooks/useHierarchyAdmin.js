import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LEVEL_WRITES } from '../services/hierarchyService';

/**
 * ── WHERE THE HIERARCHY SCREEN'S PEOPLE COME FROM ────────────────────────────
 *
 * Off the rows themselves. GET /pradesh, /pradesh/{id}/mandals and
 * /mandal/{id}/sabhas each return `head` and `DB_head` — lists of
 * `HeadUser { username, mobile }`, already filtered to the ACTIVE holders of
 * that row's Head and DB Manager roles — plus `member_count`.
 *
 * This file used to hold a `useHierarchyPeople` hook that got the same
 * information a much longer way: read the role catalogue, resolve five role
 * names to ids against it, then fire GET /users/by-role/{id} five times and
 * bucket every returned user by hierarchy id. Six requests, a role-name
 * matching table (constants/roles.js HEAD_ROLES / COUNTED_ROLES) to keep in step
 * with the backend's spellings, and a whole-directory download to render one
 * name per row. All of it existed because the hierarchy endpoints did not carry
 * a head. They do now, so it is gone — the tree renders from the three requests
 * it was already making.
 */


/**
 * Writes for the hierarchy tree — one hook for all three levels.
 *
 * Every success invalidates the three level caches rather than patching a row in
 * place. A rename changes the parent-name shown on children, a create changes
 * the list its parent renders, and a deactivate changes nothing visible until
 * the row is re-read — patching one entry would leave the other two stale, and
 * the lists are small enough that a refetch is cheaper than the bookkeeping.
 */
/**
 * Levels whose create/update schema declares `location`.
 *
 * ALL THREE, re-verified against the OpenAPI document on 2026-08-11:
 * `PradeshCreate`, `PradeshUpdate`, `MandalCreate`, `MandalUpdate`, `SabhaCreate`
 * and `SabhaUpdate` each carry `location`, and the three Response schemas return
 * it. This was `new Set(['sabha'])` — true when it was written, and by then no
 * longer: a Pradesh or Mandal venue could be READ off the record but never set,
 * so the tree would have shown an empty one for every row.
 *
 * The gate stays rather than being deleted. It is what stops `location` being
 * sent to an endpoint that would accept and discard it, which is the failure
 * this project's contract checks exist to catch — and the next level added here
 * may well not have the field.
 */
export const LOCATION_LEVELS = new Set(['pradesh', 'mandal', 'sabha']);

export function useHierarchyMutations() {
  const qc = useQueryClient();

  const invalidate = () => {
    for (const key of ['pradesh-list', 'mandals', 'sabhas']) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const save = useMutation({
    /**
     * `node` present -> update that id, else create. The caller passes the level
     * so this stays one mutation instead of six, which also means one `isPending`
     * for the dialog to disable itself on.
     *
     * `location` is gated rather than passed through, on `LOCATION_LEVELS`:
     * sending it to a schema that does not declare it would be accepted,
     * discarded, and reported as saved — the exact failure the field-name checks
     * in this project exist to prevent. All three levels declare it today.
     *
     * An empty box sends `null`, not `''`: the field is `string | null` on both
     * schemas, so null is how it is cleared once something has been stored.
     */
    mutationFn: ({ level, node, name, parentIds, location }) => {
      const writes = LEVEL_WRITES[level];
      const extra = LOCATION_LEVELS.has(level)
        ? { location: String(location ?? '').trim() || null }
        : {};
      if (node) return writes.update(node.id, { [writes.nameKey]: name, ...extra });
      return writes.create({ [writes.nameKey]: name, ...parentIds, ...extra });
    },
    onSuccess: invalidate,
  });

  // Deliberately separate from `save`: the two are never in flight together, and
  // sharing one mutation would make the edit dialog spin while a row elsewhere
  // is being deactivated.
  const setStatus = useMutation({
    mutationFn: ({ level, node, status }) =>
      LEVEL_WRITES[level].update(node.id, { status }),
    onSuccess: invalidate,
  });

  return { save, setStatus };
}
