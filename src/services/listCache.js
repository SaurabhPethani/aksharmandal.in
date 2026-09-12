// Patching a single row inside a cached list response.
//
// A popup that changes one field of one member should cost one request — the
// write itself — not two. Invalidating the list would throw away a 100-record
// block and fetch it again to alter a name the frontend already knows.
//
// Pure and shape-agnostic: it handles the paginated envelope and the bare array
// alike, so it works whether or not an endpoint has server paging yet.

const ROW_KEYS = ['items', 'results', 'records', 'data', 'users', 'list'];

/**
 * Returns `data` with the row whose id matches `id` merged with `changes`.
 *
 * The original reference is returned untouched when the row is not in this
 * block. That matters: this runs against every cached block of the list, and
 * returning a fresh object each time would re-render every page the user has
 * visited in order to change one of them.
 *
 * `idKey` names the row's identity column, for the endpoints that do not call
 * it `id` — the Job Portal returns `job_id` on a post and `application_id` on
 * an application. Defaults to `id`, so every existing call site is unaffected.
 */
export function patchRowInList(data, id, changes, { idKey = 'id' } = {}) {
  if (!data || !changes) return data;

  const applyTo = (rows) => {
    let found = false;
    const next = rows.map((row) => {
      if (String(row?.[idKey]) !== String(id)) return row;
      found = true;
      return { ...row, ...changes };
    });
    return found ? next : rows;
  };

  if (Array.isArray(data)) {
    const next = applyTo(data);
    return next === data ? data : next;
  }

  if (typeof data !== 'object') return data;

  for (const key of ROW_KEYS) {
    if (!Array.isArray(data[key])) continue;
    const next = applyTo(data[key]);
    return next === data[key] ? data : { ...data, [key]: next };
  }

  return data;
}

/** Drops a row from a cached list — for a delete, where no field can stand in. */
export function removeRowFromList(data, id) {
  if (!data) return data;

  const without = (rows) => {
    const next = rows.filter((row) => String(row?.id) !== String(id));
    return next.length === rows.length ? rows : next;
  };

  if (Array.isArray(data)) {
    const next = without(data);
    return next === data ? data : next;
  }
  if (typeof data !== 'object') return data;

  for (const key of ROW_KEYS) {
    if (!Array.isArray(data[key])) continue;
    const next = without(data[key]);
    if (next === data[key]) return data;
    // The total moves with the row, or the pager would keep counting it.
    const total = Number.isFinite(data.total_records) ? { total_records: data.total_records - 1 } : {};
    return { ...data, [key]: next, ...total };
  }

  return data;
}
