import FormDialog from '../FormDialog';
import { Skeleton, EmptyState, ErrorState } from '../ui';
import { useEventFieldResults } from '../../hooks/useEvents';

/**
 * Poll results for one event — the per-option tallies of its custom fields.
 * Organiser-only (the endpoint is EVENTS:CREATE) and scoped to the caller's
 * hierarchy band, so a Sabha Head sees their sabha's answers.
 *
 * Read-only: no submit button, just Close. The query is `enabled` on `isOpen`
 * so it fires when the dialog opens and refetches after any registration
 * (the mutation invalidates `event-field-results`).
 */
function Bar({ value, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium text-primary">{value}</span>
        <span className="flex-shrink-0 text-text-muted">
          {count}
          {total > 0 && <span className="ml-1 text-xs text-text-faint">· {pct}%</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function EventResultsDialog({ event, isOpen, onClose }) {
  const { data, isLoading, error, refetch } = useEventFieldResults(event?.id, isOpen);
  const results = Array.isArray(data) ? data : [];

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Responses · ${event?.title ?? 'Event'}`}
      hideSubmit
      cancelLabel="Close"
      size="lg"
    >
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} title="Could not load responses" />
      ) : results.length === 0 ? (
        <EmptyState
          title="No responses yet"
          hint="This event has no custom fields, or nobody confirmed has answered them."
        />
      ) : (
        <div className="space-y-5">
          {results.map((f) => {
            const isChoice = f.type === 'single' || f.type === 'multi';
            return (
              <div key={f.id} className="rounded-card border border-line-soft bg-surface p-4">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="font-display font-bold text-primary">{f.label}</p>
                  <span className="text-xs text-text-muted">
                    {f.total_responses} {f.total_responses === 1 ? 'response' : 'responses'}
                    {!isChoice && ` · ${f.type}`}
                    {f.type === 'multi' && ' · multi'}
                  </span>
                </div>
                {isChoice ? (
                  <div className="space-y-2.5">
                    {f.options.map((o) => (
                      <Bar key={o.value} value={o.value} count={o.count} total={f.total_responses} />
                    ))}
                  </div>
                ) : (
                  // Value field: each answer is unique, so there is nothing to
                  // chart — the values themselves live in Registered Data / Excel.
                  <p className="text-xs text-text-faint">
                    Individual values — open the Registered Data tab or the Excel export to read them.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </FormDialog>
  );
}
