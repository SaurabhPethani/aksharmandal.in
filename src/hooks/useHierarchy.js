import { useQuery } from '@tanstack/react-query';
import { hierarchyService } from '../services/hierarchyService';
import { groupsService } from '../services/groupsService';
import { transferService } from '../services/transferService';
import { HIERARCHY_CACHE } from './cache';

/**
 * One hierarchy level: its rows, plus the scope-wide member total the same
 * response already carries.
 *
 * `data` stays the array every caller expects. `memberCount` is the envelope's
 * top-level `member_count` — the caller's whole visible scope at this level,
 * counted by the backend and unaffected by skip/limit. It rides along free, so
 * the member total never costs a second request to the URL the grid just hit.
 * The drill-down endpoints don't send it and report null.
 */
function useHierarchyLevel(queryKey, queryFn, enabled) {
  const query = useQuery({ queryKey, queryFn, enabled, ...HIERARCHY_CACHE });
  return {
    ...query,
    data: Array.isArray(query.data?.data) ? query.data.data : undefined,
    // null rather than 0 when the field is absent, so the UI can tell "no count
    // from the backend" apart from "the scope really is empty".
    memberCount: typeof query.data?.member_count === 'number' ? query.data.member_count : null,
  };
}

export function useMyGroupLeaderships(enabled = true) {
  return useQuery({
    queryKey: ['my-group-leaderships'],
    enabled: Boolean(enabled),
    ...HIERARCHY_CACHE,
    queryFn: async () => {
      const rows = await groupsService.myLeaderships();
      return Array.isArray(rows) ? rows : [];
    },
  });
}

export function usePradeshList(enabled) {
  return useHierarchyLevel(['pradesh-list'], () => hierarchyService.pradeshList(), enabled);
}

export function useMandals(pradeshId, enabled) {
  return useHierarchyLevel(
    ['mandals', pradeshId ?? 'all'],
    () => (pradeshId ? hierarchyService.mandalsOfPradesh(pradeshId) : hierarchyService.mandalList()),
    enabled
  );
}

export function useSabhas(mandalId, enabled) {
  return useHierarchyLevel(
    ['sabhas', mandalId ?? 'all'],
    () => (mandalId ? hierarchyService.sabhasOfMandal(mandalId) : hierarchyService.sabhaList()),
    enabled
  );
}

/**
 * One Sabha by id, carrying its `head` / `DB_head` arrays — for cards that
 * need the head assignments and not just the name (My Spiritual Friends).
 * Cached like the rest of the hierarchy so opening the same card twice does
 * not re-fetch.
 */
export function useSabhaById(sabhaId, enabled = true) {
  return useQuery({
    queryKey: ['sabha', sabhaId ?? null],
    queryFn: () => hierarchyService.sabhaById(sabhaId),
    enabled: Boolean(sabhaId) && enabled,
    ...HIERARCHY_CACHE,
  });
}

/** Companion to `useSabhaById` for the Mandal level. Same shape, same cache. */
export function useMandalById(mandalId, enabled = true) {
  return useQuery({
    queryKey: ['mandal', mandalId ?? null],
    queryFn: () => hierarchyService.mandalById(mandalId),
    enabled: Boolean(mandalId) && enabled,
    ...HIERARCHY_CACHE,
  });
}

/**
 * TRANSFER-ONLY destination pickers (id + name). These call the transfer
 * feature's own endpoints, which are clamped ONE band wider than READ (Sabha
 * authority → own Mandal, Mandal authority → own Pradesh) — so a Sabha Head can
 * actually see the sibling Sabhas they are allowed to transfer INTO, which the
 * H5-clamped `useSabhas`/`useMandals` (READ scope) cannot show. Use these ONLY
 * in the transfer dialog; never for the hierarchy tree.
 */
export function useTransferDestinationMandals(enabled) {
  return useHierarchyLevel(
    ['transfer-dest-mandals'],
    () => transferService.destinationMandals(),
    enabled
  );
}

export function useTransferDestinationSabhas(mandalId, enabled) {
  return useHierarchyLevel(
    ['transfer-dest-sabhas', mandalId ?? 'none'],
    () => transferService.destinationSabhas(mandalId),
    // Never fall back to an unscoped list: without a Mandal there is nothing to
    // ask for, and a blank id would post a bad query param.
    enabled && Boolean(mandalId)
  );
}

/**
 * Active groups + their member entities, for the Hierarchy mind-map overlay.
 *
 * ONE read-only call (`GET /groups/in-scope`), gated on HIERARCHY:READ — so every
 * hierarchy reader sees group nodes, not only GROUP:MANAGE holders. Returns each
 * group's `members` (entity ids to nest under a parent) and `leaders` (names)
 * already assembled server-side. `api.get` unwraps the envelope, so the result
 * is the array directly. Fails soft to [] so the tree never breaks on a group
 * read error.
 */
export function useHierarchyGroups(enabled) {
  return useQuery({
    queryKey: ['hierarchy-groups-overlay'],
    enabled: Boolean(enabled),
    ...HIERARCHY_CACHE,
    queryFn: async () => {
      const rows = await groupsService.inScope();
      return Array.isArray(rows) ? rows : [];
    },
  });
}