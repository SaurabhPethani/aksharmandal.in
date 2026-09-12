import { BLOCK_SIZE, DEFAULT_PAGE_SIZE, pageStart, readPageSize } from '../constants/pagination';

// The arithmetic behind the block standard. Pure functions on purpose: the hooks
// in hooks/usePagination.js decide *when* to fetch, this file decides *what* a
// page number means, and both stay checkable in isolation.
//
// Every function takes the page size rather than reading a constant — the reader
// chooses it from the "Show" dropdown, so it is an argument, not a setting. And
// every one takes the BLOCK size too, for the same reason one step up: the
// server states it in each response, so it is data, not a constant this file
// gets to assume. BLOCK_SIZE is only the default until a response says otherwise.
//
// All of it is expressed in ABSOLUTE record offsets — "page 3 at 100 is records
// 200-300" — and blocks are derived from those. The previous version counted in
// whole pages-per-block, which only works while the page size divides the block;
// at 250 the 100-row size does not, and that arithmetic put page 3 at the start
// of block 1 rather than across the end of it.

/** 1-based UI page -> the first backend block it needs. */
export const blockForPage = (page, pageSize = DEFAULT_PAGE_SIZE, blockSize = BLOCK_SIZE) =>
  Math.floor(pageStart(page, pageSize) / blockSize) + 1;

/**
 * EVERY block a UI page needs — one, or two when the page straddles a boundary.
 *
 * Two is the most it can ever be while no offered page size exceeds a block: a
 * window of at most `blockSize` records can cross at most one boundary. The
 * pagers rely on that, fetching a primary block and at most one spill.
 */
export function blocksForPage(page, pageSize = DEFAULT_PAGE_SIZE, blockSize = BLOCK_SIZE) {
  const size = readPageSize(pageSize);
  const start = pageStart(page, size);
  const first = Math.floor(start / blockSize) + 1;
  // `size - 1`: the page's LAST record, not the first of the next page — without
  // it a page ending exactly on a boundary would claim the block after it.
  const last = Math.floor((start + size - 1) / blockSize) + 1;
  return last > first ? [first, last] : [first];
}

/**
 * Where a UI page sits in the rows the caller is holding, as [start, end).
 *
 * Offsets are measured from the top of the FIRST block the page needs, so a
 * caller that has joined a spill block onto its primary can slice with these
 * directly.
 */
export function sliceForPage(page, pageSize = DEFAULT_PAGE_SIZE, blockSize = BLOCK_SIZE) {
  const size = readPageSize(pageSize);
  const start = pageStart(page, size);
  const held = (blockForPage(page, size, blockSize) - 1) * blockSize;
  return [start - held, start - held + size];
}

/**
 * Query params that fetch a given block.
 *
 * `limit` is NOT sent. The list endpoints have their own default and cap there
 * anyway, so the parameter only ever restated it — and the page size is a
 * reading choice, not something the server needs to know: one block feeds
 * whichever size is on screen.
 */
export const blockRequest = (block) => ({ page: block });

/**
 * The block size a response reports, or null if it does not say.
 *
 * This is what keeps BLOCK_SIZE an assumption rather than a claim: the pagers
 * adopt whatever comes back, so an endpoint serving a different number is
 * followed rather than mis-addressed.
 */
export const readBlockSize = (data) => {
  const limit = Number(data?.limit);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
};

/** Does this response carry the pagination envelope, or is it a bare list? */
export const isPaged = (data) => Number.isFinite(data?.total_records);

/**
 * Reads the backend's pagination envelope:
 *   { page, limit, total_records, total_pages, has_next_page, has_previous_page }
 *
 * Note `total_pages` is deliberately ignored. It counts *backend* pages of 100;
 * the pager walks UI pages of whatever size is showing, so the only field that
 * can drive it is `total_records`. Using total_pages here would show a
 * 1,462-record list as 15 pages instead of 59.
 */
export function readMeta(data, fallbackCount = 0, pageSize = DEFAULT_PAGE_SIZE) {
  const total = Number.isFinite(data?.total_records) ? data.total_records : fallbackCount;
  return { total, pageCount: Math.max(1, Math.ceil(total / readPageSize(pageSize))) };
}

/** Rows out of a list envelope, whatever the endpoint calls its array. */
export function readRows(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['items', 'results', 'records', 'data', 'users', 'list']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

export { BLOCK_SIZE, DEFAULT_PAGE_SIZE };
