import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, User, X } from 'lucide-react';
import {
  useMemberStatusUpdate, usePermissions, useProfile, useProfileImage, useSyncPermissions,
  useToast, useUserPermissions,
} from '../hooks';
import { Button, Card, ErrorState, PageLoader, Skeleton, Toggle } from '../components/ui';
import { Tabs } from '../components/Navigation';
import { isAttending, statusLabel } from '../components/hierarchy/MemberList';
import ForbiddenPage from './ForbiddenPage';
import { LOADING } from '../constants/messages';
import {
  ACTIONS, MODULES, PERMISSION_SYNC_ACTION, TRANSFER_START_ACTION, USER_EDIT_ACTION,
} from '../constants/permissions';
import ProfileCards, { ProfileHero } from '../components/user-detail/ProfileCards';
import QuickTransferDialog from '../components/hierarchy/QuickTransferDialog';
import GraduateDialog from '../components/hierarchy/GraduateDialog';

// User details — GET /api/v1/users/{id} for the record, full-context for that
// user's permission matrix.
//
// Every affordance is gated on the grant its OWN endpoint requires:
//
//   the page itself      USERS:READ
//   Edit Profile         USERS:UPDATE            (the same grant the form checks)
//   Mark (Not) Attending USERS:BULK_STATUS_UPDATE (PATCH /users/status/bulk)
//   Transfer             TRANSFER:CREATE  (the members list's icon, which
//                        opens the same popup, takes TRANSFER:QUICK_TRANSFER)
//   Permissions tab      USER_PERMISSION:READ
//   Permission toggles   USER_PERMISSION:UPDATE  (labels instead, without it)
//
// SuperAdmin is not a case here. It sees the tab because its full-context says
// USER_PERMISSION:READ is granted, exactly as any other role would.
//
// None of them assumes a role.

const MEMBERS_PATH = '/users';

// ── Permissions tab ────────────────────────────────────────────────────────

/**
 * Every module and every action full-context returned for this user, each with
 * its own switch. Nothing is filtered to the granted ones — the point of the
 * tab is to show what is off as well as what is on — and no module, action or
 * label is named here: `display_name` and `is_granted` come from the API.
 *
 * Toggles are staged rather than written one at a time. The sync endpoint takes
 * the WHOLE matrix on every call, so a switch per request would send the entire
 * set N times to change N things, and a failure halfway would leave the screen
 * describing a state nobody chose. Unsaved changes are counted, and Save sends
 * them together.
 */
function PermissionsTab({ userId, canEdit }) {
  const toast = useToast();
  const { data, isLoading, error, refetch } = useUserPermissions(userId);
  const sync = useSyncPermissions(userId);
  /** `${module}:${action}` -> the granted value the user chose. */
  const [draft, setDraft] = useState({});

  const modules = data?.modules ?? [];
  const keyOf = (module, action) => `${module.name}:${action.name}`;
  const grantedNow = (module, action) => draft[keyOf(module, action)] ?? action.granted;

  const counts = useMemo(() => {
    let granted = 0;
    let denied = 0;
    let unsaved = 0;
    for (const module of modules) {
      for (const action of Object.values(module.actions ?? {})) {
        const now = draft[keyOf(module, action)] ?? action.granted;
        if (now) granted += 1; else denied += 1;
        if (now !== action.granted) unsaved += 1;
      }
    }
    return { granted, denied, unsaved };
  }, [modules, draft]);

  const save = async () => {
    const changes = Object.entries(draft)
      .map(([key, granted]) => {
        const [moduleName, actionName] = key.split(':');
        return { moduleName, actionName, granted };
      })
      .filter(({ moduleName, actionName, granted }) => {
        const action = data?.byName?.[moduleName]?.actions?.[actionName];
        return action && action.granted !== granted;
      });
    if (!changes.length) return;

    try {
      // One call per change, because the endpoint's contract is one `change`
      // against the whole matrix — but sequential, so each is built on the last
      // one's result rather than three racing writes of the same set.
      let res;
      for (const change of changes) {
        res = await sync.mutateAsync({ context: data, change });
      }
      setDraft({});
      toast.success(res?.detail || `${changes.length} permission${changes.length === 1 ? '' : 's'} updated.`);
    } catch (err) {
      // Nothing local was assumed: the switches still show what was chosen, and
      // the refetch below reconciles them with what the server accepted.
      toast.error(err?.message);
      refetch();
    }
  };

  if (isLoading) {
    return <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}</div>;
  }
  if (error) {
    return <Card><ErrorState error={error} onRetry={refetch} title="Could not load permissions" /></Card>;
  }
  if (!modules.length) {
    return <Card><p className="py-6 text-sm text-text-muted">This user has no modules assigned.</p></Card>;
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-5">
        <div className="rounded-control bg-bg px-5 py-4">
          <p className="eyebrow">Current role</p>
          <p className="section-title mt-0.5">{data?.roleName ?? '—'}</p>
          <p className="mt-1 text-sm text-text-muted">
            {canEdit
              ? 'Toggle any action you have yourself to create a user-level override.'
              : 'You can view this user’s permissions but not change them.'}
          </p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-line-soft">
          <Stat value={counts.granted} label="Granted" tone="text-success-fg" />
          <Stat value={counts.denied} label="Denied" tone="text-text-muted" />
          <Stat value={counts.unsaved} label="Unsaved" tone={counts.unsaved ? 'text-accent' : 'text-text-muted'} />
        </div>

      </Card>

      {/* Its own bar rather than a footer inside the card above: it appears only
          when something is pending, and it has to be findable from wherever in
          the grid the switch was flipped. */}
      {counts.unsaved > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border-2 border-accent bg-surface px-5 py-4">
          <p className="text-sm font-semibold text-primary">
            Unsaved permission change{counts.unsaved === 1 ? '' : 's'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setDraft({})} disabled={sync.isPending}>Discard</Button>
            <Button variant="accent" onClick={save} busy={sync.isPending}>Save Changes</Button>
          </div>
        </div>
      )}

      <p className="eyebrow">Module permissions</p>

      <div className="grid gap-4 lg:grid-cols-2">
        {modules.map((module) => {
          const actions = Object.values(module.actions ?? {});
          if (!actions.length) return null;
          const on = actions.filter((a) => grantedNow(module, a)).length;
          const Icon = module.icon;

          return (
            <section key={module.id ?? module.name} className="overflow-hidden rounded-card border border-line-soft bg-surface">
              <header className="flex items-center justify-between gap-3 bg-bg px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  {Icon && <Icon className="h-4 w-4 shrink-0 text-text-muted" />}
                  <h3 className="panel-title truncate">{module.label}</h3>
                </div>
                <span className="shrink-0 rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-semibold text-text-muted">
                  {on}/{actions.length}
                </span>
              </header>

              <ul className="px-5">
                {actions.map((action) => {
                  const granted = grantedNow(module, action);
                  const changed = granted !== action.granted;
                  return (
                    <li
                      key={action.id ?? action.name}
                      className="flex items-center justify-between gap-3 border-b border-line-soft py-3 last:border-b-0"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                            granted ? 'bg-success-bg text-success-fg' : 'bg-bg text-text-faint'
                          }`}
                          aria-hidden="true"
                        >
                          {granted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        </span>
                        <span className={`truncate text-sm ${granted ? 'font-semibold text-primary' : 'text-text-muted'}`}>
                          {action.label}
                        </span>
                        {/* Which rows the Save would actually write, marked on
                            the rows themselves — the counter says how many, not
                            which, and they are spread across the whole grid. */}
                        {changed && (
                          <span className="shrink-0 rounded-full border border-accent/40 bg-accent/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                            unsaved
                          </span>
                        )}
                      </span>

                      {/* Without USER_PERMISSION:UPDATE the answer is still
                          worth reading, so the switch becomes the word it would
                          have shown. A disabled switch invites a click that
                          does nothing and says why nowhere. */}
                      {canEdit ? (
                        <Toggle
                          tone="accent"
                          checked={granted}
                          disabled={sync.isPending}
                          onChange={() =>
                            setDraft((d) => ({ ...d, [keyOf(module, action)]: !granted }))
                          }
                          label={`${action.label} on ${module.label}`}
                        />
                      ) : (
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            granted ? 'bg-success-bg text-success-fg' : 'bg-bg text-text-muted'
                          }`}
                        >
                          {granted ? 'Granted' : 'Denied'}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ value, label, tone }) {
  return (
    <div className="px-4 text-center">
      <p className={`tnum font-display text-2xl font-bold leading-none ${tone}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-text-muted">{label}</p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function UserDetailsPage() {
  const { can } = usePermissions();
  // Refused before any of the page's hooks mount, so a caller without USERS:READ
  // fires no request on their way to being told no.
  if (!can(MODULES.USERS, ACTIONS.READ)) {
    return (
      <ForbiddenPage
        message="Viewing member details requires the Members · Read permission."
        backTo={MEMBERS_PATH}
        backLabel="Back to members"
      />
    );
  }
  return <UserDetails />;
}

function UserDetails() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const [tab, setTab] = useState('profile');
  /** The member whose transfer popup is open, or null. */
  const [transferring, setTransferring] = useState(null);
  /** The managed child whose "Graduate to full member" popup is open, or null. */
  const [graduating, setGraduating] = useState(null);

  const { data: user, isLoading, error, refetch } = useProfile(userId);
  // The photo has its own endpoint — GET /api/v1/profile-image/users/{id} — and
  // that is what /profile reads too, so both screens show the same picture. The
  // member record's own `photo_url` is the fallback for a record that carries
  // one from elsewhere.
  const imageQ = useProfileImage(userId);
  const photo = imageQ.data?.image_url || user?.photo_url || null;
  const statusUpdate = useMemberStatusUpdate();

  const canTransfer = can(MODULES.TRANSFER, TRANSFER_START_ACTION);
  const canChangeStatus = can(MODULES.USERS, ACTIONS.BULK_STATUS_UPDATE);
  const canEditUser = can(MODULES.USERS, USER_EDIT_ACTION);
  const canEditPermissions = can(MODULES.USER_PERMISSION, PERMISSION_SYNC_ACTION);
  // "Graduate to full member" is offered to add-user-right holders (USERS:CREATE,
  // the same right that registers the child) and only on a parent-managed child.
  const canCreateUsers = can(MODULES.USERS, ACTIONS.CREATE);
  const isManagedChild = user?.managed_by_user_id != null;
  /**
   * The tab is decided by one thing: `USER_PERMISSION:READ` on the caller's own
   * full-context. No role is consulted — SuperAdmin reaches it the same way
   * every other role does, by holding the grant — and there is no extra rule
   * about whose record is open. Whatever `is_granted` says is what happens.
   */
  const canViewPermissions = can(MODULES.USER_PERMISSION, ACTIONS.READ);

  const attending = isAttending(user?.status);

  /**
   * Back to the list — always /users, never history.back().
   *
   * This used to be `navigate(-1)`, to get the browser's scroll restoration,
   * which only happens on a real back navigation. But "the previous entry" and
   * "the members list" are not the same place, and the gap is routine: saving an
   * edit returns here (see UserFormPage's exitPath), so the entry behind this
   * one is the edit form, and a control labelled "Back to members" reopened the
   * form the member had just left. Arriving from a search result, a dashboard
   * card or a deep link had the same problem in different clothes.
   *
   * A link that names its destination has to go there. The list's filters are
   * restored by useFilterState regardless — they are deliberately not in the URL
   * — so what is actually given up is the scroll offset within the list.
   */
  const backToUsers = () => navigate(MEMBERS_PATH);

  const changeStatus = async () => {
    if (statusUpdate.isPending || !user) return;
    try {
      // The route's id is the fallback: the detail response is not documented to
      // carry `id`, and sending an undefined one would patch nothing.
      const res = await statusUpdate.mutateAsync({
        userIds: [user.id ?? Number(userId)],
        status: !attending,
      });
      await refetch();
      toast.success(res?.detail || `${user.user_name} marked as ${statusLabel(!attending)}.`);
    } catch (err) {
      toast.error(err?.message);
    }
  };

  if (isLoading) return <PageLoader label={LOADING.page} />;
  if (error) {
    return (
      <div className="space-y-4">
        <BackLink onClick={backToUsers} />
        <Card><ErrorState error={error} onRetry={refetch} title="Could not load this member" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink onClick={backToUsers} />

        <div className="flex flex-wrap items-center gap-2">
          {/* The same popup the members list opens, doing the same thing to the
              same endpoint. Only the grant differs — TRANSFER:CREATE here,
              TRANSFER:QUICK_TRANSFER on the list. */}
          {canTransfer && (
            <Button variant="outline" onClick={() => setTransferring(user)}>
              Transfer
            </Button>
          )}
          {/* The label follows the record: offering "Mark Not Attending" to
              someone already not attending would be a button that does nothing
              visible. */}
          {canChangeStatus && (
            <Button
              variant="outline"
              onClick={changeStatus}
              busy={statusUpdate.isPending}
              className="!border-danger-fg/40 !text-danger-fg hover:!bg-danger-bg"
            >
              {attending ? 'Mark Not Attending' : 'Mark Attending'}
            </Button>
          )}
          {/* Only on a parent-managed child, and only for add-user-right holders:
              give them their own number and detach from the parent. */}
          {canCreateUsers && isManagedChild && (
            <Button variant="outline" onClick={() => setGraduating(user)}>
              Graduate to full member
            </Button>
          )}
          {canEditUser && (
            <Link to={`${MEMBERS_PATH}/${userId}/edit`}>
              <Button variant="primary">Edit Profile</Button>
            </Link>
          )}
        </div>
      </div>

      <ProfileHero
        photo={photo}
        name={user?.user_name || 'Member'}
        // Placement under the name, as the reference has location there: it is
        // the one fact that says WHICH member this is when two share a name.
        meta={[user?.mobile_number, [user?.sabha_name, user?.mandal_name].filter(Boolean).join(' · ')]}
        chips={
          <>
            {user?.role_name && (
              <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary">
                {user.role_name}
              </span>
            )}
            {user?.status != null && user.status !== '' && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  attending ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${attending ? 'bg-success-fg' : 'bg-danger-fg'}`} />
                {statusLabel(user.status)}
              </span>
            )}
          </>
        }
      />

      {/* THE OUTER LEVEL, and the reason it is `solid` while the record's own
          strip below stays underlined: two rows of identical underline tabs one
          line apart read as a single doubled strip, with the top row looking
          like a heading for the bottom one. Pills on a tinted ground are a
          different OBJECT — not a louder version of the same one, which is what
          simply enlarging this row would have produced.

          Left-aligned and only as wide as its two pills, so the tinted ground
          stops where the choice does instead of drawing a full-width band above
          a full-width strip.

          One tab is not a choice — without the permissions grant the row is left
          off entirely rather than shown with a single item in it, and the record
          below then stands under its own strip alone. */}
      {canViewPermissions && (
        <Tabs
          variant="solid"
          tabs={[{ value: 'profile', label: 'Profile' }, { value: 'permissions', label: 'Permissions' }]}
          value={tab}
          onChange={setTab}
        />
      )}

      <QuickTransferDialog
        member={transferring}
        onClose={() => {
          setTransferring(null);
          // The Sabha on this page changes the moment the transfer lands, so the
          // record is re-read rather than patched from what the dialog chose.
          refetch();
        }}
      />

      {/* Graduate a managed child to a full member — the dialog invalidates the
          record on success; refetch keeps this page in step (the number and the
          managed state both change). */}
      <GraduateDialog
        member={graduating}
        onClose={() => {
          setGraduating(null);
          refetch();
        }}
      />

      {canViewPermissions && tab === 'permissions' ? (
        <PermissionsTab userId={userId} canEdit={canEditPermissions} />
      ) : (
        <ProfileCards user={user} userId={userId} />
      )}
    </div>
  );
}

function BackLink({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted transition-colors hover:text-primary"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Users
    </button>
  );
}
