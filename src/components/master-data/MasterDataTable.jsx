import { EmptyState, ErrorState, Skeleton } from '../ui';

/**
 * The Address Master table.
 *
 * The other five Master Data tabs are a tile grid (see MasterDataGrid) — they
 * hold one short name each, so a table wasted most of its width. This one has
 * seven columns and genuinely needs a table.
 */

export function StatusPill({ active }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        active ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success-fg' : 'bg-danger-fg'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function TableShell({ headers, children }) {
  return (
    <div className="overflow-hidden rounded-card border border-line-soft bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left">
          <thead>
            <tr>
              {headers.map((h) => (
                <th
                  key={h.key}
                  className={`table-th px-4 py-2.5 ${h.className ?? ''}`}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Address Master — ONE ROW PER AREA.
 *
 * The endpoint returns areas nested inside their pincode; the page flattens that
 * so each area is its own row and the pincode's columns repeat down it.
 *
 * `Status` is the PINCODE's status. An area carries its own flag too, but it is
 * deliberately not shown — one status column, one meaning.
 *
 * Edit opens a dialog covering both tables; which endpoint it calls depends on
 * what was changed. There is no Deactivate here — status is not editable from
 * this screen.
 */
/**
 * @param emptyState  what an empty table says. Defaults to "nothing registered",
 *                    but the page overrides it when a SEARCH is what emptied it:
 *                    "no addresses yet" over a filtered list is a lie about the
 *                    data rather than about the query.
 */
export function AddressMasterTable({ rows, query, canWrite, onEdit, busy, emptyState }) {
  const headers = [
    { key: 'pincode', label: 'Pincode' },
    { key: 'area', label: 'Area' },
    { key: 'suburb', label: 'Suburb' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'country', label: 'Country' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '', className: 'text-right' },
  ];

  if (query.isLoading) {
    return (
      <TableShell headers={headers}>
        {Array.from({ length: 4 }, (_, i) => (
          <tr key={i} className="border-b border-line-soft last:border-0">
            {headers.map((h) => (
              <td key={h.key} className="px-4 py-3"><Skeleton className="h-3 w-16" /></td>
            ))}
          </tr>
        ))}
      </TableShell>
    );
  }

  if (query.error) {
    return (
      <div className="card">
        <ErrorState error={query.error} onRetry={query.refetch} title="Couldn’t load the Address Master" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="card">
        <EmptyState
          title={emptyState?.title ?? 'No addresses yet'}
          hint={emptyState?.hint ?? 'Nothing has been registered.'}
        />
      </div>
    );
  }

  return (
    <TableShell headers={headers}>
      {rows.map((row) => (
        <tr key={row.key} className="border-b border-line-soft last:border-0">
          <td className="px-4 py-3 text-sm font-bold text-primary">{row.pincode}</td>
          <td className="px-4 py-3 text-sm text-primary">
            {row.area ?? <span className="text-xs italic text-text-faint">no areas mapped</span>}
          </td>
          <td className="px-4 py-3 text-sm text-primary">{row.suburb}</td>
          <td className="px-4 py-3 text-sm text-primary">{row.city}</td>
          <td className="px-4 py-3 text-sm text-primary">{row.state}</td>
          <td className="px-4 py-3 text-sm text-primary">{row.country}</td>
          <td className="px-4 py-3"><StatusPill active={Boolean(row.pincodeStatus)} /></td>
          <td className="px-4 py-3 text-right">
            {canWrite && (
              <button
                type="button"
                onClick={() => onEdit(row)}
                disabled={busy}
                className="text-xs font-semibold text-primary transition-colors hover:text-primary-hover disabled:opacity-50"
              >
                Edit
              </button>
            )}
          </td>
        </tr>
      ))}
    </TableShell>
  );
}
