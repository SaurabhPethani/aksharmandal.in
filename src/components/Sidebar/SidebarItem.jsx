import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Circle } from 'lucide-react';
import { useDismissable } from '../../hooks';

/**
 * Is `pathname` inside `base`? Segment-aware, so /users does not light up for
 * /users-archive while still matching its own sub-routes (/users/12/edit).
 */
function isUnder(pathname, base) {
  if (!base) return false;
  return pathname === base || pathname.startsWith(base.endsWith('/') ? base : `${base}/`);
}

/** Does the active route live anywhere in this subtree? Any depth. */
function subtreeIsActive(children = [], pathname) {
  return children.some(
    (child) =>
      isUnder(pathname, child.path || child.route) ||
      subtreeIsActive(child.children, pathname)
  );
}

/**
 * The hover flyout of the 72px rail. Recurses so a third or fourth level shows
 * up as an indented run rather than being silently dropped — the rail has no
 * room for nested disclosure, so the subtree is flattened visually but in full.
 */
function RailFlyoutList({ items = [], onNavigate, depth = 0 }) {
  return items.map((child) => {
    const label = child.label || child.display_name;
    const grandchildren = child.children || [];

    return (
      <div key={child.id}>
        {child.path || child.route ? (
          <NavLink
            to={child.path || child.route}
            onClick={onNavigate}
            style={{ paddingLeft: `${0.75 + depth * 0.625}rem` }}
            className={({ isActive }) =>
              `block rounded-lg py-2 pr-3 text-sm font-semibold transition-colors ${
                isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {label}
          </NavLink>
        ) : (
          // A grouping level with no route of its own is a heading, not a link.
          <div
            style={{ paddingLeft: `${0.75 + depth * 0.625}rem` }}
            className="py-1.5 pr-3 text-[0.72rem] font-bold uppercase tracking-wide text-white/45"
          >
            {label}
          </div>
        )}
        {grandchildren.length > 0 && (
          <div className="mt-1 space-y-1">
            <RailFlyoutList items={grandchildren} onNavigate={onNavigate} depth={depth + 1} />
          </div>
        )}
      </div>
    );
  });
}

/**
 * A group on the collapsed 72px rail: an icon that opens its children in a
 * flyout beside it.
 *
 * Click, not hover. The flyout used to be pure CSS (`hidden group-hover:block`),
 * so it appeared under the pointer on the way past — and being CSS-only it could
 * not be dismissed, only moved away from. It is now real state, closed by
 * clicking outside, pressing Escape, or following one of its links.
 *
 * IT IS ALSO A PORTAL, and that is not a refinement — it is the only way this
 * panel is visible at all. It used to be `absolute left-full` inside the rail,
 * where TWO ancestors cut it off: the shell's `<aside>` is `w-0 overflow-hidden
 * lg:w-[72px]` and never lifts that `overflow-hidden` at `lg`, and the rail
 * itself scrolls vertically — and `overflow-y: auto` computes `overflow-x` to
 * `auto` too, so a box at `left: 100%` of a 72px column is outside both. The
 * markup was there and the state was flipping; there was nothing on screen.
 *
 * Neither clip can simply be removed: the aside collapses to `w-0` on mobile and
 * must swallow its contents, and the rail has more icons than a short viewport
 * has room for. So the panel leaves the subtree entirely and is placed against
 * the button's viewport rect — `position: fixed`, which is what the rail already
 * is, so there is no page scroll to correct for.
 */
function RailGroup({ item, childIsActive, IconComponent, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  /**
   * The dismiss zone is the button PLUS the portalled panel. `useDismissable`
   * asks one ref whether it contains the event target, and the panel is no
   * longer inside the button's subtree — left as a plain ref, mousedown inside
   * the flyout would read as "outside", close it, and destroy the link before
   * its own click could fire. Every child link would look dead. So the ref hands
   * over a node-like object answering for both.
   */
  const zoneRef = useRef(null);
  zoneRef.current = {
    contains: (node) => Boolean(btnRef.current?.contains(node) || panelRef.current?.contains(node)),
  };
  useDismissable(zoneRef, () => setOpen(false), open);

  /** Beside the button, a gap off its right edge. */
  const place = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.top, left: rect.right + 8 });
  }, []);

  // Re-placed rather than pinned: the rail scrolls under the panel, and `true`
  // catches that scroll — it happens on an ancestor, not on the window.
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  /**
   * Lift a panel that would hang off the bottom — Admin is the longest list in
   * the menu and its icon sits low in the rail. Measured after paint because a
   * list of unknown length has no height until it has one, and compared before
   * setting so this settles in one pass instead of looping.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const height = panelRef.current?.offsetHeight;
    if (!height) return;
    const top = Math.max(8, Math.min(pos.top, window.innerHeight - height - 8));
    if (top !== pos.top) setPos((p) => ({ ...p, top }));
  }, [open, pos.top]);

  const openFlyout = () => {
    place();
    setOpen((v) => !v);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={openFlyout}
        aria-expanded={open}
        aria-haspopup="true"
        title={item.label || item.display_name}
        className={`flex w-full items-center justify-center rounded-xl p-3 transition-all duration-150 ${
          childIsActive ? 'text-white' : 'text-[#6B7FA3] hover:bg-primary-50 hover:text-primary'
        }`}
        style={
          childIsActive
            ? { background: 'linear-gradient(135deg,#003158,#002849)', boxShadow: '0 4px 12px rgba(0,49,88,0.30)' }
            : {}
        }
      >
        <IconComponent className="h-5 w-5" />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          // z-50 on the body, so it clears the shell's own z-30 aside and the
          // z-20 mobile scrim rather than competing with them from inside.
          className="scrollbar-none fixed z-50 max-h-[calc(100vh-1rem)] min-w-[180px] overflow-y-auto rounded-xl bg-[#002548] p-2 text-white shadow-xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="border-b border-white/10 px-3 py-1.5 text-sm font-bold uppercase text-white/60">
            {item.label || item.display_name}
          </div>
          <div className="mt-1 space-y-1">
            <RailFlyoutList
              items={item.children}
              // Following a link closes the flyout as well as running whatever
              // the sidebar does on navigate (closing the mobile drawer).
              onNavigate={() => { setOpen(false); onNavigate?.(); }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function SidebarItem({ item, depth = 0, onNavigate, isRail = false }) {
  const location = useLocation();
  const hasChildren = item.children && item.children.length > 0;

  const childIsActive = hasChildren && subtreeIsActive(item.children, location.pathname);

  // Whether the current page lives in this section at all — its own route or
  // any descendant's.
  const sectionIsActive = childIsActive || isUnder(location.pathname, item.path || item.route);

  // A submenu opens ONLY on click. It used to also open on hover, which meant
  // sweeping the pointer across the sidebar on the way to something else threw
  // groups open, and the section under the cursor could never be left shut.
  const [expanded, setExpanded] = useState(sectionIsActive);

  /**
   * EVERY NAVIGATION RESETS THIS SECTION TO "am I the page you are on?".
   *
   * So opening Admin and then going to a page outside it closes Admin again,
   * instead of leaving it hanging open over an unrelated screen. Only one
   * section can be open at a time now, without any section having to know about
   * the others — each independently answers for the route.
   *
   * This replaces a localStorage-backed version (`akshar_expanded_nav_groups`).
   * That persistence was the actual bug: clicking Admin wrote `true`, and
   * nothing ever wrote `false` on the way out, so the section stayed open across
   * navigations AND across reloads, on every page.
   *
   * Keyed on `location.pathname` alone, deliberately. `sectionIsActive` is
   * derived from it and from `item`, so a re-render that leaves the route
   * unchanged must NOT re-run this — that would fight the user's own click and
   * make a section on the current page impossible to collapse by hand.
   */
  useEffect(() => {
    setExpanded(sectionIsActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleExpand = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setExpanded((prev) => !prev);
  };

  const IconComponent = item.icon || Circle;

  if (isRail) {
    // Collapsed 72px Rail view
    if (hasChildren) {
      return (
        <RailGroup
          item={item}
          childIsActive={childIsActive}
          IconComponent={IconComponent}
          onNavigate={onNavigate}
        />
      );
    }

    return (
      <NavLink
        to={item.path || item.route || '#'}
        title={item.label || item.display_name}
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center justify-center rounded-xl p-3 transition-all duration-150 ${
            isActive ? 'text-white' : 'text-[#6B7FA3] hover:bg-primary-50 hover:text-primary'
          }`
        }
        style={({ isActive }) =>
          isActive ? { background: 'linear-gradient(135deg,#003158,#002849)', boxShadow: '0 4px 12px rgba(0,49,88,0.30)' } : {}
        }
      >
        <IconComponent className="h-5 w-5" />
      </NavLink>
    );
  }

  // Expanded panel view with indentations based on depth
  const indentClass = depth === 0 ? '' : depth === 1 ? 'ml-3 pl-2 border-l border-white/15' : 'ml-4 pl-2 border-l border-white/10';

  if (hasChildren) {
    return (
      <div className={`space-y-1 ${indentClass}`}>
        {/* Selected AND hovered are the same look — white plate, blue text —
            which is why this is Tailwind classes rather than the inline `style`
            it replaces: an inline style cannot express `:hover` at all, so the
            old version could only fade opacity on the way past. The icon, the
            label and the chevron all inherit `currentColor`, so one text colour
            on the container turns the whole row over. */}
        <button
          onClick={toggleExpand}
          aria-expanded={expanded}
          className={`group flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all duration-150 ${
            sectionIsActive
              ? 'border-white bg-white text-primary'
              : 'border-white/10 bg-white/[0.06] text-white/85 hover:border-white hover:bg-white hover:text-primary'
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <IconComponent className="h-5 w-5 shrink-0" />
            <span className="truncate text-base font-semibold">
              {item.label || item.display_name}
            </span>
          </div>
          {/* Held one step back from the label so the row still reads
              label-first, in both states. */}
          {expanded ? (
            <ChevronDown className={`h-4 w-4 shrink-0 ${sectionIsActive ? 'text-primary/60' : 'text-white/60 group-hover:text-primary/60'}`} />
          ) : (
            <ChevronRight className={`h-4 w-4 shrink-0 ${sectionIsActive ? 'text-primary/50' : 'text-white/40 group-hover:text-primary/50'}`} />
          )}
        </button>

        {expanded && (
          <div className="mt-1 space-y-1.5 pt-0.5">
            {item.children.map((child) => (
              <SidebarItem
                key={child.id}
                item={child}
                depth={depth + 1}
                onNavigate={onNavigate}
                isRail={false}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={indentClass}>
      {/* Same two states as the group header above, for the same reason. */}
      <NavLink
        to={item.path || item.route || '#'}
        onClick={onNavigate}
        className={({ isActive }) =>
          `group flex items-center justify-between rounded-2xl border px-4 py-3 transition-all duration-150 ${
            isActive
              ? 'border-white bg-white text-primary'
              : 'border-white/10 bg-white/10 text-white/85 hover:border-white hover:bg-white hover:text-primary'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <IconComponent className="h-5 w-5 shrink-0" />
              <span className="truncate text-base font-semibold">
                {item.label || item.display_name}
              </span>
            </div>
            <ChevronRight className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary/50' : 'text-white/40 group-hover:text-primary/50'}`} />
          </>
        )}
      </NavLink>
    </div>
  );
}
