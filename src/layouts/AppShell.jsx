import { Suspense, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Menu, User } from 'lucide-react';
import { usePermissions, useAuth, useProfileImage } from '../hooks';
import { useActivityHeartbeat } from '../hooks/useAnalytics';
import { CollapsedRail, ExpandedPanel } from './Sidebar';
import { PageLoader } from '../components/ui';
import ErrorBoundary from '../components/ErrorBoundary';
import NotificationBell from '../components/NotificationBell';
import AccountSwitcher from '../components/AccountSwitcher';
import SiteFooter from '../components/SiteFooter';
import { canReadHelp } from '../constants/roles';

// One flag drives the sidebar, matching the live site: "closed" is the 72px rail
// on desktop and fully hidden on mobile, where the expanded panel is the drawer.
export default function AppShell() {
  const { navModules, roleId, roleName, userName, userId } = usePermissions();
  const { signOut } = useAuth();
  // Presence heartbeat for the traffic dashboard — runs for every signed-in user
  // while the app is on screen. Mounted here because the shell wraps every
  // authed page and never unmounts between them.
  useActivityHeartbeat();
  // The header chip shows the caller's own photo, from the same endpoint
  // /profile uploads it to — GET /api/v1/profile-image/users/{id}. Cached as a
  // lookup, so moving between pages does not refetch it. Until one is uploaded
  // `image_url` is null and the accent disc below stands in.
  const photo = useProfileImage(userId).data?.image_url || null;
  // Resets the page-level error boundary on navigation — see below.
  const { pathname } = useLocation();
  // Open by default on desktop, closed on phones/tablets — otherwise the drawer
  // covers the whole app on first load below lg.
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches
  );

  /**
   * Below lg the panel is a full-height DRAWER over the content, not a rail
   * beside it. That is fine when it was opened deliberately, and not fine when
   * the viewport arrived there on its own — rotating a tablet from landscape to
   * portrait, or dragging a desktop window narrow, left the sidebar covering the
   * page with the menu button hidden behind it.
   *
   * One direction only. Falling below lg closes it; going back above does NOT
   * reopen it, because by then "closed" may be a choice the user made on the
   * desktop rail and reopening would undo it on every rotation.
   */
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e) => { if (!e.matches) setOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const closeOnMobile = () => {
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) setOpen(false);
  };

  return (
    <div className="min-h-full">
      {open && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ background: 'rgba(10,15,40,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-30 h-full transition-all duration-300 ease-in-out ${
          open ? 'w-[300px] sm:w-[320px]' : 'w-0 overflow-hidden lg:w-[72px]'
        }`}
      >
        {open ? (
          <ExpandedPanel
            roleName={roleName}
            onCollapse={() => setOpen(false)}
            onNavigate={closeOnMobile}
            onSignOut={signOut}
          />
        ) : (
          <CollapsedRail onSignOut={signOut} />
        )}
      </aside>

      {/* `content-type` steps every text size in here up by 1pt — see index.css.
          It sits on this wrapper rather than on <main> so the header bar scales
          with the page it sits above. The sidebar is outside it, deliberately. */}
      {/*
        `min-h-dvh`, NOT `min-h-full`.

        `min-h-full` is `min-height: 100%`, which resolves against the PARENT'S
        height — and the parent here is itself only `min-h-full`, so its computed
        height is auto and the percentage has nothing to measure. The column
        collapsed to its content, and on a short page the footer stopped
        wherever the content did, with empty background below it.

        A viewport unit needs no such chain. With <main> as `flex-1`, a short
        page pushes the footer to the bottom of the screen and a long one lets
        it follow the content, which is what a footer should do in both cases.
      */}
      <div className={`content-type flex min-h-dvh flex-col transition-all duration-300 ease-in-out ${open ? 'lg:ml-[320px]' : 'lg:ml-[72px]'}`}>
        {/* Dark bar with an orange avatar chip on the right, matching the live site. */}
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-primary px-3 sm:px-4 lg:px-6">
          {!open && (
            <button
              className="shrink-0 rounded-control p-2 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          {/* Help book, then bell, then a hairline, then the profile chip.
              The book sits BEFORE the bell so the two icon buttons read as
              a small pair, then the rule separates them from the identity
              chip. The rule is decorative and goes with the bell, since a
              divider with nothing on one side of it is just a mark.

              THE BOOK IS ABSENT FOR THE ROLES THAT MAY NOT READ THE MANUAL —
              see canReadHelp in constants/roles.js. Dropped whole rather than
              disabled: a greyed-out button in a header is a thing to wonder
              about, and the bell simply moves left. The /help route asks the
              same function, so typing the URL is refused too. */}
          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
            {canReadHelp(roleId) && (
              <Link
                to="/help"
                aria-label="Help &amp; FAQ"
                title="Help &amp; FAQ"
                className="grid h-10 w-10 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <BookOpen className="h-5 w-5" />
              </Link>
            )}
            <NotificationBell />
            {/* Family account switcher — only renders for a parent who manages
                child accounts; a normal member sees nothing here. */}
            <AccountSwitcher />
            <span className="hidden h-7 w-px bg-white/15 sm:block" aria-hidden="true" />

            <Link
              to="/profile"
              className="flex min-w-0 items-center gap-3 rounded-control py-1.5 pl-1.5 pr-2 transition-colors hover:bg-white/10"
            >
              {/* The photo, cropped to the disc. Without one, the same accent disc
                  and filled glyph as before — the chip keeps its size and colour
                  either way, so the header does not shift once one is uploaded. */}
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-accent text-white">
                {photo
                  ? <img src={photo} alt="" className="h-full w-full object-cover" />
                  : <User className="h-5 w-5" fill="currentColor" strokeWidth={0} />}
              </span>
              {/* Hidden on the narrowest screens: the name and role are what the
                  header sheds first when the bell has to fit beside them, and the
                  avatar alone still reaches /profile. */}
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="block truncate text-sm font-semibold text-white">{userName || 'User'}</span>
                <span className="block truncate text-xs text-white/70">{roleName}</span>
              </span>
            </Link>
          </div>
        </header>

        {/*
          `isolate` is load-bearing, not tidiness.

          The header above is `sticky z-10`. Page content is free to use z-index
          for its own internal layering — the user form's Stepper puts its step
          circles at `z-10` so they sit over the line joining them — and at equal
          z-index the later element in the DOM wins. So the step circles painted
          straight over the header, on top of the bell and the profile chip.

          `isolation: isolate` makes this element a stacking context, so every
          z-index inside a page is resolved WITHIN it and can never reach the
          header's level. One line here instead of policing z-index in every
          page, and the next component that needs an internal z-10 cannot
          reintroduce the bug.
        */}
        <main className="isolate min-w-0 flex-1 p-3 sm:p-4 lg:p-6">
          {/* A page that throws loses only this area — the sidebar and header
              stay, so the user can navigate away instead of reloading. Keyed on
              the pathname so doing exactly that clears the error.
              Outside Suspense, so it also catches a lazy chunk that fails to
              load after a mid-session deploy, which would otherwise suspend
              forever behind the fallback. */}
          <ErrorBoundary resetKey={pathname} title="This page ran into a problem">
            {/* Route components are lazy-loaded; this catches their suspense. */}
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>

        {/* Below <main>, which is `flex-1` inside this column — so on a short
            page the footer is pushed to the bottom of the viewport rather than
            floating up under the content. Outside the ErrorBoundary too: a page
            that throws keeps its frame, footer included. */}
        <SiteFooter />
      </div>
    </div>
  );
}
