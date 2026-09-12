import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader, Card, Skeleton, ErrorState, Toggle } from '../components/ui';
import { Breadcrumbs } from '../components/Navigation';
import { DatePicker } from '../components/form';
import { useToast } from '../hooks';
import { useSittingsByDate } from '../hooks/useUserAdmin';
import { openAttendanceService } from '../services/openAttendanceService';

// SuperAdmin-only: open/close a PAST Sabha sitting for attendance. The admin
// only flips availability here — the Sabha DB Manager / Head does the actual
// marking through the normal attendance screen once it is open.

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function SittingRow({ s, onToggled }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(s.is_open);

  const flip = async () => {
    if (s.is_current_week || busy) return;
    const next = !open;
    setBusy(true);
    try {
      const res = await openAttendanceService.toggle(s.sabha_detail_id, next);
      setOpen(next);
      toast.success(res?.detail || (next ? 'Opened for attendance.' : 'Closed.'));
      onToggled?.();
    } catch (e) {
      toast.error(e?.message || 'Could not update.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3 border-t border-line-soft px-4 py-3 first:border-t-0 sm:items-center">
      <div className="min-w-0 flex-1">
        {/* PC view: one line, Sabha first — "Sabha : Mandal : Pradesh". */}
        <p className="hidden truncate font-semibold text-primary sm:block">
          {[s.name, s.mandal_name, s.pradesh_name].filter(Boolean).join(' : ')}
          {s.type && s.type !== 'regular' ? <span className="ml-2 text-xs font-normal capitalize text-accent">{s.type}</span> : null}
        </p>
        {/* Mobile view: stacked card so the long name is fully readable
            instead of truncated — Sabha (prominent), then Mandal, then Pradesh. */}
        <div className="sm:hidden">
          <p className="font-semibold text-primary">
            {s.name}
            {s.type && s.type !== 'regular' ? <span className="ml-2 text-xs font-normal capitalize text-accent">{s.type}</span> : null}
          </p>
          {s.mandal_name ? <p className="text-xs text-text-muted">{s.mandal_name}</p> : null}
          {s.pradesh_name ? <p className="text-xs text-text-muted">{s.pradesh_name}</p> : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-text-muted">{s.present_count} present</p>
      </div>
      {s.is_current_week ? (
        <span className="shrink-0 rounded-full bg-bg px-2.5 py-1 text-[11px] font-semibold text-text-muted" title="Marked through the normal attendance screen">
          This week
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-xs font-semibold ${open ? 'text-success-fg' : 'text-text-muted'}`}>
            {open ? 'Open' : 'Closed'}
          </span>
          <Toggle checked={open} onChange={flip} disabled={busy} label={`Toggle attendance for ${s.name}`} />
        </div>
      )}
    </div>
  );
}

export default function OpenAttendancePage() {
  const [date, setDate] = useState(todayISO());
  const queryClient = useQueryClient();
  const query = useSittingsByDate(date, true);
  const sittings = query.data ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['open-attendance', date] });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Open Attendance"
        breadcrumbs={<Breadcrumbs items={[{ label: 'Control Panel' }, { label: 'Open Attendance' }]} />}
      />
      <p className="text-sm text-text-muted">
        Attendance closes automatically each day. Pick a date, then switch a past Sabha <b>on</b> so its
        Sabha DB Manager / Head can mark it on the normal screen — switch it <b>off</b> again when done.
        This week&apos;s sabhas are marked through the normal flow and can&apos;t be toggled here.
      </p>

      <Card>
        <label className="mb-1 block text-xs font-semibold text-text-muted">Date</label>
        <DatePicker value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className="w-52" />
      </Card>

      <Card className="p-0">
        <div className="border-b border-line-soft px-4 py-3">
          <h3 className="text-sm font-semibold text-primary">Sabhas on this date</h3>
        </div>
        {query.isLoading ? (
          <div className="p-4"><Skeleton className="h-24 w-full" /></div>
        ) : query.error ? (
          <div className="p-4"><ErrorState error={query.error} onRetry={query.refetch} title="Could not load sittings" /></div>
        ) : sittings.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">No Sabhas held on this date.</p>
        ) : (
          <div>
            {sittings.map((s) => (
              <SittingRow key={s.sabha_detail_id} s={s} onToggled={refresh} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
