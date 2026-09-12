import { useMemo, useState } from 'react';
import { BarChart3, Phone } from 'lucide-react';
import { PageHeader, Card, Skeleton, ErrorState } from '../components/ui';
import { Breadcrumbs } from '../components/Navigation';
import { useNotLoggedIn } from '../hooks/useUserAdmin';
import MemberStatsDialog from '../components/dashboard/MemberStatsDialog';

// "Not Login" — members inside the caller's own hierarchy scope who have never
// signed in to Akshar Connect (is_first_login still true). Reached by a link on
// the dashboard, shown only to Yuva Seva rank and above; the backend applies
// the same scope + rank cut (see GET /users/not-logged-in). Name + mobile only,
// grouped by Sabha, rendered as tap-to-call cards. Tapping the name (or the
// Stats button) opens that member's dashboard stats.

/** One member: name (opens stats) + tap-to-call mobile + a Stats button. */
function MemberCard({ id, name, mobile, onStats }) {
  const dial = String(mobile || '').replace(/[^\d+]/g, '');
  return (
    <div className="card flex items-center justify-between gap-2 p-3">
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => onStats(id)}
          className="block max-w-full truncate text-left text-sm font-semibold text-primary transition-colors hover:text-accent hover:underline"
        >
          {name || '—'}
        </button>
        {mobile ? (
          <a
            href={`tel:${dial}`}
            aria-label={`Call ${name || 'member'} on ${mobile}`}
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent hover:underline"
          >
            <Phone className="h-3 w-3 shrink-0" />
            {mobile}
          </a>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onStats(id)}
        aria-label={`View ${name || 'member'}'s statistics`}
        title="View statistics"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line-soft px-3 text-xs font-semibold text-primary transition-colors hover:border-accent/40 hover:bg-bg"
      >
        <BarChart3 className="h-3.5 w-3.5 text-accent" />
        <span className="hidden sm:inline">Stats</span>
      </button>
    </div>
  );
}

export default function NotLoggedInPage() {
  const query = useNotLoggedIn();
  const items = query.data ?? [];
  const [statsUserId, setStatsUserId] = useState(null);

  // Group Sabha-wise. The backend already orders by sabha then name, so a Map
  // preserves that order — no re-sort needed.
  const groups = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (!map.has(it.sabha_id)) map.set(it.sabha_id, { sabha_name: it.sabha_name, members: [] });
      map.get(it.sabha_id).members.push(it);
    }
    return [...map.values()];
  }, [items]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Not Login"
        breadcrumbs={<Breadcrumbs items={[{ label: 'Dashboard' }, { label: 'Not Login' }]} />}
      />
      <p className="text-sm text-text-muted">
        Members in your hierarchy who have not signed in to the Akshar Connect app yet.
        Tap a number to call, or a name to see their attendance.
      </p>

      {query.isLoading ? (
        <Card><Skeleton className="h-24 w-full" /></Card>
      ) : query.error ? (
        <Card><ErrorState error={query.error} onRetry={query.refetch} title="Could not load the list" /></Card>
      ) : items.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-text-muted">
            Everyone in your scope has logged in. 🎉
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.sabha_name}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="truncate text-sm font-semibold text-primary">{g.sabha_name}</h3>
                <span className="shrink-0 rounded-full bg-bg px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                  {g.members.length} not logged in
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {g.members.map((m) => (
                  <MemberCard
                    key={m.id}
                    id={m.id}
                    name={m.full_name}
                    mobile={m.mobile_number}
                    onStats={setStatsUserId}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <MemberStatsDialog
        userId={statsUserId}
        isOpen={statsUserId != null}
        onClose={() => setStatsUserId(null)}
      />
    </div>
  );
}
