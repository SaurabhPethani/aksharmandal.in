import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { masterDataService } from '../services/masterDataService';
import { LOOKUP_CACHE } from './cache';

/**
 * One Master Data list. `tab` is an entry from MASTER_DATA_TABS.
 *
 * `includeInactive` is part of the query key, not just the request: the two
 * result sets are genuinely different lists, and sharing a cache entry would
 * show the active-only rows for a moment after ticking the box.
 */
export function useMasterDataList(tab, { includeInactive = false, enabled = true } = {}) {
  return useQuery({
    queryKey: ['master-data', tab.key, { includeInactive }],
    queryFn: () =>
      tab.kind === 'address'
        ? masterDataService.addressMaster({ includeInactive })
        : masterDataService.list(tab.path, { includeInactive }),
    enabled,
    ...LOOKUP_CACHE,
  });
}

/**
 * Create / rename / set-status for one tab.
 *
 * Invalidates BOTH the admin list and the plain lookup caches: these endpoints
 * also feed the Add/Edit User form's dropdowns, so archiving a relation here has
 * to stop it appearing there without a reload.
 */
export function useMasterDataMutations(tab) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['master-data', tab.key] });
    // The dropdown lookups are keyed by their own names elsewhere; refetching
    // everything lookup-shaped is cheaper than tracking which screens cache what.
    qc.invalidateQueries({ queryKey: ['lookups'] });
    qc.invalidateQueries({ queryKey: ['roles-for-hierarchy'] });
  };

  const save = useMutation({
    mutationFn: ({ row, name }) =>
      row
        ? masterDataService.update(tab.path, row.id, { name })
        : masterDataService.create(tab.path, { name }),
    onSuccess: invalidate,
  });

  // Its own mutation, and it sends ONLY the status key. The edit form has no
  // status field, so a rename can never flip a row off and vice versa.
  const setStatus = useMutation({
    mutationFn: ({ row, active }) =>
      masterDataService.update(tab.path, row.id, { [tab.statusKey]: active }),
    onSuccess: invalidate,
  });

  return { save, setStatus };
}

/** Whether a row is active, read through the tab's own spelling of the flag. */
export const isRowActive = (row, tab) => Boolean(row?.[tab.statusKey]);

/**
 * Create one Address Master entry: a pincode, and optionally its first area.
 *
 * Two sequential calls, because the area needs the `pincode_id` the first call
 * returns. They are NOT a transaction: if the pincode is created and the area
 * then fails, the pincode stays. That is the honest outcome to report — the
 * address exists and only the area is missing — so the error says so rather than
 * implying nothing was saved.
 */
export function useAddressMutations() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ area, ...pincode }) => {
      const created = await masterDataService.createPincode(pincode);
      const pincodeId = created?.data?.id;

      const trimmedArea = String(area ?? '').trim();
      if (!trimmedArea) return created;

      if (pincodeId == null) {
        throw new Error(
          'The pincode was saved, but the response carried no id, so the area could not be added. Add it from the list.'
        );
      }

      try {
        await masterDataService.createArea({ pincode_id: pincodeId, area: trimmedArea });
      } catch (err) {
        throw new Error(
          `The pincode was saved, but its area could not be added: ${err?.message ?? 'unknown error'}`
        );
      }
      return created;
    },
    // Runs on failure too: a half-completed create still changed the list, and
    // leaving the stale one on screen would hide the pincode that did save.
    onSettled: () => qc.invalidateQueries({ queryKey: ['master-data', 'address-master'] }),
  });
}

/** The pincode's own columns — everything on a row that is NOT the area. */
const PINCODE_FIELDS = ['pincode', 'suburb', 'city', 'state', 'country'];

/**
 * Edit one Address Master row.
 *
 * A row is one area shown against its pincode, so a single edit can touch two
 * different tables. What changed decides which endpoint is called:
 *
 *   area renamed              PATCH /address-master/areas/{area_id}
 *   pincode/geography changed PATCH /address-master/pincodes/{pincode_id}
 *   both                      both, pincode first
 *   an area typed onto a row
 *   that had none             POST  /address-master/areas
 *
 * Only changed keys are sent — both PATCH bodies are fully optional — so editing
 * a city cannot silently rewrite the pincode, and two people editing different
 * columns of the same address do not clobber each other.
 */
export function useAddressUpdate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ row, values }) => {
      const changedPincode = {};
      for (const f of PINCODE_FIELDS) {
        const next = String(values[f] ?? '').trim();
        if (next !== String(row[f] ?? '')) changedPincode[f] = next;
      }

      const nextArea = String(values.area ?? '').trim();
      const areaChanged = nextArea !== String(row.area ?? '');

      if (!Object.keys(changedPincode).length && !areaChanged) {
        throw new Error('Nothing was changed.');
      }

      // Blanking an existing area is not an edit this screen can make: the API
      // has no delete, and `area` is min_length=1 so an empty string 422s.
      // Saying so beats letting the server reject it with a schema message.
      if (areaChanged && !nextArea && row.areaId != null) {
        throw new Error('Area cannot be left blank. Rename it, or leave it as it is.');
      }

      if (Object.keys(changedPincode).length) {
        await masterDataService.updatePincode(row.pincodeId, changedPincode);
      }

      if (areaChanged && nextArea) {
        // A row with no area yet is the "no areas mapped" placeholder — typing a
        // name there maps the first one rather than editing a row that is not there.
        if (row.areaId == null) {
          await masterDataService.createArea({ pincode_id: row.pincodeId, area: nextArea });
        } else {
          await masterDataService.updateArea(row.areaId, { area: nextArea });
        }
      }

      return { detail: 'Address updated.' };
    },
    // As with the create: a partially-applied edit still changed the list.
    onSettled: () => qc.invalidateQueries({ queryKey: ['master-data', 'address-master'] }),
  });
}
