// In-place edits to a cached list, so a popup that changes one field does not
// cost a refetch. Shape-preserving: a paged envelope stays an envelope, a bare
// array stays an array, and an unchanged list is returned by identity.

const patchItems = (items, id, changes, idKey) => {
  let hit = false;
  const next = items.map(row => {
    if (String(row?.[idKey]) !== String(id)) return row;
    hit = true;
    return { ...row, ...changes };
  });
  return hit ? next : null;
};

export function patchRowInList(data, id, changes, { idKey = 'user_id' } = {}) {
  if (Array.isArray(data)) return patchItems(data, id, changes, idKey) ?? data;
  if (!data || typeof data !== 'object') return data;

  for (const key of ['items', 'data']) {
    if (Array.isArray(data[key])) {
      const next = patchItems(data[key], id, changes, idKey);
      return next ? { ...data, [key]: next } : data;
    }
  }
  return data;
}
