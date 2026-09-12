import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, RefreshCw, CheckCircle2, XCircle, Clock, User as UserIcon } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Skeleton, ErrorState } from '../components/ui';
import { Breadcrumbs } from '../components/Navigation';
import { useToast } from '../hooks';
import { useSabhaSpawnLastRun } from '../hooks/useUserAdmin';
import { sabhaSpawnService } from '../services/sabhaSpawnService';

// SuperAdmin-only: manually run the daily Sabha spawner and see the last run's
// status. The spawner fires on its own at 12:00 IST; this screen is the fallback
// for a missed run (server down / deploy over noon) and a window into whether the
// last run — scheduled or manual — succeeded.

const fmt = (dt) => {
  if (!dt) return '—';
  const d = new Date(dt);
  return Number.isNaN(d.getTime()) ? String(dt) : d.toLocaleString();
};

export default function SabhaSpawnPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const runQ = useSabhaSpawnLastRun();
  const last = runQ.data ?? null;

  const [running, setRunning] = useState(false);
  // When the guard blocks a normal run (last run already succeeded), we surface
  // a force path instead of a dead end — the exact case of a missed noon cron.
  const [blocked, setBlocked] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sabha-spawn-last-run'] });

  const doRun = async (force) => {
    const confirmMsg = force
      ? 'The last run already succeeded. Run the Sabha spawner again anyway? This re-activates today’s Sabhas and is safe to repeat.'
      : 'Run the daily Sabha spawner now? This spawns today’s regular Sabhas and opens them for attendance.';
    if (!window.confirm(confirmMsg)) return;
    setRunning(true);
    try {
      const res = await sabhaSpawnService.run(force);
      const r = res?.data?.result ?? {};
      toast.success(
        res?.detail
          ? `${res.detail} Spawned ${r.spawned ?? 0}, reactivated ${r.reactivated ?? 0}.`
          : 'Sabha spawner executed.',
      );
      setBlocked(false);
      refresh();
    } catch (e) {
      // 400 = assert_manual_run_allowed: the latest run already succeeded.
      // Offer the force path rather than leaving the admin stuck.
      if (e?.status === 400) {
        setBlocked(true);
        toast.info?.(e?.message || 'The last run already succeeded.');
      } else {
        toast.error(e?.message || 'Could not run the spawner.');
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Sabha Spawn"
        breadcrumbs={<Breadcrumbs items={[{ label: 'Control Panel' }, { label: 'Sabha Spawn' }]} />}
      />
      <p className="text-sm text-text-muted">
        The daily spawner runs on its own at <b>12:00 IST</b> — it activates today&apos;s regular Sabhas
        and opens them for attendance. Use this only if that automatic run was missed (a server restart or
        deploy over noon). Running it again is safe: it re-activates today&apos;s Sabhas rather than
        duplicating them.
      </p>

      {/* Last run status */}
      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
          <h3 className="text-sm font-semibold text-primary">Last run</h3>
          <Button variant="ghost" onClick={() => runQ.refetch()} disabled={runQ.isFetching} className="!px-2 !py-1 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${runQ.isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {runQ.isLoading ? (
          <div className="p-4"><Skeleton className="h-24 w-full" /></div>
        ) : runQ.error ? (
          <div className="p-4"><ErrorState error={runQ.error} onRetry={runQ.refetch} title="Could not load the last run" /></div>
        ) : !last ? (
          <p className="px-4 py-6 text-sm text-text-muted">The Sabha spawner has not run yet.</p>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1.5">
                {last.status
                  ? <CheckCircle2 className="h-4 w-4 text-success-fg" />
                  : <XCircle className="h-4 w-4 text-danger-fg" />}
                <Badge tone={last.status ? 'ok' : 'bad'}>{last.status ? 'Success' : 'Failed'}</Badge>
              </span>
              <span className="inline-flex items-center gap-1.5 text-text-muted">
                <Clock className="h-4 w-4" />{fmt(last.datetime)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-text-muted">
                <UserIcon className="h-4 w-4" />by {last.run_by}
              </span>
            </div>

            {last.execution_logs && (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-bg px-3 py-2.5 text-xs leading-relaxed text-text-muted">
                {last.execution_logs}
              </pre>
            )}
          </div>
        )}
      </Card>

      {/* Run now */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[200px] flex-1">
            <p className="text-sm font-semibold text-primary">Run the spawner now</p>
            <p className="mt-0.5 text-xs text-text-muted">Spawns today&apos;s regular Sabhas and opens attendance.</p>
          </div>
          <Button variant="accent" busy={running} disabled={running} onClick={() => doRun(false)}>
            <CalendarPlus className="h-4 w-4" /> Run now
          </Button>
        </div>

        {blocked && (
          <div className="mt-4 rounded-xl bg-primary-50 p-3">
            <p className="text-sm text-primary">
              The last run already completed successfully, so a normal run is blocked. If the scheduled 12:00
              run was missed and today&apos;s Sabhas still need spawning, you can run it anyway.
            </p>
            <Button variant="danger" busy={running} disabled={running} onClick={() => doRun(true)} className="mt-3">
              Run anyway
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
