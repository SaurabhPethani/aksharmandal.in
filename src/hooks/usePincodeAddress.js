import { useEffect, useMemo, useState } from 'react';
import { useAddressByPincode } from './useLookups';
import { readAddress, toAddressRows } from '../components/user-form/shared';

/**
 * The PIN-code lookup behind the form's Address step: its rows, which area is
 * picked, and the five mirrored fields kept in step with both.
 */
export function usePincodeAddress(values, setValues, enabled) {
  const query = useAddressByPincode(values.pincode, enabled);
  const rows = useMemo(() => toAddressRows(query.data), [query.data]);
  const [areaIndex, setAreaIndex] = useState(null);

  /**
   * Which area the member picked, as an index into `rows`.
   *
   * A new lookup resets it — an index into the previous PIN code's areas means
   * nothing under this one, and left alone it would silently apply. Except when
   * the form already holds an area the new rows contain: that is a saved
   * member's own address arriving back, and clearing it would make the form
   * demand a re-pick of something the record already has.
   *
   * A sole area is the other exception: a one-option choice is not a choice, so
   * it is selected on arrival and the dropdown simply shows it.
   */
  useEffect(() => {
    if (!rows.length) {
      setAreaIndex(null);
      return;
    }
    const current = String(values.area ?? '').trim();
    const saved = current
      ? rows.findIndex(r => readAddress(r).area.trim() === current)
      : -1;
    setAreaIndex(saved >= 0 ? saved : rows.length === 1 ? 0 : null);
    // Read at the moment the rows land, before the mirrors effect below has
    // run — depending on `values.area` would re-run this as that effect writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  /**
   * The five mirrors follow the lookup — but only once one has actually
   * happened. Without the guard, the disabled query's empty result would clear
   * the address the record just prefilled, on a step nobody has opened.
   *
   * City / State / Country are identical across a code's areas, so they fill as
   * soon as it resolves. Area AND SUBURB wait for the pick: one PIN code can
   * cover several suburbs, so until an area is chosen there is no single suburb
   * to show, and taking the first row's would quietly display the wrong one.
   */
  useEffect(() => {
    if (!query.isFetched) return;
    // A lookup that FAILED says nothing about the address, so the record's own
    // is left alone. Without this a 404 blanked all five on screen, and saving
    // from another tab would then have filed that blank as the member's
    // address.
    if (query.error) return;
    const first = rows[0];
    const picked = areaIndex == null ? null : rows[areaIndex];
    setValues(v => {
      if (!first) {
        return { ...v, area: '', suburb: '', city: '', state: '', country: '' };
      }
      const { city, state, country } = readAddress(first);
      const pickedAddress = picked ? readAddress(picked) : null;
      return {
        ...v,
        city,
        state,
        country,
        area: pickedAddress ? pickedAddress.area : '',
        suburb: pickedAddress ? pickedAddress.suburb : '',
      };
    });
  }, [rows, areaIndex, query.isFetched, query.error, setValues]);

  return { query, rows, areaIndex, setAreaIndex };
}
