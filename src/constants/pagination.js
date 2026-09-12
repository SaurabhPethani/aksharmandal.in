// The project's pagination standard.
//
// The backend serves BLOCKS of 250 records; the UI shows a page out of the block
// it is holding. At the default 25 that is ten UI pages per request:
//
//   UI pages  1-10  -> backend block 1 (records 1-250)
//   UI page   11    -> backend block 2 (records 251-500)
//   UI page   21    -> backend block 3 (records 501-750)
//
// ⚠ THE BLOCK IS 250, NOT 100. It was 100, and the endpoints now answer with 250
// — the number is the SERVER's, and getting it wrong is not a tuning mistake but
// a correctness one: block 2 means "the second 250", so a UI asking for block 2
// while believing blocks are 100 records long silently skips records 101-250 and
// shows 251-350 in their place. Nothing about that looks wrong on screen.
//
// So the value here is only the ASSUMPTION used before a response has arrived.
// Every response carries its own `limit`, and both pagers adopt it the moment it
// disagrees — see hooks/usePagination.js. A backend that changes this number
// again corrects the UI on the first request rather than needing this edit.
//
// A UI PAGE MAY STRADDLE TWO BLOCKS, and that is the difference from the old
// standard. At 100 every offered size divided the block exactly and a page was
// always inside one block; 250 is not divisible by 100, so page 3 at that size
// is records 201-300 and crosses the boundary at 250. That case is HANDLED, not
// forbidden — `blocksForPage` in services/paginationService.js names both blocks
// and the hook fetches the spill, so the sizes below stay free to be the sizes a
// reader actually wants.
//
// The size is the reader's choice, not the screen's: every list offers the same
// four and starts at the same one, so two tables never page differently unless
// somebody asked them to.

/** Records per backend request — the assumed default; a response's own `limit` wins. */
export const BLOCK_SIZE = 250;

/** What every list starts at. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * The sizes offered in the "Show" dropdown.
 *
 * None may exceed BLOCK_SIZE, and no smaller `limit` a backend might report may
 * fall below the largest of them: a page bigger than a block would need three or
 * more blocks joined to fill it, and the pagers fetch at most two.
 */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * A page size that can actually be served: one of the options above, falling
 * back to the default. Guards the value read back from anywhere the app does not
 * control — a query string, a stored preference, a stale prop.
 */
export const readPageSize = (value) => {
  const n = Number(value);
  return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
};

/** The record this UI page starts at, counting from 0 across the whole list. */
export const pageStart = (page, pageSize = DEFAULT_PAGE_SIZE) =>
  (Math.max(1, Number(page) || 1) - 1) * readPageSize(pageSize);
