import { pickRows, toOptions } from '../../utils/options';
import { HIERARCHY_FIELDS } from '../../utils/userFormSchema';

// Values shared by the user form's sections. They live here rather than in the
// page because every section below needs them and none of them owns them.

// Static so Tailwind's scanner sees them — a computed class name is invisible to
// it and the rule never reaches the stylesheet.
export const COL_CLASS = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' };

// One step down from `.input-field`'s defaults, applied to every control this
// form renders. Seven steps of full-size inputs read as a wall; the dialogs keep
// the larger scale because they show two or three fields at a time.
export const FIELD_CLASS = '!py-2.5 text-sm';

/** Address-master rows name their columns inconsistently; read either form. */
export const readAddress = (row) => ({
  area: row?.area ?? row?.area_name ?? '',
  suburb: row?.suburb ?? row?.suburb_name ?? '',
  city: row?.city ?? row?.city_name ?? '',
  state: row?.state ?? row?.state_name ?? '',
  country: row?.country ?? row?.country_name ?? '',
});

/**
 * `GET /api/v1/address-master?pincode=` -> one row per selectable AREA.
 *
 * The endpoint answers with one row per PIN code and nests its areas:
 *
 *   [{ pincode, suburb, city, state, country, areas: [{ id, area, status }] }]
 *
 * The form needs the opposite shape. Area is the field the member picks when a
 * code covers more than one, and the other four follow whichever is chosen — so
 * each area becomes its own row carrying the shared address with it. Left
 * nested, `readAddress` finds no `area` at all, and since UserCreate requires
 * all five, the Address tab could never validate.
 *
 * Inactive areas are dropped. A row with no usable area is kept as-is rather
 * than discarded: the tab then reports the code as unresolved, which is true and
 * more useful than an empty list that reads as "PIN code not found".
 */
export function toAddressRows(data) {
  return pickRows(data).flatMap((row) => {
    const areas = (Array.isArray(row?.areas) ? row.areas : []).filter((a) => a?.status !== false);
    if (!areas.length) return [row];
    return areas.map((a) => ({ ...row, area: a?.area ?? a?.area_name ?? a?.name ?? '' }));
  });
}

/**
 * Fills the hierarchy levels the caller may not READ from their own record.
 *
 * `access` is `{ PRADESH, MANDAL, SABHA }`, each true only when full-context
 * reports `is_granted` on that module's READ action. A level they may read is
 * theirs to choose and is left exactly as it is; a level they may not has no
 * list to choose from, so it carries their own placement — the field shows the
 * name, disabled, and the id still travels in the payload.
 *
 * Applied on every hierarchy change, not just once on load. Choosing a new
 * Pradesh clears the levels below it, and a level the caller cannot re-pick
 * would otherwise be left blank and required, with no control able to fill it.
 */
export function applyOwnPlacement(values, me, access) {
  if (!me) return values;
  const next = { ...values };
  for (const level of HIERARCHY_FIELDS) {
    if (!access?.[level.module] && me[level.name] != null) next[level.name] = String(me[level.name]);
  }
  return next;
}

/**
 * The relation that founds a family, matched by NAME.
 *
 * `POST /users/{id}/family-member` with no `family_id` requires exactly this
 * relation, and `/api/v1/relations` carries no flag marking which row it is —
 * only `{ id, name, sort_order, is_active }`. Matching the name is the softer
 * of the two guesses available: renaming the row in the database breaks the
 * link loudly, where pinning id 1 would break silently on a reordered seed.
 * See §16 of PROJECT.md.
 */
export const isHeadRelation = (name) => String(name ?? '').trim().toLowerCase() === 'family head';

/** That relation's id, out of whatever `/api/v1/relations` returned. */
export const headRelationIdFrom = (relations) =>
  pickRows(relations?.data).find((r) => isHeadRelation(r?.name))?.id ?? null;

/** Resolves a stored id back to the label its lookup gave it. */
export const labelFor = (lookup, value) =>
  toOptions(lookup?.data).find((o) => o.value === String(value))?.label ?? null;
