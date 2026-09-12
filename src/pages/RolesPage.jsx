import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { usePermissions, useToast } from '../hooks';
import { useRolesList, useRoleMutations, useRoleCoverage } from '../hooks/useRoles';
import { ACTIONS, MODULES } from '../constants/permissions';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import RolePermissionsDialog from '../components/roles/RolePermissionsDialog';
import RoleRow, { RoleDraftRow } from '../components/roles/RoleRow';

/**
 * Roles & Permissions.
 *
 *   USER_ROLE:READ    opens the screen and shows each role's grants
 *   USER_ROLE:CREATE  create a role, edit name/status, change grants
 *
 * One write grant covers add AND update, so without it the page stays
 * read-only rather than hiding things — seeing what a role may do is a READ
 * question, and hiding it would make the page useless to an auditor.
 *
 * Roles are a LIST, not a grid of cards: every role carries the same few facts,
 * so a wide row lets name, coverage and actions line up in columns that scan
 * straight down.
 *
 * ONE dialog on this screen, and it is for permissions only. The name is edited
 * on the row itself: it is a fact the row already shows, so a popup to change it
 * would be a step for nothing. Permissions earn theirs — a grid of every module
 * and every action cannot fit in a row.
 *
 * Rank and global scope are set at CREATION and never edited: both are load-
 * bearing for every access check, so changing them on a live role would re-scope
 * everyone holding it.
 *
 * Rank is never DISPLAYED, by request. It is still read from
 * `GET /role-permissions/roles` — which returns `{ id, role_name, rank, global }`,
 * note `rank`, not `hierarchy_rank` — and still orders the list and shades each
 * row's stripe; only the number is gone from the screen.
 *
 * Writes go to `POST /role-permissions/roles` (name / status) and
 * `POST /role-permissions/sync` (grants).
 */

export default function RolesPage() {
  const { can, byName } = usePermissions();
  const toast = useToast();

  const mayRead = can(MODULES.USER_ROLE, ACTIONS.READ);
  const canWrite = can(MODULES.USER_ROLE, ACTIONS.CREATE);

  const query = useRolesList(mayRead);
  const { saveRole, syncPermissions } = useRoleMutations();

  // Display name and total action count per module, from the caller's own
  // context — no extra request, and complete because full-context lists every
  // active module with its full action list regardless of what the caller holds.
  const moduleMeta = useMemo(() => {
    const map = new Map();
    for (const [name, mod] of Object.entries(byName ?? {})) {
      map.set(name, { label: mod.label ?? name, total: Object.keys(mod.actions ?? {}).length });
    }
    return map;
  }, [byName]);

  const coverage = useRoleCoverage(moduleMeta, mayRead);

  const [drafting, setDrafting] = useState(false);
  const [permissionsFor, setPermissionsFor] = useState(null);
  // Which card is mid-save, so only that one disables.
  const [savingId, setSavingId] = useState(null);

  const roles = useMemo(() => {
    const rows = Array.isArray(query.data) ? query.data : [];
    return [...rows].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  }, [query.data]);

  const maxRank = roles.length ? Math.max(...roles.map((r) => r.rank ?? 0)) : 0;

  const save = (payload, onDone) => {
    setSavingId(payload.id ?? 'new');
    saveRole.mutate(payload, {
      onSuccess: (res) => {
        toast.success(res?.detail ?? 'Role saved.');
        onDone?.();
      },
      onError: (err) => toast.error(err?.message ?? 'Could not save the role.'),
      onSettled: () => setSavingId(null),
    });
  };

  if (!mayRead) {
    return (
      <>
        <PageHeader title="Roles & Permissions" />
        <div className="card">
          <EmptyState
            title="No read access"
            hint="Your role does not grant USER_ROLE:READ, which is what lists roles and their permissions."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        actions={
          canWrite && !drafting
            ? [
                <Button key="create" variant="accent" onClick={() => { saveRole.reset(); setDrafting(true); }}>
                  <Plus className="h-4 w-4" />
                  Create Role
                </Button>,
              ]
            : []
        }
      />

      {query.isLoading ? (
        <div className="overflow-hidden rounded-card border border-line-soft bg-surface shadow-card">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0">
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-1.5 w-40" />
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </div>
      ) : query.error ? (
        <div className="card">
          <ErrorState error={query.error} onRetry={query.refetch} title="Couldn’t load roles" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line-soft bg-surface shadow-card">
          {drafting && (
            <RoleDraftRow
              busy={savingId === 'new'}
              error={saveRole.error?.message ?? null}
              onCancel={() => setDrafting(false)}
              onCreate={(payload) => save(payload, () => setDrafting(false))}
            />
          )}

          {roles.map((role) => (
            <RoleRow
              // Keyed on the saved values so a successful save re-seeds the
              // row's inputs from the server rather than leaving local state
              // that merely looks right.
              key={`${role.id}-${role.role_name}-${role.rank}-${role.is_active}`}
              role={role}
              maxRank={maxRank}
              summary={coverage.ready ? coverage.forRole(role.id) : null}
              totalActions={coverage.totalActions}
              canWrite={canWrite}
              busy={savingId === role.id}
              onSave={(payload) => save(payload)}
              onOpenPermissions={() => { syncPermissions.reset(); setPermissionsFor(role); }}
            />
          ))}

          {roles.length === 0 && !drafting && (
            <EmptyState title="No roles" hint="Nothing has been defined yet." />
          )}
        </div>
      )}

      <RolePermissionsDialog
        key={permissionsFor?.id ?? 'none'}
        role={permissionsFor}
        isOpen={Boolean(permissionsFor)}
        onClose={() => { if (!syncPermissions.isPending) setPermissionsFor(null); }}
        busy={syncPermissions.isPending}
        error={syncPermissions.error?.message ?? null}
        canWrite={canWrite}
        onSave={(permissions) =>
          syncPermissions.mutate(
            { roleId: permissionsFor.id, permissions },
            {
              onSuccess: (res) => {
                toast.success(res?.detail ?? 'Permissions updated.');
                setPermissionsFor(null);
              },
            }
          )
        }
      />
    </>
  );
}
