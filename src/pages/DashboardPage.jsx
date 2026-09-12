import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, UserX } from 'lucide-react';
import { usePermissions, useDashboardOverview } from '../hooks';
import { canReadOverallDashboard, canSeeNotLoggedIn } from '../constants/roles';
import { Tabs } from '../components/Navigation';
import { ErrorState } from '../components/ui';
import AdminDashboard from '../components/dashboard/AdminDashboard';
import MyDashboard from '../components/dashboard/MyDashboard';
import QrCodeCard from '../components/dashboard/QrCodeCard';
import MemberStatsSearch from '../components/dashboard/MemberStatsSearch';
import MemberStatsDialog from '../components/dashboard/MemberStatsDialog';
import BirthdayWishesPopup from '../components/BirthdayWishesPopup';

// /dashboard is TWO DASHBOARDS BEHIND ONE TAB STRIP:
//
//   Yuvak Dashboard  data.overall  the hierarchy — everyone this caller can see
//   My Dashboard     data.self     the signed-in member alone
//
// ONE REQUEST, NOT TWO. Both halves arrive in a single GET /dashboard-overview,
// so switching tabs costs nothing and the two can never report two different
// moments. That is also why the fetch lives HERE rather than in either tab
// component — a tab that fetched its own half would ask for the whole payload
// again to use a quarter of it.
//
// /report-overview IS NO LONGER READ BY THIS SCREEN. It belongs to Reports,
// which still uses it; the backend forked /dashboard-overview off it precisely
// so a dashboard change stops being a change to a Reports API.
//
// THE ROLE DECIDES WHICH TABS EXIST, AND NOTHING ELSE DOES.
//
//   role 10   My Dashboard only, with no strip above it — see
//             canReadOverallDashboard in constants/roles.js
//   everyone  both tabs, always
//
// ⚠ THE PAYLOAD NO LONGER GETS A VOTE, and that is the point of this version.
// Each tab used to be drawn only if its half of the response passed an
// emptiness test (`hasOverallData` / `hasSelfData` in hooks/useDashboard.js) —
// which meant a SuperAdmin whose figures happened to come back all-zero got no
// strip and no dashboard at all, on a screen that had plenty to say. A tab
// showing zeroes is a true answer; a page showing nothing is not.
//
// Those two helpers are still exported and still describe what an empty block
// looks like. They are simply not what decides the tab strip any more.

const TAB_OVERALL = 'overall';
const TAB_SELF = 'self';

const BOTH_TABS = [
  { value: TAB_OVERALL, label: 'User Dashboard' },
  { value: TAB_SELF, label: 'My Dashboard' },
];

export default function DashboardPage() {
  const { userName, userId, roleId } = usePermissions();
  const { overall, self, isLoading, error, refetch } = useDashboardOverview();
  // Rank >= 20 (canSeeNotLoggedIn) can pull up any member in their scope from
  // the My Dashboard tab; the picked member's stats open in a modal.
  const [statsUserId, setStatsUserId] = useState(null);

  // The one condition on this screen. It gates the strip AND the component
  // below, so there is no path on which the hierarchy figures reach a role that
  // may not read them.
  const mayReadOverall = canReadOverallDashboard(roleId);

  // Constant per role, so no memo: two literals or none.
  const tabs = mayReadOverall ? BOTH_TABS : [];

  const [requested, setRequested] = useState(TAB_OVERALL);
  // Role 10 has only its own dashboard, whatever the state says — the strip it
  // would have chosen from is not on screen.
  const active = mayReadOverall ? requested : TAB_SELF;

  return (
    <>
      {/*
        The birthday greeting, on the dashboard and on no other screen.

        It used to be mounted in AppShell, which put its request behind every
        page in the app — Members, Reports, Attendance — for a popup none of them
        shows. Here it is asked for once, where it is shown, and it disables its
        own query once dismissed. The page it links to fetches the same data
        under the same cache key, so following it costs nothing.
      */}
      <BirthdayWishesPopup />

      <div>
        {/*
          THE SCREEN IS THREE PANELS, and this is the second and third of them —
          the first is the Left Navigation, outside this component entirely.

            2  the greeting, the tabs, and whichever dashboard is open
            3  My QR Code, a rail of its own

          The QR earns a column rather than a slot in the flow because it is the
          one thing on this page a member OPENS THE APP TO USE: it gets shown at
          the Sabha door. It sits OUTSIDE the tab strip for the same reason —
          putting it inside one tab would hide it behind a click on the other.
          Sticky, so scrolling the widgets never takes it off screen.

          A GRID FROM xl, A PLAIN STACK BELOW IT — and the grid is what lets ONE
          reading order serve both layouts. The three items are written in the
          order a phone should read them (greeting, QR, everything else) and
          placed by row and column on a wide screen:

              col 1, row 1   the greeting
              col 2, rows 1-2  the QR rail, starting level with the greeting
              col 1, row 2   the tabs and whichever dashboard is open

          As a flex row this could not be done without choosing which screen to
          get wrong. Greeting above both columns pushed the rail down by a
          heading's height, so the third panel started lower than the second;
          greeting inside the second column fixed that and put the QR card above
          the page title on a phone. Placement fixes both: the rail tops out with
          the greeting on a desktop, and the greeting still comes first on a
          phone.
        */}
        <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_19rem] xl:gap-x-5 xl:gap-y-6">
          {/* The greeting alone. The date chip that sat opposite is gone: it
              told the reader what their own device already tells them, in the
              corner where this page's actions belong.

              Greeted by first name only — "Jai Swaminarayan, Nehal". */}
          <h1 className="font-display text-xl font-bold text-primary xl:col-start-1 xl:row-start-1">
            Jai Swaminarayan, {String(userName ?? '').trim().split(/\s+/)[0] || 'Das na Das'}
          </h1>

          {/* Spans both rows so the rail has the full height of the column to
              travel in — the sticky lives on the INNER div, because a sticky
              element stretched to fill its own grid area has nowhere to move. */}
          <aside className="xl:col-start-2 xl:row-start-1 xl:row-span-2">
            <div className="space-y-4 xl:sticky xl:top-[5.5rem]">
              {/* `alwaysCollapsible` — the Show / Hide accordion the phone has
                  always had, now at every width. It still OPENS on a desktop, so
                  nothing is taken away; the reader can simply fold the code up
                  when they are not standing at the Sabha door. */}
              <QrCodeCard
                userId={userId}
                fullName={userName}
                hint="Show this at Sabha to mark your attendance"
                alwaysCollapsible
              />

              {/* "Not Login" — members in this caller's hierarchy who never
                  signed in. Yuva Seva rank and above only (canSeeNotLoggedIn);
                  a Yuvak's list would be just themselves. Sits directly below
                  the QR, per request. */}
              {canSeeNotLoggedIn(roleId) && (
                <Link
                  to="/not-logged-in"
                  className="card flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-bg"
                >
                  <span className="inline-flex items-center gap-2">
                    <UserX className="h-4 w-4 text-accent" />
                    Not Login
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-muted" />
                </Link>
              )}
            </div>
          </aside>

          <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-2">
            {error ? (
              <div className="panel">
                <ErrorState error={error} onRetry={refetch} title="Couldn’t load dashboard" />
              </div>
            ) : (
              <>
                {/* Drawn for every role that has two tabs — and only role 10
                    does not. Not gated on the payload: the strip is the shape of
                    the page, and a page whose navigation appears a second after
                    it does is a page that moves under the reader. */}
                {mayReadOverall && <Tabs tabs={tabs} value={active} onChange={setRequested} />}

                {/* No empty state and no separate loading branch. Both
                    dashboards take `loading` and draw their own skeletons, and
                    both render their tiles as em dashes when a figure is
                    missing — so a quiet week reads as zeroes, which is the true
                    answer, rather than as "nothing to show". */}
                {mayReadOverall && active === TAB_OVERALL && (
                  <AdminDashboard data={overall} loading={isLoading} />
                )}
                {active === TAB_SELF && (
                  <>
                    {/* Rank >= 20: search any member in scope and open their
                        dashboard in a modal. Above the reader's own tiles, so
                        "view a member" reads as an action on this tab. */}
                    {canSeeNotLoggedIn(roleId) && (
                      <div className="panel">
                        <MemberStatsSearch onPick={setStatsUserId} />
                      </div>
                    )}
                    <MyDashboard data={self} loading={isLoading} />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <MemberStatsDialog
        userId={statsUserId}
        isOpen={statsUserId != null}
        onClose={() => setStatsUserId(null)}
      />
    </>
  );
}
