import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth, usePermissions } from '../hooks';
import { ACTIONS, ADMIN_SECTION_MODULES, MODULES } from '../constants/permissions';
import { canReadHelp, canSeeNotLoggedIn } from '../constants/roles';
import { PermissionProvider } from '../contexts/PermissionContext';
import AppShell from '../layouts/AppShell';
import { PageLoader } from '../components/ui';

// Route components are code-split; only the shell and login ship in the entry
// chunk. usePermissions is read inside AuthedRoutes, so it must sit under
// PermissionProvider.
const LoginPage = lazy(() => import('../pages/LoginPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const ModulePage = lazy(() => import('../pages/ModulePage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const MembersPage = lazy(() => import('../pages/MembersPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const NotificationsPage = lazy(() => import('../pages/NotificationsPage'));
const BirthdaysPage = lazy(() => import('../pages/BirthdaysPage'));
const UserFormPage = lazy(() => import('../pages/UserFormPage'));
const UserDetailsPage = lazy(() => import('../pages/UserDetailsPage'));
const AttendancePage = lazy(() => import('../pages/AttendancePage'));
const ReportsPage = lazy(() => import('../pages/ReportsPage'));
const ComparePage = lazy(() => import('../pages/ComparePage'));
const YuvaSevaPage = lazy(() => import('../pages/YuvaSevaPage'));
const AttendanceScanPage = lazy(() => import('../pages/AttendanceScanPage'));
const AttendanceMarkPage = lazy(() => import('../pages/AttendanceMarkPage'));
const SpecialSabhaReportPage = lazy(() => import('../pages/SpecialSabhaReportPage'));
const HierarchyPage = lazy(() => import('../pages/HierarchyPage'));
const MasterDataPage = lazy(() => import('../pages/MasterDataPage'));
const LogsPage = lazy(() => import('../pages/LogsPage'));
const RolesPage = lazy(() => import('../pages/RolesPage'));
const ApprovalsPage = lazy(() => import('../pages/ApprovalsPage'));
const EventsPage = lazy(() => import('../pages/EventsPage'));
const JobsPage = lazy(() => import('../pages/JobsPage'));
const ForbiddenPage = lazy(() => import('../pages/ForbiddenPage'));
const HelpPage = lazy(() => import('../pages/HelpPage'));
const TrafficPage = lazy(() => import('../pages/TrafficPage'));
const ChangeMobilePage = lazy(() => import('../pages/ChangeMobilePage'));
const OpenAttendancePage = lazy(() => import('../pages/OpenAttendancePage'));
const SabhaSpawnPage = lazy(() => import('../pages/SabhaSpawnPage'));
const TodaysThoughtPoolPage = lazy(() => import('../pages/TodaysThoughtPoolPage'));
const RegenerateQrPage = lazy(() => import('../pages/RegenerateQrPage'));
const NotLoggedInPage = lazy(() => import('../pages/NotLoggedInPage'));

// Modules with a bespoke screen. Anything not listed falls back to the generic
// ModulePage, so a newly granted module still renders.
const MODULE_PAGES = {
  members: MembersPage,
  attendance: AttendancePage,
  reports: ReportsPage,
  compare: ComparePage,
  'yuva-seva': YuvaSevaPage,
  hierarchy: HierarchyPage,
  'master-data': MasterDataPage,
  logs: LogsPage,
  roles: RolesPage,
  approvals: ApprovalsPage,
  events: EventsPage,
  jobs: JobsPage,
};

/**
 * Route-level permission gate.
 *
 * Protection is declared HERE, in the route table, rather than inside each page.
 * Page-level checks work but depend on every page remembering to do one, and a
 * route added later is unprotected by default — the failure is silent and the
 * only way to audit it is to open every file. Reading this table now tells you
 * what guards every URL.
 *
 * The pages keep their own checks as well. That is deliberate: a component
 * rendered from somewhere other than this table still refuses.
 */
function RequirePermission({ module, action, label, children }) {
  const { can } = usePermissions();
  if (can(module, action)) return children;
  return <ForbiddenPage message={`Your role does not grant access to ${label}.`} />;
}

/**
 * The same gate, waived when the record IS the caller.
 *
 * EDITING YOURSELF IS NOT A PERMISSION. USERS:UPDATE is the grant to change
 * somebody else's record; requiring it for your own made whether a member could
 * fix their own email depend on their rank, so the Edit button on /profile
 * worked for a Sabha Head and not for a Yuvak.
 *
 * The API already draws the line this way — PATCH /users/me and
 * POST /information-requests are open to every authenticated role — and the
 * form routes a self-edit to those endpoints rather than to PATCH /users/{id}.
 * The grant still governs every OTHER member's record, checked exactly as before.
 *
 * Only :userId is trusted here, never a query string or state: it is the same
 * value the form uses to decide it is a self-edit, so the two cannot disagree.
 */
function RequireSelfOrPermission({ module, action, label, children }) {
  const { can, userId: callerId } = usePermissions();
  const { userId } = useParams();
  if (String(userId ?? '') === String(callerId ?? '')) return children;
  if (can(module, action)) return children;
  return <ForbiddenPage message={`Your role does not grant access to ${label}.`} />;
}

/**
 * The SECOND gate on the four pages inside the Admin section — ADMIN:READ, on
 * top of each page's own module grant.
 *
 * ⚠ IT ASKS ONLY WHEN THE RESPONSE DESCRIBES `ADMIN`. `can()` answers false both
 * for "denied" and for "never mentioned", and those are different: a
 * full-context that omits the module entirely would take Hierarchy, Master Data,
 * Logs and User Roles away from EVERYONE, including the roles that hold them.
 * With nothing to check against, the page's own grant stands alone — which is
 * exactly what the Left Navigation does with an ancestor it was not told about
 * (see services/navigation.service.js). A response that does describe ADMIN gets
 * the full two-permission rule.
 */
/**
 * The Help page's gate — a role list, not a grant.
 *
 * Refused with the 403 rather than the 404, and rather than a redirect: the page
 * exists, this role may not read it, and those are different answers. The same
 * shape every other refusal on this table takes.
 */
function RequireHelpAccess({ children }) {
  const { roleId } = usePermissions();
  if (canReadHelp(roleId)) return children;
  return <ForbiddenPage message="Your role does not grant access to the Help & FAQ." />;
}

// The "Not Login" list — Yuva Seva rank and above (see canSeeNotLoggedIn). The
// backend enforces the same cut by scope band on /users/not-logged-in, so this
// only decides what to render.
function RequireNotLoggedInAccess({ children }) {
  const { roleId } = usePermissions();
  if (canSeeNotLoggedIn(roleId)) return children;
  return <ForbiddenPage message="This list is available to Yuva Seva and above." />;
}

function RequireAdminSection({ children }) {
  const { can, byName } = usePermissions();
  if (!byName?.[MODULES.ADMIN]) return children;
  if (can(MODULES.ADMIN, ACTIONS.READ)) return children;
  return <ForbiddenPage message="Your role does not grant access to the Admin section." />;
}

// Traffic analytics is a SuperAdmin utility, not a permission module — so the
// gate is the role name, the same shape the Help gate uses. The backend enforces
// the same rule on /analytics/traffic, so this only decides what to render.
function RequireSuperAdmin({ children }) {
  const { roleName } = usePermissions();
  if (roleName === 'SuperAdmin') return children;
  return <ForbiddenPage message="Traffic analytics is available to Super Admins only." />;
}

// A delegable Control-Panel tool: SuperAdmin always, plus any role granted the
// tool's permission. SuperAdmin passes by role name so it can never be locked
// out of a tool by how a brand-new module is enumerated in full-context. The
// backend enforces the same permission (and clamps data to the caller's scope).
function RequirePermissionOrSuperAdmin({ module, action, label, children }) {
  const { can, roleName } = usePermissions();
  if (roleName === 'SuperAdmin' || can(module, action)) return children;
  return <ForbiddenPage message={`Your role does not grant access to ${label}.`} />;
}

// Routes come from `allModules`, not from the Left Navigation: hiding a menu
// entry with is_visible_nav=false is presentation, and does not revoke a page
// the user holds actions on. Access is decided per route below, from `visible`
// — "any granted action" — and refused with a 403 rather than a 404.
function AuthedRoutes({ modules }) {
  return (
    <Routes>
      {/* Signing in leaves the URL at /login, so send it on to the dashboard.
          Without this the authed route table has no /login match and the request
          falls through to the catch-all 404. */}
      <Route path="/login" element={<Navigate to="/dashboard" replace />} />

      <Route element={<AppShell />}>
        {/* The only statically-declared destinations. Profile is the signed-in
            user's own account, reached from the header chip — it is not a module,
            so it carries no permission gate.
            Notifications is the same shape: it is a VIEW over lists the caller
            is already granted (transfers, information-change requests), not a
            module of its own, so it has no grant to gate on. What it shows is
            decided entirely by the grants on those sources — a caller who may
            review nothing sees an empty screen, never a 403. */}
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        {/* Birthdays is the same shape again: it reads
            /users/today-birthdays, the one member endpoint with NO permission
            gate — any authenticated member may call it, and every caller is
            clamped to their own Mandal by the backend. There is no module and
            no grant to gate on, so gating it here would invent one. */}
        <Route path="/birthdays" element={<BirthdaysPage />} />
        {/* Help / FAQ — a static reference manual keyed to the app's role
            model. It has no module and no grant behind it, so there is nothing
            in full-context to gate it on; the gate is a role list instead, and
            the header's book icon reads the SAME function so the menu and the
            URL cannot disagree. See canReadHelp in constants/roles.js. */}
        <Route path="/help" element={<RequireHelpAccess><HelpPage /></RequireHelpAccess>} />
        {/* Traffic analytics — SuperAdmin only, gated by role (see
            RequireSuperAdmin). Not a module, so it lives here with the other
            statically-declared destinations. */}
        <Route path="/analytics" element={<RequireSuperAdmin><TrafficPage /></RequireSuperAdmin>} />
        {/* Change Mobile Number — SuperAdmin only, same gate as Traffic. */}
        {/* Change Mobile — delegable: SuperAdmin, plus any role granted
            USER_ADMIN:CHANGE_MOBILE (scope-clamped by the backend). */}
        <Route
          path="/change-mobile"
          element={(
            <RequirePermissionOrSuperAdmin module={MODULES.USER_ADMIN} action={ACTIONS.CHANGE_MOBILE} label="Change Mobile">
              <ChangeMobilePage />
            </RequirePermissionOrSuperAdmin>
          )}
        />
        <Route path="/open-attendance" element={<RequireSuperAdmin><OpenAttendancePage /></RequireSuperAdmin>} />
        {/* Sabha Spawn — SuperAdmin only, same gate. Manual fallback + last-run
            status for the daily 12:00 IST spawner. */}
        <Route path="/sabha-spawn" element={<RequireSuperAdmin><SabhaSpawnPage /></RequireSuperAdmin>} />
        {/* Today's Thought Pool — SuperAdmin only. Bulk generate / regenerate the
            per-user image pool + consumption analytics. */}
        <Route path="/todays-thought-pool" element={<RequireSuperAdmin><TodaysThoughtPoolPage /></RequireSuperAdmin>} />
        {/* Regenerate all QR codes — SuperAdmin only, same gate. Bulk migration
            tool for a QR payload/format change (e.g. the AKC1: scheme tag). */}
        <Route path="/regenerate-qr" element={<RequireSuperAdmin><RegenerateQrPage /></RequireSuperAdmin>} />
        {/* Not Login — members in the caller's scope who never signed in.
            Rank >= 20 (Yuva Seva and above); linked from the dashboard. */}
        <Route path="/not-logged-in" element={<RequireNotLoggedInAccess><NotLoggedInPage /></RequireNotLoggedInAccess>} />

        {/* Compare is now a first-class RBAC module (COMPARE:VIEW): its route,
            menu item and 403 gating are emitted from full-context by the block
            below (MODULE_PAGES.compare → ComparePage), like every other module. */}

        {/* Everything else is emitted from full-context — every module it
            described, granted or not. An ungranted one renders the 403 instead of
            its page, so typing the URL is refused explicitly rather than falling
            through to the 404. The route existing grants nothing: the page is
            never mounted, and the backend gates every request regardless. */}
        {modules.map((m) => {
          const Page = MODULE_PAGES[m.page] ?? ModulePage;
          const page = m.visible ? (
            <Page module={m} />
          ) : (
            <ForbiddenPage message={`Your role does not grant access to ${m.label}.`} />
          );

          return (
            <Route
              key={m.name}
              path={m.path}
              element={
                /*
                  TWO PERMISSIONS FOR THE FOUR PAGES INSIDE THE ADMIN SECTION —
                  Hierarchy, Master Data, Logs and User Roles. Their own grant
                  says whether the caller may read that thing; ADMIN:READ says
                  whether they may be in the section it lives in at all, and both
                  have to answer yes.

                  The Left Navigation already applies this rule (a section's
                  grant gates its whole branch — see navigation.service.js), so
                  these four are absent from the menu without ADMIN:READ. Without
                  the same rule HERE, typing the URL walked straight past the
                  menu into the page.
                */
                ADMIN_SECTION_MODULES.includes(m.name)
                  ? <RequireAdminSection>{page}</RequireAdminSection>
                  : page
              }
            />
          );
        })}

        {/* Member sub-routes. Declared here rather than generated, because they
            are actions on the Members module rather than modules of their own —
            and each carries the action that guards it, so what protects a URL is
            visible beside the URL. Add and Edit are the same page; the :userId is
            what puts it in edit mode. */}
        {/* OUTSIDE the module check below, deliberately.
            Editing your own record is not a Members-module action — a member
            with no access to the Members module at all still has a /profile,
            and its Edit button leads here. Left inside that block the URL was
            not registered for them and the button landed on Not Found.
            `RequireSelfOrPermission` is what keeps it safe: anyone else's id
            still needs USERS:UPDATE. */}
        <Route
          path="/users/:userId/edit"
          element={
            <RequireSelfOrPermission module={MODULES.USERS} action={ACTIONS.UPDATE} label="editing a member">
              <UserFormPage />
            </RequireSelfOrPermission>
          }
        />

        {modules.some((m) => m.name === MODULES.USERS) && (
          <>
            <Route
              path="/users/new"
              element={
                <RequirePermission module={MODULES.USERS} action={ACTIONS.CREATE} label="adding a member">
                  <UserFormPage />
                </RequirePermission>
              }
            />
            {/* Register a no-mobile child under a parent. Same USERS:CREATE gate
                as /users/new; ranked above /users/:userId so "new-child" is never
                read as a user id. */}
            <Route
              path="/users/new-child"
              element={
                <RequirePermission module={MODULES.USERS} action={ACTIONS.CREATE} label="registering a child">
                  <UserFormPage childMode />
                </RequirePermission>
              }
            />
            {/* Ranked below /users/new by react-router's own specificity rules,
                so "new" is never read as a user id regardless of order here. */}
            <Route
              path="/users/:userId"
              element={
                <RequirePermission module={MODULES.USERS} action={ACTIONS.READ} label="member details">
                  <UserDetailsPage />
                </RequirePermission>
              }
            />
          </>
        )}

        {/* Attendance sub-route — same arrangement: the route exists whenever
            the module does, and ATTENDANCE:CREATE decides whether it renders.
            Adding a Schedule or a Special Sabha has no route of its own: both
            are popups on the list, like every other single-record write. */}
        {modules.some((m) => m.name === MODULES.ATTENDANCE) && (
          <>
            <Route
              path="/attendance/scan"
              element={
                <RequirePermission module={MODULES.ATTENDANCE} action={ACTIONS.CREATE} label="the attendance scanner">
                  <AttendanceScanPage />
                </RequirePermission>
              }
            />
            {/* Marking one named sitting — where the Mark link on a card goes.
                Same grant as the scanner above, because it is the same act; the
                only difference is that the Sabha is in the URL rather than in a
                dropdown. Three segments, so it cannot collide with the report's
                four (`/attendance/sabha/:id/report`). */}
            <Route
              path="/attendance/:sabhaDetailId/mark"
              element={
                <RequirePermission module={MODULES.ATTENDANCE} action={ACTIONS.CREATE} label="marking attendance">
                  <AttendanceMarkPage />
                </RequirePermission>
              }
            />
            {/* A report, so it is gated on REPORTS:READ rather than on
                ATTENDANCE — the endpoint behind it is a reports endpoint.

                TWO PATHS, ONE PAGE. The Report button is offered on regular
                sittings as well as special ones, so the link it emits is
                `/attendance/sabha/…`; `/attendance/special/…` is the path it
                used to emit and is kept so an existing bookmark still opens. */}
            {['/attendance/sabha/:sabhaDetailId/report', '/attendance/special/:sabhaDetailId/report'].map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <RequirePermission module={MODULES.REPORTS} action={ACTIONS.READ} label="attendance reports">
                    <SpecialSabhaReportPage />
                  </RequirePermission>
                }
              />
            ))}
          </>
        )}

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function AppRouter() {
  const { status, permissionContext } = useAuth();

  if (status === 'booting') return <PageLoader label="Restoring session" />;

  return (
    // BASE_URL is Vite's `base` ('/aksharconnect/'); without this every route
    // would resolve at the domain root and 404 under the subpath deployment.
    //
    // No `future` prop: this is react-router 7, where `v7_startTransition` and
    // `v7_relativeSplatPath` are the default behaviour and the flags no longer
    // exist. Opting into them on v6 is what made this upgrade a version bump
    // rather than a migration.
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={<PageLoader />}>
        {status === 'authed' && permissionContext ? (
          <PermissionProvider context={permissionContext}>
            <AuthedRoutes modules={permissionContext.allModules} />
          </PermissionProvider>
        ) : (
          // Login lives at a real /login URL (matching the reference) rather than
          // rendering on every path, so the post-login redirect has somewhere to
          // redirect *from*.
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        )}
      </Suspense>
    </BrowserRouter>
  );
}
