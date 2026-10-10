import { BLOCK_SIZE, readPageSize } from '../constants/pagination';

// The backend's paged envelope is `{ items, page, limit, total_records,
// total_pages }`. An endpoint that does not page yet answers with a bare array,
// which every reader below tolerates.

export const isPaged = data =>
  Boolean(data) &&
  !Array.isArray(data) &&
  typeof data === 'object' &&
  Array.isArray(data.items) &&
  typeof data.total_records === 'number';

export function readRows(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

/** The block size the server actually served, or null when it did not say. */
export const readBlockSize = data => {
  const limit = Number(data?.limit);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
};

export function readMeta(data, fallbackCount, pageSize) {
  const size = readPageSize(pageSize);
  const total = isPaged(data) ? data.total_records : fallbackCount;
  return { total, pageCount: Math.max(1, Math.ceil(total / size)) };
}

/** `{ page, limit }` for one backend block. */
export const blockRequest = (block, blockSize = BLOCK_SIZE) => ({
  page: Math.max(1, Number(block) || 1),
  limit: blockSize,
});

/**
 * Which block(s) a UI page falls in. A page that crosses a boundary names both,
 * and the caller fetches the second and joins it on.
 */
export function blocksForPage(page, pageSize, blockSize = BLOCK_SIZE) {
  const size = readPageSize(pageSize);
  const first = (Math.max(1, Number(page) || 1) - 1) * size;
  const last = first + size - 1;
  const from = Math.floor(first / blockSize) + 1;
  const to = Math.floor(last / blockSize) + 1;
  return from === to ? [from] : [from, to];
}

/** Where that page sits inside the block(s) held, as `[start, end]`. */
export function sliceForPage(page, pageSize, blockSize = BLOCK_SIZE) {
  const size = readPageSize(pageSize);
  const first = (Math.max(1, Number(page) || 1) - 1) * size;
  const start = first - (blocksForPage(page, size, blockSize)[0] - 1) * blockSize;
  return [start, start + size];
}
