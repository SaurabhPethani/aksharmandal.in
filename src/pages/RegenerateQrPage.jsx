import { useState } from 'react';
import { QrCode, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PageHeader, Card, Button, Badge } from '../components/ui';
import { Breadcrumbs } from '../components/Navigation';
import { useToast } from '../hooks';
import { profileService } from '../services/profileService';

// SuperAdmin-only: rewrite every member's QR JPEG with the CURRENT payload in
// one call. This exists for one job — the migration to the scheme-tagged
// payload (`AKC1:{id}`). Before the tag, codes encoded a bare number and any
// QR with digits in it (a GPay / BHIM UPI code) could be read as a member id;
// the scanner now accepts only tagged (and, transitionally, legacy bare)
// codes, so every distributed code has to be re-rendered once to carry the tag.
//
// It is safe to run again — regenerating overwrites the same deterministic
// filename rather than duplicating anything — so it doubles as a repair button
// if the QR files on disk are ever lost.

export default function RegenerateQrPage() {
  const toast = useToast();
  const [running, setRunning] = useState(false);
  // The last run's counts, so the admin sees proof it swept rather than a
  // toast that has already faded.
  const [summary, setSummary] = useState(null);

  const doRun = async () => {
    if (!window.confirm(
      'Regenerate the QR code for every member in your scope? This rewrites each '
      + 'image with the current payload. It is safe to repeat, but you must purge '
      + 'the Cloudflare cache afterwards for members to receive the new images.'
    )) return;
    setRunning(true);
    try {
      const res = await profileService.regenerateAllQr();
      const data = res?.data ?? {};
      setSummary({
        total: data.total ?? 0,
        regenerated: data.regenerated ?? 0,
        failed: data.failed ?? 0,
      });
      toast.success(res?.detail || 'QR codes regenerated.');
    } catch (e) {
      toast.error(e?.message || 'Could not regenerate the QR codes.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Regenerate QR Codes"
        breadcrumbs={<Breadcrumbs items={[{ label: 'Control Panel' }, { label: 'Regenerate QR Codes' }]} />}
      />
      <p className="text-sm text-text-muted">
        Rewrites every member&apos;s QR image with the current format. Run this{' '}
        <b>once after a QR format change</b> so every distributed code carries the new
        payload — the attendance scanner accepts only the app&apos;s own codes, and an
        old code keeps working only until you switch the app fully over to the new one.
        SuperAdmin regenerates the whole organisation; it is safe to run again.
      </p>

      {/* The one action. */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[200px] flex-1">
            <p className="text-sm font-semibold text-primary">Regenerate all QR codes now</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Overwrites every member&apos;s QR JPEG in your scope.
            </p>
          </div>
          <Button variant="accent" busy={running} disabled={running} onClick={doRun}>
            <QrCode className="h-4 w-4" /> Regenerate all
          </Button>
        </div>

        {/* Result of the last run: counts, so the sweep is auditable on screen. */}
        {summary && (
          <div className="mt-4 space-y-3 rounded-xl bg-primary-50 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1.5">
                {summary.failed === 0
                  ? <CheckCircle2 className="h-4 w-4 text-success-fg" />
                  : <AlertTriangle className="h-4 w-4 text-danger-fg" />}
                <Badge tone={summary.failed === 0 ? 'ok' : 'bad'}>
                  {summary.regenerated} of {summary.total} regenerated
                </Badge>
              </span>
              {summary.failed > 0 && (
                <span className="text-danger-fg">
                  {summary.failed} failed — check the server log for the member ids.
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* The step that is easy to forget and silently undoes the whole run. */}
      <Card className="border-accent/40 bg-accent/10">
        <div className="flex items-start gap-3">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold text-primary">Purge the CDN cache next</p>
            <p className="mt-0.5 text-xs text-text-muted">
              The QR images are cached at the edge. After regenerating, purge Cloudflare
              for <code className="rounded bg-bg px-1 py-0.5">/api/v1/qr/codes/*</code> (or
              purge everything) — otherwise members keep downloading the old images and the
              regeneration has no visible effect.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
