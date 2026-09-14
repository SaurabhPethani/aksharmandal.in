import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rolesService } from '../services/rolesService';
import { useAuth } from './core';
import { LOOKUP_CACHE } from './cache';

export function useRolesList(enabled = true) {
  return useQuery({
    queryKey: ['roles'],
    queryFn: rolesService.list,
    enabled,
    ...LOOKUP_CACHE,
  });
}

/**
 * Per-role coverage: how many actions each role grants, across which modules.
 *
 * `moduleMeta` is a Map(module_name -> { label, total }) taken from the caller's
 * own full-context — full-context returns every ACTIVE module with its complete
 * action list and display name regardless of what the caller holds, so the
 * denominators and labels are real and need no extra request.
 *
 * The per-module breakdown is the point: one `/matrix` call already carries
 * which actions every role holds on every module, so the list can show WHERE a
 * role's access sits rather than only how much of it there is.
 *
 * Best-effort by design: on failure every role reports `null` and the row drops
 * its coverage line rather than showing a wrong or zeroed one.
 */
export function useRoleCoverage(moduleMeta, enabled = true) {
  const query = useQuery({
    queryKey: ['role-matrix'],
    queryFn: rolesService.matrix,
    enabled,
    retry: false,
    ...LOOKUP_CACHE,
  });

  const byRoleId = new Map();
  let totalActions = 0;

  if (Array.isArray(query.data)) {
    for (const mod of query.data) {
      const meta = moduleMeta?.get(mod.module_name);
      const total = meta?.total ?? 0;
      totalActions += total;

      for (const role of mod.roles ?? []) {
        const granted = (role.actions ?? []).length;
        const entry = byRoleId.get(role.role_id) ?? { actions: 0, modules: 0, breakdown: [] };
        entry.actions += granted;
        if (granted > 0) entry.modules += 1;
        entry.breakdown.push({
          name: mod.module_name,
          label: meta?.label ?? mod.module_name,
          granted,
          total,
        });
        byRoleId.set(role.role_id, entry);
      }
    }

    // Fullest coverage first, so a role's strongest areas lead — and within a
    // tie, alphabetical, so the order is stable between roles rather than
    // following whatever order the matrix happened to arrive in.
    for (const entry of byRoleId.values()) {
      entry.breakdown.sort(
        (a, b) => b.granted - a.granted || a.label.localeCompare(b.label)
      );
    }
  }

  return {
    ready: query.isSuccess && byRoleId.size > 0,
    totalActions,
    forRole: (roleId) => byRoleId.get(roleId) ?? null,
  };
}

/** One role's full permission map. Fetched only while its dialog is open. */
export function useRoleContext(roleId, enabled = true) {
  return useQuery({
    queryKey: ['role-context', roleId],
    queryFn: () => rolesService.fullContext(roleId),
    enabled: enabled && roleId != null,
    // Deliberately NOT LOOKUP_CACHE: this is the thing being edited, so it must
    // be re-read when the dialog is reopened rather than served from a ten
    // minute old snapshot.
    staleTime: 0,
  });
}

export function useRoleMutations() {
  const qc = useQueryClient();
  const { permissionContext, reloadPermissions } = useAuth();
  const ownRoleId = permissionContext?.roleId ?? null;

  const invalidate = (roleId) => {
    qc.invalidateQueries({ queryKey: ['roles'] });
    qc.invalidateQueries({ queryKey: ['roles-for-hierarchy'] });
    qc.invalidateQueries({ queryKey: ['roles-for-logs'] });
    // Coverage — how many actions each role holds — is read from a separate
    // endpoint, and editing grants is exactly what changes it. Without this the
    // counts on the row just saved stayed at the previous numbers for the ten
    // minutes LOOKUP_CACHE keeps them.
    qc.invalidateQueries({ queryKey: ['role-matrix'] });
    if (roleId != null) qc.invalidateQueries({ queryKey: ['role-context', roleId] });
  };

  /**
   * EDITING YOUR OWN ROLE EDITS YOUR OWN SESSION.
   *
   * The caller's grants come from /full-context, which AuthContext holds in
   * state rather than in the query cache (it is what the session boots from), so
   * no amount of invalidation here reaches them. Granting your own role a module
   * left it missing from the sidebar, and revoking one left it in the menu and
   * still routable, until the page was reloaded.
   *
   * Only for the role the caller actually holds. Editing any other role cannot
   * change what this session may do, and re-reading regardless would spend a
   * request on every toggle in a dialog about somebody else's role.
   */
  const reloadIfOwnRole = async (roleId) => {
    if (ownRoleId != null && roleId != null && String(ownRoleId) === String(roleId)) {
      await reloadPermissions?.();
    }
  };

  const saveRole = useMutation({
    mutationFn: (payload) => rolesService.save(payload),
    onSuccess: async (_res, payload) => {
      invalidate(payload?.id);
      // A rename or a deactivation, both of which the header's role chip shows.
      await reloadIfOwnRole(payload?.id);
    },
  });

  const syncPermissions = useMutation({
    mutationFn: ({ roleId, permissions }) => rolesService.syncRole(roleId, permissions),
    onSuccess: async (_res, { roleId }) => {
      invalidate(roleId);
      await reloadIfOwnRole(roleId);
    },
  });

  return { saveRole, syncPermissions };
}

/**
 * Normalize a role full-context into what the dialog renders.
 *
 * Modules keep the API's order and their display names; each action carries the
 * ids the sync endpoint wants back, so saving never has to re-derive them.
 *
 * `parentId` is `ModulePermissionStatus.parent_module_id` — the SAME nesting the
 * left nav is built from, which is what lets the dialog draw Admin as one box
 * with Logs, Master Data and User Roles inside it without a list of module names
 * written down here. A module moved under a different parent by the backend
 * moves in this dialog too, with no edit.
 */
export function normalizeRoleContext(data) {
  const modules = (data?.permissions ?? []).map((m) => ({
    id: m.module_id,
    parentId: m.parent_module_id ?? null,
    name: m.module_name,
    label: m.display_name || m.module_name,
    actions: (m.actions ?? []).map((a) => ({
      id: a.action_id,
      name: a.action_name,
      label: a.display_name || a.action_name,
      granted: a.is_granted === true,
    })),
  }));

  return {
    roleId: data?.role_id ?? null,
    roleName: data?.role_name ?? '',
    modules,
  };
}

/**
 * The flat module list as the one-level tree the dialog draws.
 *
 * `[{ ...module, children: [...] }]`, in the API's own order at both levels.
 * Nothing is sorted or renamed here — the backend decides what Admin contains
 * and what it is called.
 *
 * ONE LEVEL ONLY, deliberately. `menu_level` allows deeper, and if a grandchild
 * ever appears it is attached to its own parent and that parent stays inside its
 * group — the alternative is a dialog that nests as far as the data happens to
 * go, in a modal with a fixed height.
 *
 * AN ORPHAN IS PROMOTED, NOT DROPPED: a module whose `parent_module_id` names
 * something absent from this response is drawn at the top level. Losing a level
 * of nesting is a worse-looking dialog; dropping the row is a permission nobody
 * can grant. Same rule the left nav applies — see navigation.service.js.
 */
export function groupModules(modules = []) {
  const present = new Set(modules.map((m) => m.id));
  const parentOf = (m) =>
    (m.parentId != null && m.parentId !== m.id && present.has(m.parentId) ? m.parentId : null);

  const children = new Map();
  for (const m of modules) {
    const parent = parentOf(m);
    if (parent != null) children.set(parent, [...(children.get(parent) ?? []), m]);
  }

  return modules
    .filter((m) => parentOf(m) == null)
    .map((m) => ({ ...m, children: children.get(m.id) ?? [] }));
}
