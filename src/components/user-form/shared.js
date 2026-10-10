import { pickRows, toOptions } from '../../utils/options';
import { HIERARCHY_FIELDS } from '../../utils/userFormSchema';

// Values shared by the user form's sections. They live here rather than in the
// page because every section below needs them and none of them owns them.

/** Address-master rows name their columns inconsistently; read either form. */
export const readAddress = row => ({
  area: row?.area ?? row?.area_name ?? '',
  suburb: row?.suburb ?? row?.suburb_name ?? '',
  city: row?.city ?? row?.city_name ?? '',
  state: row?.state ?? row?.state_name ?? '',
  country: row?.country ?? row?.country_name ?? '',
});

/**
 * One row per selectable AREA, out of the address master's two levels of
 * nesting: a PIN-code row holds suburbs, and each suburb holds areas. The
 * suburb is carried down onto every area under it, because one PIN code can
 * cover several and the area is what says which.
 *
 * A row whose suburbs are all inactive (or absent) is kept as itself, so a
 * thinly populated PIN code still resolves its city / state / country.
 */
export function toAddressRows(data) {
  return pickRows(data).flatMap(row => {
    const suburbs = (Array.isArray(row?.suburbs) ? row.suburbs : []).filter(
      s => s?.status !== false,
    );
    const areaRows = suburbs.flatMap(s =>
      (Array.isArray(s?.areas) ? s.areas : [])
        .filter(a => a?.status !== false)
        .map(a => ({
          ...row,
          area: a?.area ?? a?.area_name ?? a?.name ?? '',
          suburb: s?.name ?? s?.suburb ?? '',
        })),
    );
    return areaRows.length ? areaRows : [row];
  });
}

export function applyOwnPlacement(values, me, access) {
  if (!me) return values;
  const next = { ...values };
  for (const level of HIERARCHY_FIELDS) {
    if (!access?.[level.module] && me[level.name] != null)
      next[level.name] = String(me[level.name]);
  }
  return next;
}

export const isHeadRelation = name =>
  String(name ?? '')
    .trim()
    .toLowerCase() === 'family head';

/** That relation's id, out of whatever `/api/v1/relations` returned. */
export const headRelationIdFrom = relations =>
  pickRows(relations?.data).find(r => isHeadRelation(r?.name))?.id ?? null;

/** Resolves a stored id back to the label its lookup gave it. */
export const labelFor = (lookup, value) =>
  toOptions(lookup?.data).find(o => o.value === String(value))?.label ?? null;
