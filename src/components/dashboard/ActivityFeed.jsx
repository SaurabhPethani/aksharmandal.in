import { useActivityLogs } from '../../hooks';
import { Badge, EmptyState, ErrorState, Skeleton } from '../ui';
import { Pagination } from '../DataTable';
import { formatDate } from '../../utils/format';

// Recent activity from GET /api/v1/activity-logs. This endpoint is genuinely
// server-paginated, so it runs the project's block strategy: 100 records per
// request, four UI pages of 25 from each. Page state belongs to the hook.

function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (['approved', 'accepted', 'completed', 'success'].includes(s)) return 'ok';
  if (['rejected', 'cancelled', 'failed'].includes(s)) return 'bad';
  return 'neutral';
}

export default function ActivityFeed({ enabled, className = '' }) {
  const {
    pageRows: rows, page, setPage, pageCount, total,
    isLoading, error, refetch, isFetching,
  } = useActivityLogs(enabled);

  if (!enabled) return null;

  return (
    <div className={`panel !p-0 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-[#F0F5FA] px-5 py-4">
        <div>
          <h3 className="panel-title">Recent Activity</h3>
          {total > 0 && (
            <p className="mt-0.5 text-xs text-text-muted">{total} record{total === 1 ? '' : 's'}</p>
          )}
        </div>
        {isFetching && !isLoading && <span className="text-xs text-text-muted">Updating…</span>}
      </div>

      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} title="Couldn’t load activity" />
      ) : rows.length === 0 ? (
        <EmptyState title="No recent activity" hint="Nothing has been recorded for your hierarchy yet." />
      ) : (
        <>
          <ul className="divide-y divide-[#F0F5FA]">
            {rows.map((row, i) => (
              <li
                key={row.id ?? i}
                className="flex flex-wrap items-start gap-3 px-5 py-3 transition-colors duration-150 hover:bg-[#F9FBFD]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-primary">{row.category || 'Activity'}</p>
                    {row.status && <Badge tone={statusTone(row.status)}>{row.status}</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {[row.type, row.user_name, row.role_name].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-text-muted">{formatDate(row.datetime)}</p>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageCount={pageCount} total={total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
