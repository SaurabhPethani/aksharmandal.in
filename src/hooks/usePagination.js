import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BLOCK_SIZE, DEFAULT_PAGE_SIZE, readPageSize } from '../constants/pagination';
import {
  blockRequest, blocksForPage, isPaged, readBlockSize, readMeta, readRows, sliceForPage,
} from '../services/paginationService';
import { searchMatches } from '../utils/options';

// The project's pagination layer. Two entry points over one shared core, because
// a hook cannot call useQuery conditionally — the split is a React constraint,
// not a second implementation. Both return the identical shape, so every pager
// and every list screen is written the same way:
//
//   { page, setPage, pageCount, total, pageRows, pageSize, setPageSize }
//
// `pageSize` is the reader's own choice, from the pager's "Show" dropdown. It
// starts at DEFAULT_PAGE_SIZE and any change RESETS to page 1: page 7 of 10-row
// pages is not page 7 of 100-row pages, and landing somewhere unrelated in the
// list reads as a bug.

/**
 * Search by anything across a row's scalar fields: every typed word must appear
 * in some field, in any order (so "amit limbasia" and "limbasia amit" both match
 * a row whose name is "Amit Gordhan Limbasia"). See searchMatches.
 */
function filterRows(rows, search) {
  if (!String(search ?? '').trim()) return rows;
  return rows.filter((r) => {
    const hay = Object.values(r)
      .filter((v) => v != null && typeof v !== 'object')
      .join(' ');
    return searchMatches(hay, search);
  });
}

/**
 * Server-paged lists: the endpoint takes { page, limit } plus whatever filters
 * the screen sends.
 *
 * Fetches one 100-record block and serves four UI pages of 25 from it; page 5
 * fetches the next block. The block number is in the query key, so React Query
 * caches each one — walking pages 1 to 4 costs a single request, page 5 costs
 * one more, and paging back to page 3 costs none.
 *
 * @param queryKey   base key; params and block are appended
 * @param fetchBlock (params) => Promise, called with { ...params, page, limit }
 * @param params     filters/search/sort sent to the endpoint
 */
export function useServerPagination({
  queryKey, fetchBlock, params, enabled = true,
  /** Starting page — pass the one read from the URL to survive a Back navigation. */
  initialPage = 1,
  /** Called whenever the page changes, so a caller can mirror it into the URL. */
  onPageChange,
}) {
  const [page, setPageState] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);

  const setPage = useCallback((next) => {
    setPageState(next);
    onPageChange?.(next);
  }, [onPageChange]);

  /** Changing the size starts the list again from the top. */
  const setPageSize = useCallback((next) => {
    setPageSizeState(readPageSize(next));
    setPageState(1);
    onPageChange?.(1);
  }, [onPageChange]);

  // A filter, search or sort change makes the current page meaningless — page 7
  // of the old result set is not page 7 of the new one — so any param change
  // returns to page 1. Serialized because callers pass a fresh object literal
  // on every render.
  //
  // The first run is skipped: on mount this effect would otherwise fire and
  // stamp page 1 over an initialPage restored from the URL.
  const paramsKey = JSON.stringify(params ?? null);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setPageState(1);
  }, [paramsKey]);

  // An endpoint that does not page yet ignores page/limit and answers with a
  // bare array. Asking it for block 2 would re-fetch the same rows and then
  // slice the wrong window out of them, so once a response comes back without
  // the envelope we stop requesting blocks and window the whole set in the
  // browser — exactly today's behaviour, with no change at the call site. It
  // corrects itself the moment the endpoint starts sending total_records.
  const [servesBlocks, setServesBlocks] = useState(true);

  /**
   * How many records a block actually holds.
   *
   * Held as state and corrected from each response's own `limit`, because the
   * number belongs to the SERVER: block 2 means "the second N records", so a UI
   * addressing blocks against the wrong N does not fetch too much or too little
   * — it fetches a different part of the list and shows it as though it were the
   * part asked for. BLOCK_SIZE is where it starts, not what it is.
   */
  const [blockSize, setBlockSize] = useState(BLOCK_SIZE);

  // Which block(s) this page falls in. The SIZE is not in the key: a block is
  // the same records however they are sliced, so changing the dropdown re-slices
  // what is already cached instead of refetching.
  const blocks = servesBlocks ? blocksForPage(page, pageSize, blockSize) : [1];
  // A page can cross one boundary — at 100 a page against 250-record blocks —
  // and then it needs the block after it too. Fetched separately and joined:
  // asking for a bigger block instead would throw away the cache on every
  // neighbouring page, where this second request is itself cached and is the
  // NEXT page's primary block.
  const spillBlock = blocks.length > 1 ? blocks[1] : null;

  const query = useQuery({
    queryKey: [...queryKey, paramsKey, 'block', blocks[0]],
    queryFn: () => fetchBlock({ ...(params ?? {}), ...blockRequest(blocks[0]) }),
    enabled,
    // No flash of empty rows when crossing a block boundary. v4's
    // `keepPreviousData: true` was removed in v5 — it is now a placeholderData
    // function, and the old boolean is silently ignored rather than warned about.
    placeholderData: keepPreviousData,
  });

  const spillQuery = useQuery({
    queryKey: [...queryKey, paramsKey, 'block', spillBlock],
    queryFn: () => fetchBlock({ ...(params ?? {}), ...blockRequest(spillBlock) }),
    enabled: enabled && spillBlock != null,
    placeholderData: keepPreviousData,
  });

  const paged = isPaged(query.data);
  useEffect(() => {
    if (query.data !== undefined) setServesBlocks(paged);
  }, [query.data, paged]);

  // Adopt the server's own block size. Guarded on a real change so this settles
  // in one pass; guarded on `paged` because a bare array has no envelope to read
  // and its `limit` would be undefined.
  const reportedBlockSize = paged ? readBlockSize(query.data) : null;
  useEffect(() => {
    if (reportedBlockSize) setBlockSize((current) => (current === reportedBlockSize ? current : reportedBlockSize));
  }, [reportedBlockSize]);

  // In the unpaged fallback the endpoint ignored `search` along with page/limit,
  // so it is applied here instead. A paged response is already searched by the
  // server and must not be filtered again — that would hide rows the server
  // counted, and the pager would disagree with the table.
  const rows = useMemo(() => {
    const all = readRows(query.data);
    if (!paged) return filterRows(all, params?.search);
    // The spill lands directly after the primary, which is what makes the
    // offsets below — measured from the top of the primary block — address a
    // straddling page as one run of records.
    return spillBlock != null ? [...all, ...readRows(spillQuery.data)] : all;
  }, [query.data, spillQuery.data, spillBlock, paged, params?.search]);

  const { total, pageCount } = readMeta(paged ? query.data : null, rows.length, pageSize);
  const current = Math.min(page, pageCount);

  // Paged: the page sits inside the block(s) we hold. Unpaged: we hold
  // everything, so the offset is measured from the start of the whole set.
  const [start, end] = paged
    ? sliceForPage(current, pageSize, blockSize)
    : [(current - 1) * pageSize, current * pageSize];

  return {
    ...query,
    // A straddling page is not loaded until BOTH halves are — reporting the
    // primary's state alone would render half a page as though it were whole.
    isLoading: query.isLoading || (spillBlock != null && spillQuery.isLoading),
    isFetching: query.isFetching || (spillBlock != null && spillQuery.isFetching),
    error: query.error ?? (spillBlock != null ? spillQuery.error : null),
    page: current,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    total,
    pageRows: rows.slice(start, end),
  };
}

/**
 * Client-paged lists: for screens that genuinely need the whole set in memory —
 * the scanner has to match any member's QR code, not just the ten on screen —
 * and for endpoints that have no paging yet.
 *
 * Same contract as the server-paged version, so the two are interchangeable from
 * a component's point of view — including the size dropdown.
 */
export function useClientPagination(rows = [], { search = '' } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const term = search.trim().toLowerCase();

  const setPageSize = useCallback((next) => {
    setPageSizeState(readPageSize(next));
    setPage(1);
  }, []);

  const filtered = useMemo(() => filterRows(rows, term), [rows, term]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);

  // Only the search term resets the page. Reacting to `rows` as well would send
  // the user back to page 1 every time the list refetched (e.g. after a status
  // update); callers that change a filter reset the page themselves. An
  // out-of-range page is clamped by `current` rather than reset.
  useEffect(() => { setPage(1); }, [term]);

  return {
    page: current,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    total: filtered.length,
    pageRows: filtered.slice((current - 1) * pageSize, current * pageSize),
  };
}
