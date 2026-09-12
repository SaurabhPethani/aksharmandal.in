import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '../ui';
import { isRowActive } from '../../hooks/useMasterData';

/**
 * The five simple Master Data lists — education levels, job industries, business
 * types, relations, user categories — as a tile grid.
 *
 * A table was the wrong shape for these. Each entry is a SHORT NAME and a flag
 * ("10", "Graduate", "Cook / Caterer"), so a full-width table spent most of its
 * width on empty space and gave a 30-entry list thirty near-blank lines. Tiles
 * put four across, so the whole list is visible at once and reads as a set of
 * values rather than a ledger.
 *
 * Renaming happens ON the tile: these are one-field records, so a dialog to
 * change that one field would be a step for nothing. Creating still uses the
 * dialog, since there is no tile to edit yet.
 *
 * Address Master keeps its table — it has seven columns and genuinely needs one.
 */

const FIELD =
  'w-full rounded-control border border-line-input bg-surface px-2.5 py-1.5 text-sm text-primary ' +
  'shadow-input focus:border-primary/50 focus:outline-none disabled:opacity-60';

const ICON_BTN =
  'inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-50';

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

function Tile({ row, tab, canWrite, busy, onSaveName, onToggleStatus }) {
  const active = isRowActive(row, tab);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name ?? '');
  const [error, setError] = useState(null);

  const cancel = () => {
    setName(row.name ?? '');
    setError(null);
    setEditing(false);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required.'); return; }
    // Nothing changed — close rather than spend a request saying so.
    if (trimmed === row.name) { setEditing(false); return; }
    setError(null);
    onSaveName(row, trimmed);
  };

  if (editing) {
    return (
      <div className="rounded-card border border-primary/40 bg-surface p-3 shadow-card">
        <input
          className={FIELD}
          value={name}
          onChange={(e) => setName(e.target.value)}
          // Enter saves, Escape backs out — a one-field edit should not need the mouse.
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') cancel();
          }}
          disabled={busy}
          autoFocus
          autoComplete="off"
          aria-label={`Rename ${row.name}`}
        />
        {error && <p className="mt-1.5 text-xs font-medium text-danger-fg">{error}</p>}
        <div className="mt-2 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={`${ICON_BTN} bg-primary text-white hover:bg-primary-hover`}
            aria-label="Save"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className={`${ICON_BTN} border border-line-strong text-primary hover:border-primary`}
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group flex items-start justify-between gap-2 rounded-card border border-line-soft bg-surface p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        active ? '' : 'opacity-60'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 flex-shrink-0 rounded-full ${active ? 'bg-success-fg' : 'bg-danger-fg'}`}
            title={active ? 'Active' : 'Inactive'}
          />
          <p className="truncate text-sm font-semibold text-primary" title={row.name}>
            {row.name}
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => onToggleStatus(row)}
            disabled={busy}
            className="mt-1.5 pl-4 text-xs font-medium text-text-muted transition-colors hover:text-danger-fg disabled:opacity-50"
          >
            {active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      {canWrite && (
        // Revealed on hover so a wall of tiles stays calm, but kept in the tab
        // order and visible on focus so it is reachable without a pointer.
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy}
          className={`${ICON_BTN} flex-shrink-0 border border-transparent text-text-muted opacity-0 hover:border-line-strong hover:text-primary focus:opacity-100 group-hover:opacity-100`}
          aria-label={`Rename ${row.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function MasterDataGrid({
  tab, rows, query, canWrite, onSaveName, onToggleStatus, busy,
}) {
  if (query.isLoading) {
    return (
      <div className={GRID}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="rounded-card border border-line-soft bg-surface p-3 shadow-card">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="mt-2 h-2.5 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="card">
        <ErrorState error={query.error} onRetry={query.refetch} title={`Couldn’t load ${tab.label}`} />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="card">
        <EmptyState
          title={`No ${tab.label.toLowerCase()} yet`}
          hint="Nothing has been added to this list."
        />
      </div>
    );
  }

  return (
    <div className={GRID}>
      {rows.map((row) => (
        <Tile
          // Keyed on the saved name so a successful rename re-seeds the tile
          // from the server rather than leaving local state that looks right.
          key={`${row.id}-${row.name}`}
          row={row}
          tab={tab}
          canWrite={canWrite}
          busy={busy}
          onSaveName={onSaveName}
          onToggleStatus={onToggleStatus}
        />
      ))}
    </div>
  );
}
