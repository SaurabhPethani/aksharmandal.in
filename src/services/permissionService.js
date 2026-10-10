import { api } from '../api/client';
import { humanize } from '../utils/format';

// The web's permission service. Its routes, icons and Left Navigation tree are
// left out: they come from utils/moduleRegistry and services/navigation.service,
// which this app does not have.

/** `status` — the module is switched on at all. Spelled `is_active` on some payloads. */
function isActive(m) {
  const flag = typeof m.status === 'boolean' ? m.status : m.is_active;
  return typeof flag === 'boolean' ? flag : true;
}

/** Without `is_visible_nav`, fall back to "any granted action". */
function isNavFlagged(m, grantedActions) {
  return typeof m.is_visible_nav === 'boolean'
    ? m.is_visible_nav
    : grantedActions.length > 0;
}

/** Normalizes GET /api/v1/role-permissions/user/{user_id}/full-context. */
export function normalizeFullContext(data) {
  const modules = (data?.permissions ?? []).map(m => {
    const actions = {};
    for (const a of m.actions ?? []) {
      actions[a.action_name] = {
        id: a.action_id,
        name: a.action_name,
        label: a.display_name || humanize(a.action_name),
        granted: a.is_granted === true,
      };
    }
    const grantedActions = Object.values(actions).filter(a => a.granted);

    return {
      id: m.module_id,
      name: m.module_name,
      label: m.display_name || humanize(m.module_name),
      actions,
      grantedActions,
      // Two different questions: `navVisible` is menu membership, `visible` is
      // whether the user may reach the module at all.
      navVisible: isActive(m) && isNavFlagged(m, grantedActions),
      visible: grantedActions.length > 0,
      parentId: m.parent_module_id ?? null,
      menuLevel: Number.isFinite(m.menu_level) ? m.menu_level : null,
      order: Number.isFinite(m.sort_order) ? m.sort_order : null,
      rank: Number.isFinite(m.min_rank) ? m.min_rank : null,
    };
  });

  const byName = {};
  for (const m of modules) byName[m.name] = m;

  return {
    userId: data?.user_id ?? null,
    userName: data?.user_name ?? null,
    roleId: data?.role_id ?? null,
    roleName: data?.role_name ?? null,
    scopeLevel: data?.scope_level ?? null,
    hierarchyRank: data?.hierarchy_rank ?? null,
    modules,
    byName,
    accessibleModules: modules.filter(m => m.visible),
  };
}

export const permissionService = {
  fullContext: userId =>
    api
      .get(`/api/v1/role-permissions/user/${userId}/full-context`)
      .then(normalizeFullContext),

  /**
   * POST /api/v1/role-permissions/sync — writes the permission matrix back.
   *
   * @param context   a normalized full-context (see normalizeFullContext)
   * @param change    { moduleName, actionName, granted } — the toggle just flipped
   */
  sync: (context, change) =>
    api.post(
      '/api/v1/role-permissions/sync',
      buildSyncPayload(context, change),
      { envelope: true },
    ),
};

/**
 * The whole matrix is sent, not just the delta: a sync endpoint that replaces
 * the grants would silently revoke everything omitted from a delta-only body.
 */
export function buildSyncPayload(context, { moduleName, actionName, granted }) {
  const permissions = [];
  for (const mod of context?.modules ?? []) {
    for (const action of Object.values(mod.actions ?? {})) {
      const isTarget = mod.name === moduleName && action.name === actionName;
      permissions.push({
        module_id: mod.id,
        action_id: action.id,
        // `is_allowed`, not `is_granted`: the read and write models differ.
        is_allowed: isTarget ? granted : action.granted,
      });
    }
  }
  // `user_id` alone — sending `role_id` as well is a 400.
  return { user_id: context?.userId ?? null, permissions };
}
