import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BusyOverlay, EmptyState, ErrorState, Loader } from './ui';
import PageSizeSelect from './PageSizeSelect';
import { formatCell, humanize } from '../utils/format';

/**
 * Table with inferred columns.
 *
 * When `columns` is omitted the header is derived from the first row's scalar
 * keys — a scaffold for endpoints whose response shape isn't pinned down yet.
 * Pass explicit columns ({ key, label, render }) for real screens.
 */
export function DataTable({
  rows = [], columns, loading, error, onRetry, empty, maxColumns = 8,
  /** A refetch while rows are already on screen — paging, sorting, filtering. */
  busy = false,
}) {
  const cols = useMemo(() => {
    if (columns?.length) return columns;
    if (!rows.length) return [];
    return Object.keys(rows[0])
      .filter((k) => {
        const v = rows[0][k];
        return v === null || typeof v !== 'object' || Array.isArray(v);
      })
      .slice(0, maxColumns)
      .map((k) => ({ key: k, label: humanize(k) }));
  }, [columns, rows, maxColumns]);

  if (loading) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!rows.length) return empty ?? <EmptyState hint="This endpoint returned no records." />;

  return (
    <div className="relative overflow-x-auto">
      {busy && <BusyOverlay />}
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className="table-th px-4 py-3"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="border-t border-line transition-colors hover:bg-primary-50">
              {cols.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-4 py-3 text-text-muted">
                  {c.render ? c.render(row) : formatCell(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageCount, total, onChange, pageSize, onPageSize }) {
  // The size dropdown stays even on a single page — it is how a reader asks for
  // MORE rows, and hiding it at 30 records means never seeing 50 on screen.
  if (pageCount <= 1 && !onPageSize) return null;

  // Window of at most 5 page numbers around the current page.
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => start + i);

  const btn = 'inline-flex h-9 min-w-9 items-center justify-center rounded-control border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <PageSizeSelect value={pageSize} onChange={onPageSize} />
        <p className="text-xs text-text-muted">
          Page {page} of {pageCount}
          {total != null && <> · {total} record{total === 1 ? '' : 's'}</>}
        </p>
      </div>
      {/* One page and nothing to walk through — the size dropdown above is the
          whole control in that case. */}
      <div className={`flex items-center gap-1.5 ${pageCount <= 1 ? 'hidden' : ''}`}>
        <button
          className={`${btn} border-line-strong bg-surface text-primary hover:bg-primary-50`}
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`${btn} ${
              p === page
                ? 'border-transparent bg-primary text-white'
                : 'border-line-strong bg-surface text-primary hover:bg-primary-50'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          className={`${btn} border-line-strong bg-surface text-primary hover:bg-primary-50`}
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
