import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '../ui';
import { Select } from '../form';
import {
  useRegistrationDataEvents,
  useEventRegistrationData,
  useEventDataExport,
} from '../../hooks/useEvents';

/**
 * Registered Data — the event creator's (or a higher rank's) view of EVERY
 * member registered for one of their events, with the poll answers, and Excel
 * export. Distinct from the Registered tab, which is the caller's OWN
 * registrations; here the backend gates access per event (creator-or-higher).
 *
 * One event at a time, chosen from the dropdown. "Download this event" exports
 * the selected event; "Download all" exports every accessible event (one sheet
 * each).
 */
function answerText(answers, field) {
  const v = (answers ?? {})[field.id];
  if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return '—';
  return Array.isArray(v) ? v.join(', ') : String(v);
}

function StatusPill({ confirmed }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
      confirmed ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'
    }`}>
      {confirmed ? 'Confirmed' : 'Denied'}
    </span>
  );
}

export default function EventRegistrationData({ enabled }) {
  const eventsQ = useRegistrationDataEvents(enabled);
  const events = useMemo(() => (Array.isArray(eventsQ.data) ? eventsQ.data : []), [eventsQ.data]);

  const [selectedId, setSelectedId] = useState('');
  // Land on the first event once the list arrives (or when it changes and the
  // current pick is gone).
  useEffect(() => {
    if (!events.length) { setSelectedId(''); return; }
    if (!events.some((e) => String(e.id) === String(selectedId))) {
      setSelectedId(String(events[0].id));
    }
  }, [events, selectedId]);

  const dataQ = useEventRegistrationData(selectedId, enabled && Boolean(selectedId));
  const rows = Array.isArray(dataQ.data) ? dataQ.data : [];
  const fields = rows.find((r) => r.event_custom_fields?.length)?.event_custom_fields ?? [];

  const exportM = useEventDataExport();
  const selectedEvent = events.find((e) => String(e.id) === String(selectedId));

  const downloadOne = () => {
    if (!selectedId) return;
    // Filename = "<Event title>_<ddmmyyyy>.xlsx" (e.g. "Shibir 2026_10092026.xlsx"),
    // where the date is TODAY — the day the file is downloaded. Only characters
    // illegal in a filename are stripped; spaces stay so the name reads as the
    // event does on screen.
    const title =
      (selectedEvent?.title || `event-${selectedId}`)
        .replace(/[\\/:*?"<>|]+/g, '')
        .replace(/\s+/g, ' ')
        .trim() || `event-${selectedId}`;
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const datePart = `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}`;
    exportM.mutate({ eventId: selectedId, filename: `${title}_${datePart}.xlsx` });
  };

  if (eventsQ.isLoading) return <Skeleton className="h-40 w-full" />;
  if (eventsQ.error) {
    return <div className="card"><ErrorState error={eventsQ.error} onRetry={eventsQ.refetch} title="Could not load events" /></div>;
  }
  if (!events.length) {
    return (
      <div className="card">
        <EmptyState
          title="No event data available"
          hint="You can see registration data for events you created, or whose creator you outrank."
        />
      </div>
    );
  }

  const eventOptions = events.map((e) => ({
    value: String(e.id),
    label: `${e.title}${e.date ? ` · ${e.date}` : ''} (${e.total_registered})`,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-md">
          <label htmlFor="data-event" className="mb-1.5 block text-sm font-semibold text-primary">Event</label>
          <Select
            id="data-event"
            value={selectedId}
            options={eventOptions}
            placeholder=""
            onChange={(e) => setSelectedId(e.target.value)}
          />
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button variant="primary" onClick={downloadOne} disabled={!selectedId || exportM.isPending}>
            <FileSpreadsheet className="h-4 w-4" /> Download (Excel)
          </Button>
        </div>
      </div>

      {dataQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : dataQ.error ? (
        <div className="card"><ErrorState error={dataQ.error} onRetry={dataQ.refetch} title="Could not load registrations" /></div>
      ) : rows.length === 0 ? (
        <div className="card"><EmptyState title="No registrations yet" hint="Nobody has registered for this event." /></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line-soft bg-surface shadow-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-bg px-4 py-3">
            <span className="font-display text-sm font-bold text-primary">{selectedEvent?.title}</span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-text-muted">
              {rows.length} registered
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  {['Member', 'Mobile', 'Gender', 'Age'].map((h) => (
                    <th key={h} className="table-th px-4 py-2.5">{h}</th>
                  ))}
                  {fields.map((f) => <th key={f.id} className="table-th px-4 py-2.5">{f.label}</th>)}
                  <th className="table-th px-4 py-2.5">Registered By</th>
                  <th className="table-th px-4 py-2.5">Sabha</th>
                  <th className="table-th px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-3 text-sm font-semibold text-primary">{r.user_name}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{r.mobile_number}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{r.gender ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{r.age ?? '—'}</td>
                    {fields.map((f) => (
                      <td key={f.id} className="px-4 py-3 text-sm text-text-muted">{answerText(r.custom_answers, f)}</td>
                    ))}
                    <td className="px-4 py-3 text-sm text-text-muted">{r.register_by_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{r.register_by_sabha ?? '—'}</td>
                    <td className="px-4 py-3"><StatusPill confirmed={Boolean(r.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
