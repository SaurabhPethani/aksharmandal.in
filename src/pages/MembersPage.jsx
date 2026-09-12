import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Search, Users } from 'lucide-react';
import {
  useFollowupPersons, useMandals, useMe, useMemberStatusUpdate, useMembers,
  useFilterState, usePermissions, usePradeshList, useSabhas, useToast,
} from '../hooks';
import { Button, PageHeader } from '../components/ui';
import { formatNumber } from '../utils/format';
import { searchMatches, toOptions } from '../utils/options';
import {
  ACTIONS, FOLLOWUP_UPDATE_ACTION, MODULES, QUICK_TRANSFER_ACTION,
  ROLE_UPDATE_ACTION, USER_EDIT_ACTION,
} from '../constants/permissions';
import HierarchyGrid, { LEVEL_META } from '../components/hierarchy/HierarchyGrid';
import MemberList, { MemberPager, isAttending, statusLabel } from '../components/hierarchy/MemberList';
import StatusConfirmDialog from '../components/hierarchy/StatusConfirmDialog';
import QuickTransferDialog from '../components/hierarchy/QuickTransferDialog';
import ChangeFollowupDialog from '../components/hierarchy/ChangeFollowupDialog';
import AssignRoleDialog from '../components/hierarchy/AssignRoleDialog';

// Members module.
//
// The landing level is chosen from permissions, in order:
//   PRADESH:READ -> Pradesh grid -> Mandal -> Sabha -> Members
//   MANDAL:READ  -> Mandal grid  -> Sabha -> Members
//   SABHA:READ   -> Sabha grid   -> Members
//   none of them -> Members list directly
//
// Each level is gated strictly by its own grant — no fallback to HIERARCHY:READ
// or any other module. An ungranted level is skipped, not shown. Nothing about
// roles or hierarchy depth is hardcoded; only which grant unlocks which level.
const LEVEL_ORDER = ['pradesh', 'mandal', 'sabha'];

// What this screen filters by. Declared once so the remembered state has a known
// shape, and so returning from a member's details page restores all of it.
const FILTER_DEFAULTS = { q: '', alpha: '', followup: '', page: '' };

/**
 * Roles that get no follow-up filter, by explicit request.
 *
 * 9 sees only the members they themselves follow up, and 10 only their own
 * record — so `GET /users/get-followup-person-list` comes back holding just
 * their own name and the dropdown can only narrow the list to what it already
 * shows. Hidden rather than disabled: an inert control reads as broken.
 *
 * Ids, not permissions, for the same reason as pages/DashboardPage.jsx — this
 * is not something the API expresses as a grant. ⚠ A renumbering of the roles
 * table has to move these with it.
 */
const NO_FOLLOWUP_FILTER_ROLE_IDS = [9, 10];

/**
 * The follow-up filter's "Unassigned" value — members with `followup_by_id`
 * null. Sent to the API verbatim as `followup_by_id=null`, which the endpoint
 * reads as "has no follow-up person".
 *
 * It cannot be the empty string: '' is this screen's "no filter" value, and an
 * omitted `followup_by_id` means "don't filter by follow-up at all". Unassigned
 * and unfiltered are different questions, so they need different values.
 */
const UNASSIGNED_FOLLOWUP = 'null';

const inputCls =
  'w-full rounded-xl border border-[#E0EAF4] bg-white px-3 py-2 text-sm text-primary outline-none transition-all placeholder:text-[#9BB5CB] focus:border-primary/50 focus:shadow-[0_0_0_3px_rgba(0,49,88,0.08)]';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * "View All 53 Members" — the jump from a hierarchy grid straight to the flat
 * member list. Sits on the same row as the search box.
 *
 * Deliberately short: no scope name trailing it. The breadcrumb directly above
 * already says which Pradesh or Mandal is on screen, so repeating it here only
 * made the link long enough to wrap.
 *
 * The number is whatever the API reported for the scope on screen — nothing here
 * counts rows. When the backend sends no count the link still works and simply
 * drops the number rather than inventing one.
 */
function ViewAllMembersLink({ count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-accent transition-colors hover:text-accent-hover"
    >
      <Users className="h-3.5 w-3.5 flex-shrink-0" />
      View All {count == null ? '' : `${formatNumber(count)} `}Members
    </button>
  );
}

export default function MembersPage({ module }) {
  const { can, roleId } = usePermissions();
  const toast = useToast();

  // Strictly per-level. No fallback to any other module: if PRADESH:READ is
  // is_granted=false the Pradesh step is skipped entirely, even when some other
  // hierarchy grant exists.
  const access = {
    pradesh: can(MODULES.PRADESH, ACTIONS.READ),
    mandal: can(MODULES.MANDAL, ACTIONS.READ),
    sabha: can(MODULES.SABHA, ACTIONS.READ),
  };

  // Every gate on this page resolves from full-context at runtime. The module
  // itself is only routable because full-context granted something on USERS —
  // AppRouter emits no route otherwise (see routes/AppRouter.jsx).
  //   READ               — may the list be fetched at all
  //   EDIT / UPDATE      — may the Edit action appear (PATCH /users/{id})
  //   BULK_STATUS_UPDATE — may the status toggle be operated
  const canReadUsers = can(MODULES.USERS, ACTIONS.READ);
  const canEditUsers = can(MODULES.USERS, USER_EDIT_ACTION);
  const canChangeStatus = can(MODULES.USERS, ACTIONS.BULK_STATUS_UPDATE);
  const canCreateUsers = can(MODULES.USERS, ACTIONS.CREATE);
  // Quick Transfer lives on the Members list but is a TRANSFER grant —
  // QUICK_TRANSFER, the one `POST /notifications/transfer-request` itself accepts.
  // The member page opens the SAME dialog behind TRANSFER:CREATE; the endpoint
  // is the same, only the grant that reveals each button differs.
  const canQuickTransfer = can(MODULES.TRANSFER, QUICK_TRANSFER_ACTION);
  const canChangeFollowup = can(MODULES.USERS, FOLLOWUP_UPDATE_ACTION);
  const canAssignRole = can(MODULES.USERS, ROLE_UPDATE_ACTION);

  const [sel, setSel] = useState({ pradesh: null, mandal: null, sabha: null });
  // Set by "View All … Members": skip the hierarchy grids and list the caller's
  // whole scope. Any hierarchy navigation clears it again.
  const [viewAll, setViewAll] = useState(false);
  // Kept out of the URL — the address bar describes the page, not what has been
  // typed into it. Remembered per screen instead, so returning from a member's
  // details page restores the list exactly as it was left. See useFilterState.
  const { get: filter, set: setFilter } = useFilterState('members', FILTER_DEFAULTS);
  const search = filter('q');
  const alpha = filter('alpha');
  const followup = filter('followup');

  // Coerced, because full-context may answer with a stringified id and a strict
  // === would then leave the dropdown on screen for exactly the roles it is
  // meant to be hidden from.
  const showFollowupFilter = !NO_FOLLOWUP_FILTER_ROLE_IDS.includes(Number(roleId));

  // Every filter change also clears the page, since page 7 of the old result set
  // is not page 7 of the new one.
  const setSearch = (v) => setFilter({ q: v, page: '' });
  const setAlpha = (v) => setFilter({ alpha: v, page: '' });
  const setFollowup = (v) => setFilter({ followup: v, page: '' });


  // The member awaiting status confirmation, plus the last backend error for
  // that attempt. Nothing about the row is mutated here — the dialog only holds
  // which row was clicked.
  const [pendingStatus, setPendingStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const statusUpdate = useMemberStatusUpdate();

  /** The row whose Quick Transfer icon was clicked, or null. */
  const [transferring, setTransferring] = useState(null);
  /** The row whose follow-up pencil was clicked, or null. */
  const [changingFollowup, setChangingFollowup] = useState(null);
  /** The row whose role pencil was clicked, or null. */
  const [assigningRole, setAssigningRole] = useState(null);

  // The first granted level that has not been chosen yet. Ungranted levels are
  // skipped, so pradesh=false + mandal=true lands straight on the Mandal grid,
  // and all three false goes directly to the member list.
  const view = viewAll ? 'users' : LEVEL_ORDER.find((level) => access[level] && !sel[level]) ?? 'users';

  const pradeshQ = usePradeshList(view === 'pradesh');
  const mandalQ = useMandals(sel.pradesh?.id, view === 'mandal');
  const sabhaQ = useSabhas(sel.mandal?.id, view === 'sabha');

  const levelQ = { pradesh: pradeshQ, mandal: mandalQ, sabha: sabhaQ }[view];

  // Follow-up filter options, from GET /users/get-followup-person-list. Fetched
  // only once the member list is actually on screen, and cached with the other
  // lookups, so switching between hierarchy levels does not refetch it.
  //
  // ALWAYS scoped to a Sabha, and the id comes from one of two places:
  //
  //   drilled in     the Sabha selected on the hierarchy grids
  //   not drilled in the caller's OWN Sabha, from GET /users/me
  //
  // The second case is the one that used to be missing. A SuperAdmin walks
  // Pradesh -> Mandal -> Sabha, so `sel.sabha` is set by the time the list
  // renders and the param went out. Every other role starts past those grids —
  // their granted levels are already fixed — so `sel.sabha` was null, the param
  // was omitted, and the endpoint answered with its unfiltered list instead of
  // the Sabha's follow-up persons.
  // Roles without the dropdown fetch neither list: no control, no options, and
  // no request to fill it.
  const ownSabhaNeeded = showFollowupFilter && canReadUsers && view === 'users' && !sel.sabha?.id;
  const meQ = useMe(ownSabhaNeeded);
  const followupSabhaId = sel.sabha?.id ?? meQ.data?.sabha_id ?? null;
  // Held back until the fallback is known, or the first render would spend a
  // request on the unscoped list and immediately replace it. `isPending` covers
  // the disabled case too — when a Sabha IS selected the left side is already
  // true, so nothing waits on a query that will never run.
  const followupQ = useFollowupPersons(
    showFollowupFilter && canReadUsers && view === 'users' && (Boolean(sel.sabha?.id) || !meQ.isPending),
    followupSabhaId
  );
  // The fallback fetch counts as loading the follow-up list: without this the
  // dropdown reads "All Follow-up" and offers nothing for as long as
  // GET /users/me is in flight, which looks like a Sabha with no follow-up
  // persons rather than a list that has not arrived.
  const followupLoading = followupQ.isLoading || (ownSabhaNeeded && meQ.isLoading);
  // Keys given explicitly rather than left to toOptions' discovery. Discovery
  // falls back to "the first column ending in _id", and a follow-up row that
  // carries sabha_id before its own id would then send the wrong value as
  // followup_by_id — a filter that silently returns the wrong members. Both keys
  // fall back to discovery when the row does not have them.
  const followupOptions = useMemo(
    () => toOptions(followupQ.data, { valueKey: 'id', labelKey: 'user_name' }),
    [followupQ.data]
  );

  // Server-paged in 100-record blocks, with every filter as query
  // params — see hooks/usePagination.js. The pager, the counts and the rows all
  // come from here; nothing about the member list is computed in the browser.
  const membersQ = useMembers(
    {
      // No follow-up control means no follow-up param, even if a value was
      // remembered from before the dropdown was taken away.
      sabhaId: sel.sabha?.id, search, alpha, followupById: showFollowupFilter ? followup : '',
      // Page rides in the URL too, so Back lands on the page that was open.
      // Page 1 is left out of the query string rather than written as ?page=1.
      initialPage: Number(filter('page', '1')) || 1,
      onPageChange: (p) => setFilter({ page: p > 1 ? p : '' }),
    },
    canReadUsers && view === 'users'
  );
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } = membersQ;

  // The number in "View All … Members". Both sources are fields of a response
  // this page already has — the link costs no request of its own:
  //   drilled in — the selected parent's own `member_count`, on the very row
  //                that was clicked (Sabha grid -> that Mandal's count)
  //   at the top — the envelope `member_count` of the list this grid is
  //                rendering, which is the caller's whole scope at that level
  // Nothing is summed or tallied here; an absent field stays null and the link
  // drops the number rather than showing one the backend never sent.
  const parentCount = useMemo(() => {
    const countOf = (levelRows, id) => {
      const row = (levelRows ?? []).find((r) => Number(r.id) === Number(id));
      return typeof row?.member_count === 'number' ? row.member_count : null;
    };
    if (view === 'sabha') return countOf(mandalQ.data, sel.mandal?.id);
    if (view === 'mandal') return countOf(pradeshQ.data, sel.pradesh?.id);
    return null;
  }, [view, mandalQ.data, pradeshQ.data, sel.mandal, sel.pradesh]);

  // No fallback between the two: a drilled-in view falling back to the scope
  // total would print "1,462 Members in Mumbai" — a number for a wider scope
  // than the label names.
  const drilledIn = Boolean(sel.pradesh || sel.mandal);
  const memberCount = drilledIn ? parentCount : levelQ?.memberCount ?? null;

  // ── Status toggle ────────────────────────────────────────────────────────
  // Click -> confirm -> PATCH -> the cached row is patched with the value the
  // server just accepted. Nothing moves before the response, so a failed write
  // leaves the row exactly as the backend last reported it.
  const nextStatus = pendingStatus ? !isAttending(pendingStatus.status) : false;

  const askStatusChange = (row) => {
    setStatusError(null);
    setPendingStatus(row);
  };

  const closeStatusDialog = () => {
    if (statusUpdate.isPending) return; // sealed while the request is in flight
    setPendingStatus(null);
    setStatusError(null);
  };

  const confirmStatusChange = async () => {
    if (!pendingStatus || statusUpdate.isPending) return;
    const row = pendingStatus;
    setStatusError(null);
    try {
      // The row is patched in the cache on success, so the dialog closes onto
      // an already-updated table without the list being refetched.
      const res = await statusUpdate.mutateAsync({ userIds: [row.id], status: nextStatus });
      setPendingStatus(null);
      toast.success(res?.detail || `${row.user_name} marked as ${statusLabel(nextStatus)}.`);
    } catch (err) {
      // Backend messages are shown verbatim; only a transport failure, which has
      // no message of its own, gets frontend wording.
      setStatusError(
        err?.status === 0
          ? 'Network error — check your connection and try again.'
          : err?.detail || err?.message || 'Could not update the status. Please try again.'
      );
    }
  };

  /**
   * Drill one level down. The search box is emptied on the way: the term was
   * filtering the names of the level being left — searching "Andheri" to find a
   * Mandal, then carrying that into the Sabha list — and it would otherwise hide
   * most of what the click was meant to reveal.
   *
   * A–Z and Follow-up go with it. Follow-up especially: its options are fetched
   * per Sabha, so a person selected under the previous one is not in the new
   * list, and the filter would narrow to nobody while the control renders blank.
   */
  const select = (level, item) => {
    setFilter({ q: '', alpha: '', followup: '', page: '' });
    setPage(1);
    setViewAll(false);
    setSel((s) => ({
      pradesh: level === 'pradesh' ? item : s.pradesh,
      mandal: level === 'mandal' ? item : level === 'pradesh' ? null : s.mandal,
      sabha: level === 'sabha' ? item : null,
    }));
  };

  // Stepping back up the hierarchy clears the filters with it — a follow-up
  // person left applied to a scope the user has just left reads as an empty
  // list rather than as a filter still being in force.
  const resetTo = (level) => {
    setSearch(''); setAlpha(''); setFollowup(''); setPage(1); setViewAll(false);
    if (level === null) return setSel({ pradesh: null, mandal: null, sabha: null });
    if (level === 'pradesh') return setSel((s) => ({ pradesh: s.pradesh, mandal: null, sabha: null }));
    return setSel((s) => ({ ...s, sabha: null }));
  };

  const showingUsers = view === 'users';

  // Breadcrumb is generated from the selected path, with the all-members view
  // as a terminal crumb — the trail above it stays live so the grids are one
  // click away.
  const crumbs = [
    { label: module.label, onClick: viewAll || sel.pradesh || sel.mandal || sel.sabha ? () => resetTo(null) : null },
    sel.pradesh && { label: sel.pradesh.pradesh_name, onClick: () => resetTo('pradesh') },
    sel.mandal && { label: sel.mandal.mandal_name, onClick: () => resetTo('mandal') },
    sel.sabha && { label: sel.sabha.sabha_name, onClick: null },
    viewAll && { label: 'All Members', onClick: null },
  ].filter(Boolean);

  // Skips the remaining grids and lands on the member list. The selection is
  // left alone so the breadcrumb keeps its trail, but it no longer narrows the
  // query: the link is only offered above the Sabha step, so no sabha_id is
  // sent and /users/list returns everything the caller may see.
  //
  // Search and A–Z are cleared — on a grid they were filtering Pradesh/Mandal
  // names and carry no meaning into a member list.
  const showAllMembers = () => {
    setSearch(''); setAlpha(''); setPage(1);
    setViewAll(true);
  };

  return (
    <div className="space-y-5">
      <div>
        {/* Add User appears only with USERS:CREATE. Without the grant there is no
            button and no route behind it — the page itself refuses a direct hit. */}
        <PageHeader
          title={module.label}
          // Rendered by PageHeader below the title.
          breadcrumbs={
            <nav aria-label="Breadcrumb" className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
              {crumbs.map((c, i) => (
                <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-[#C0CDE0]" />}
                  {c.onClick ? (
                    <button onClick={c.onClick} className="transition-colors hover:text-primary">{c.label}</button>
                  ) : (
                    <span className="font-semibold text-primary">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
          }
          actions={
            canCreateUsers
              ? [
                  // Registering a child is no longer a top-level button: it is
                  // reached from the Add-User form, which offers it when the
                  // entered mobile number is already registered (register a
                  // family member under the existing holder). The /users/new-child
                  // route still exists for that flow.
                  <Link key="add-user" to={`${module.path}/new`}>
                    <Button variant="primary">
                      <Plus className="h-4 w-4" />
                      Add User
                    </Button>
                  </Link>,
                ]
              : []
          }
        />
      </div>

      {/* Toolbar — search always, follow-up + A–Z only on the member list. */}
      <div className="card space-y-3 p-4">
        {/* Above the search bar, right-aligned inside the same card, as in the
            reference. Only offered while a grid is still standing between the
            user and the member list, and never with a count of zero. */}
        {/* Search, follow-up and the View All link share one row. The link is a
            sibling of the inputs rather than a banner above them, so the toolbar
            is one line on a desktop and wraps to two on a phone instead of
            always costing two. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7FA3]" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={showingUsers ? 'Search by name or mobile…' : `Search ${LEVEL_META[view]?.label.toLowerCase() || ''} by name…`}
              className={`${inputCls} pl-9`}
            />
          </div>
          {/* Follow-up. Options and their ids both come from the API; an empty
              value sends no followup_by_id at all, so the list falls back to the
              caller's own hierarchy scope rather than filtering by nobody.
              "Unassigned" is a THIRD state, not the empty one — it sends
              followup_by_id=null, which the endpoint reads as "no follow-up
              person assigned". Leaving the param out would mean "don't filter".

              Hidden entirely for the roles listed in NO_FOLLOWUP_FILTER_ROLE_IDS
              — their list is already only their own follow-ups. */}
          {showingUsers && showFollowupFilter && (
            <select
              value={followup}
              onChange={(e) => { setFollowup(e.target.value); setPage(1); }}
              disabled={followupLoading || Boolean(followupQ.error)}
              className={`${inputCls} sm:w-48`}
              aria-label="Filter by follow-up person"
            >
              <option value="">
                {followupLoading
                  ? 'Loading follow-up…'
                  : followupQ.error
                    ? 'Follow-up unavailable'
                    : 'All Follow-up'}
              </option>
              {!followupLoading && !followupQ.error && (
                <option value={UNASSIGNED_FOLLOWUP}>Unassigned</option>
              )}
              {followupOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          {canReadUsers && !showingUsers && memberCount !== 0 && (
            <ViewAllMembersLink count={memberCount} onClick={showAllMembers} />
          )}
        </div>

        {showingUsers && (
          <div className="flex items-center gap-1 overflow-x-auto border-t border-[#F0F4F9] pt-3">
            <button
              type="button"
              onClick={() => { setAlpha(''); setPage(1); }}
              className={`flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                alpha === '' ? 'bg-primary text-white' : 'text-[#6B7FA3] hover:bg-primary-50 hover:text-primary'
              }`}
            >
              All
            </button>
            {ALPHA.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => { setAlpha(letter); setPage(1); }}
                className={`flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  alpha === letter ? 'bg-primary text-white' : 'text-[#6B7FA3] hover:bg-primary-50 hover:text-primary'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>

      {!showingUsers && (
        <HierarchyGrid
          items={(levelQ?.data ?? []).filter((item) => {
            if (!search) return true;
            const name = item[LEVEL_META[view].nameKey] ?? item.name ?? '';
            return searchMatches(name, search);
          })}
          level={view}
          onSelect={(item) => select(view, item)}
          loading={levelQ?.isLoading}
          error={levelQ?.error}
          onRetry={levelQ?.refetch}
          emptyTitle={`No ${LEVEL_META[view].label} available`}
          emptyHint="Nothing in your scope at this level."
        />
      )}

      {showingUsers && (
        canReadUsers ? (
          <>
            <MemberList
              rows={pageRows}
              loading={membersQ.isLoading}
              // Every subsequent request — page, filter, search — keeps the
              // rows visible under an overlay rather than blanking the table.
              busy={membersQ.isFetching && !membersQ.isLoading}
              error={membersQ.error}
              onRetry={membersQ.refetch}
              canChangeStatus={canChangeStatus}
              onStatusToggle={askStatusChange}
              statusBusy={statusUpdate.isPending}
              // Omitted entirely without the edit grant — the column disappears
              // rather than rendering a disabled link.
              editPath={canEditUsers ? (row) => `${module.path}/${row.id}/edit` : null}
              // Name and mobile link to the details page only with USERS:READ;
              // without it they render as plain text rather than a dead link.
              detailPath={canReadUsers ? (row) => `${module.path}/${row.id}` : null}
              // No handler without TRANSFER:QUICK_TRANSFER, so no icon renders.
              onQuickTransfer={canQuickTransfer ? setTransferring : null}
              onChangeFollowup={canChangeFollowup ? setChangingFollowup : null}
              onAssignRole={canAssignRole ? setAssigningRole : null}
            />
            {!membersQ.isLoading && !membersQ.error && (
              <MemberPager page={page} pageCount={pageCount} total={total} onChange={setPage} pageSize={pageSize} onPageSize={setPageSize} />
            )}
          </>
        ) : (
          <div className="card">
            <p className="text-sm text-text-muted">
              Viewing members requires the <span className="font-semibold text-primary">Members · Read</span> permission.
            </p>
          </div>
        )
      )}

      {/* The dialog reads the destination Mandal off the member's own row, not
          off the level being browsed — the two differ whenever the list is
          reached from above, and only the member's Mandal may supply
          destinations. */}
      <QuickTransferDialog member={transferring} onClose={() => setTransferring(null)} />

      <ChangeFollowupDialog member={changingFollowup} onClose={() => setChangingFollowup(null)} />

      <AssignRoleDialog member={assigningRole} onClose={() => setAssigningRole(null)} />

      <StatusConfirmDialog
        member={pendingStatus}
        nextStatus={nextStatus}
        busy={statusUpdate.isPending}
        error={statusError}
        onConfirm={confirmStatusChange}
        onCancel={closeStatusDialog}
      />
    </div>
  );
}
