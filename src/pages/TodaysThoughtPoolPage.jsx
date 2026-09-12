import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Clock, Images, Layers,
} from 'lucide-react';
import { PageHeader, Card, Button, Badge, Skeleton, ErrorState } from '../components/ui';
import { Breadcrumbs } from '../components/Navigation';
import { useToast, usePermissions } from '../hooks';
import { useThoughtsOverview } from '../hooks/useThoughts';
import { thoughtsService } from '../services/thoughtsService';
import { ACTIONS, MODULES } from '../constants/permissions';
import ThoughtsAdmin from '../components/master-data/ThoughtsAdmin';

// SuperAdmin-only: manage the PER-USER Today's Thought image pool.
//   • Library — add / bulk-add quotes, render or delete each quote's image.
//   • Report  — pool stats, the low-buffer alert, Generate new / Regenerate,
//               and the top-10 "bucket" of most-seen images.

const fmt = (dt) => {
  if (!dt) return '—';
  const d = new Date(dt);
  return Number.isNaN(d.getTime()) ? String(dt) : d.toLocaleString();
};

function isRunning(data) {
  const j = data?.jobs || {};
  return j.generate?.status === 'running' || j.regenerate?.status === 'running';
}

/** Tab strip: the active tab is a raised white pill, the rest are quiet text. */
function Tabs({ tabs, activeKey, onChange }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1">
      {tabs.map((t) => {
        const active = t.key === activeKey;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-current={active ? 'page' : undefined}
            className={`rounded-xl px-4 py-2 text-sm transition-all ${
              active
                ? 'bg-surface font-bold text-primary shadow-card'
                : 'font-medium text-text-muted hover:text-primary'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }) {
  const toneCls = tone === 'bad' ? 'text-danger-fg' : tone === 'ok' ? 'text-success-fg' : 'text-primary';
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</p>
    </Card>
  );
}

function JobStatus({ job }) {
  if (!job || job.status === 'idle') {
    return <p className="text-xs text-text-muted">Not run yet.</p>;
  }
  if (job.status === 'scheduled') {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-primary">
        <Clock className="h-3.5 w-3.5" /> Queued for {fmt(job.scheduled_for)}
      </p>
    );
  }
  if (job.status === 'running') {
    const { done = 0, total = 0, failed = 0 } = job;
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-primary">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Running — {done}/{total}{failed ? ` (${failed} failed)` : ''}
      </p>
    );
  }
  const ok = job.status === 'done';
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-text-muted">
      {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success-fg" /> : <XCircle className="h-3.5 w-3.5 text-danger-fg" />}
      {job.message || (ok ? 'Done.' : 'Failed.')} {job.finished_at ? `· ${fmt(job.finished_at)}` : ''}
    </p>
  );
}

/** The Report tab — pool snapshot, generate / regenerate, top-10 bucket. */
function ReportTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(null); // 'generate' | 'regenerate' | 'regenerate-now'

  const q = useThoughtsOverview({
    refetchInterval: (query) => (isRunning(query.state.data) ? 4000 : 20000),
  });
  const data = q.data ?? null;
  const pool = data?.pool ?? {};
  const cons = data?.consumption ?? {};
  const jobs = data?.jobs ?? {};
  const bucket = Array.isArray(data?.top_images) ? data.top_images : [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['thoughts', 'overview'] });

  const doGenerate = async () => {
    if (!window.confirm(`Render up to ${pool.batch_size ?? 200} unused quotes into the pool now? This runs in the background and can take several minutes.`)) return;
    setBusy('generate');
    try {
      const res = await thoughtsService.generateBatch();
      toast.success(res?.detail ?? 'Generate started.');
      refresh();
    } catch (e) {
      toast.error(e?.message ?? 'Could not start generation.');
    } finally {
      setBusy(null);
    }
  };

  const doRegenerate = async (runNow) => {
    const msg = runNow
      ? 'Re-render EVERY image now, in the background? Quotes and the per-user history are untouched — only the look changes.'
      : 'Queue a full regenerate for 01:00 IST tonight? Every image is re-rendered with the current theme; quotes and per-user history are untouched.';
    if (!window.confirm(msg)) return;
    setBusy(runNow ? 'regenerate-now' : 'regenerate');
    try {
      const res = await thoughtsService.regenerate(runNow);
      toast.success(res?.detail ?? 'Regenerate requested.');
      refresh();
    } catch (e) {
      toast.error(e?.message ?? 'Could not start regenerate.');
    } finally {
      setBusy(null);
    }
  };

  const genRunning = jobs.generate?.status === 'running';
  const regenRunning = jobs.regenerate?.status === 'running';

  if (q.isLoading) return <Card><Skeleton className="h-24 w-full" /></Card>;
  if (q.error) return <Card><ErrorState error={q.error} onRetry={q.refetch} title="Could not load the pool overview" /></Card>;

  return (
    <div className="space-y-5">
      {cons.alert && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-bg p-3 text-danger-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-sm">
            The most active member is down to <b>{cons.min_unseen}</b> unseen images
            (alert below {cons.alert_threshold}). Add more quotes in Library and run <b>Generate new</b> to top up the pool.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Images} label="Rendered pool" value={pool.rendered ?? 0} />
        <Stat icon={Layers} label="Unrendered quotes" value={pool.unrendered ?? 0} />
        <Stat icon={Sparkles} label="Total shown" value={cons.total ?? 0} />
        <Stat icon={AlertTriangle} label="Min unseen" value={cons.min_unseen ?? '—'} tone={cons.alert ? 'bad' : 'ok'} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[200px] flex-1">
            <p className="text-sm font-semibold text-primary">Generate new</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Render up to {pool.batch_size ?? 200} unrendered quotes into the pool (balanced colours).
            </p>
            <div className="mt-2"><JobStatus job={jobs.generate} /></div>
          </div>
          <Button
            variant="accent"
            busy={busy === 'generate'}
            disabled={busy != null || genRunning || (pool.unrendered ?? 0) === 0}
            onClick={doGenerate}
          >
            <Sparkles className="h-4 w-4" /> Generate new
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[200px] flex-1">
            <p className="text-sm font-semibold text-primary">Regenerate all</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Re-render every image with the current theme. Runs overnight at 01:00 IST so production is unaffected.
            </p>
            <div className="mt-2"><JobStatus job={jobs.regenerate} /></div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              busy={busy === 'regenerate-now'}
              disabled={busy != null || regenRunning || (pool.rendered ?? 0) === 0}
              onClick={() => doRegenerate(true)}
            >
              Run now
            </Button>
            <Button
              variant="accent"
              busy={busy === 'regenerate'}
              disabled={busy != null || regenRunning || (pool.rendered ?? 0) === 0}
              onClick={() => doRegenerate(false)}
            >
              <RefreshCw className="h-4 w-4" /> Queue 01:00 IST
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
          <h3 className="text-sm font-semibold text-primary">Most-seen images (top 10)</h3>
          <Button variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching} className="!px-2 !py-1 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
        {bucket.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">No images have been shown to anyone yet.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {bucket.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                {b.image_url && (
                  <img src={b.image_url} alt="" className="h-12 w-auto flex-shrink-0 rounded-control border border-border" loading="lazy" />
                )}
                <p className="min-w-0 flex-1 truncate text-sm text-primary" title={b.text}>{b.text}</p>
                <Badge tone="ok">{b.users_reached} {b.users_reached === 1 ? 'user' : 'users'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function TodaysThoughtPoolPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState('library');

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Today's Thought"
        breadcrumbs={<Breadcrumbs items={[{ label: 'Control Panel' }, { label: "Today's Thought" }]} />}
      />
      <p className="text-sm text-text-muted">
        Each member gets their own image, never repeating until they have seen the whole pool.
        Add quotes in <b>Library</b>, then <b>Generate new</b> in <b>Report</b> to render them.
      </p>

      <Tabs
        tabs={[{ key: 'library', label: 'Library' }, { key: 'report', label: 'Report' }]}
        activeKey={tab}
        onChange={setTab}
      />

      {tab === 'library'
        ? <ThoughtsAdmin canWrite={can(MODULES.THOUGHTS, ACTIONS.CREATE)} />
        : <ReportTab />}
    </div>
  );
}
