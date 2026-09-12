import { api } from '../api/client';
import { iconFor, registryFor } from '../utils/moduleRegistry';
import { humanize } from '../utils/format';
import { buildNavigationTree, compareByOrder, navRenderableModules } from './navigation.service';

// Normalizes GET /api/v1/role-permissions/user/{user_id}/full-context.
//
// Per-module shape: { module_id, module_name, display_name, is_visible_nav,
//   parent_module_id?, menu_level?, route|path?, icon?, sort_order?, actions: [
//   { action_id, action_name, display_name, is_granted } ] }
//
// Two different questions come out of this, and they are deliberately NOT the
// same flag:
//
//   navVisible — does it appear in the Left Navigation? `is_visible_nav`, and
//                nothing else. The backend decides the menu.
//   visible    — may the user reach it at all? Derived from the actions: a
//                module with at least one grant has a page, and that page keeps
//                its route even when the menu hides it. Hiding a menu entry is a
//                presentation choice; revoking access is an `is_granted` change.
//
// Everything presentational is API-first — route, icon, sort_order, display_name
// — and falls back to utils/moduleRegistry.js only where the response is silent.

/** `status` — the module is switched on at all. Spelled `is_active` on some payloads. */
function isActive(m) {
  const flag = typeof m.status === 'boolean' ? m.status : m.is_active;
  return typeof flag === 'boolean' ? flag : true;
}

/**
 * `is_visible_nav` — does it belong in the menu. Without the field, fall back to
 * the old derived rule (any granted action) rather than hiding everything.
 */
function isNavFlagged(m, grantedActions) {
  return typeof m.is_visible_nav === 'boolean' ? m.is_visible_nav : grantedActions.length > 0;
}

export function normalizeFullContext(data) {
  const modules = (data?.permissions ?? []).map((m) => {
    const actions = {};
    for (const a of m.actions ?? []) {
      actions[a.action_name] = {
        id: a.action_id,
        name: a.action_name,
        label: a.display_name || humanize(a.action_name),
        granted: a.is_granted === true,
      };
    }
    const grantedActions = Object.values(actions).filter((a) => a.granted);
    const reg = registryFor(m.module_name);

    return {
      id: m.module_id,
      name: m.module_name,
      // The API's own wording wins; the registry label is only a fallback for
      // modules whose display_name is missing.
      label: m.display_name || reg.label || humanize(m.module_name),
      actions,
      grantedActions,

      // Left Navigation: the module must be active AND flagged for the nav.
      // Either field being absent is read as "not a reason to hide" — a backend
      // that has not shipped one of them yet should not empty the menu — so only
      // an explicit `false` removes an entry.
      navVisible: isActive(m) && isNavFlagged(m, grantedActions),

      // Reachability, which is a separate question from menu membership.
      visible: grantedActions.length > 0,

      // Menu hierarchy, straight from the API. `parent_module_id` is what nests
      // the tree; `menu_level` is carried for callers but never used to nest,
      // since the parent link already says where a row belongs — which is why a
      // future level 3 or 4 needs no change here.
      parentId: m.parent_module_id ?? null,
      menuLevel: Number.isFinite(m.menu_level) ? m.menu_level : null,

      path: m.route || m.path || reg.path,
      icon: iconFor(m.icon) ?? reg.icon,
      // The API's sort_order is the sort key; the registry's order is only a
      // tiebreaker for modules the API left unordered. Keeping them apart is
      // what stops the two number scales interleaving — see compareByOrder.
      order: Number.isFinite(m.sort_order) ? m.sort_order : null,
      fallbackOrder: reg.order,
      listEndpoint: m.list_endpoint || reg.listEndpoint,
      page: reg.page ?? null,
      unregistered: reg.unregistered === true,
    };
  });

  const byName = {};
  for (const m of modules) byName[m.name] = m;

  return {
    userId: data?.user_id ?? null,
    userName: data?.user_name ?? null,
    roleId: data?.role_id ?? null,
    roleName: data?.role_name ?? null,
    // The caller's hierarchy band, for scope-gated UI (e.g. the Registered Data
    // tab shows for anything above 'self'). The backend is still the authority.
    scopeLevel: data?.scope_level ?? null,
    hierarchyRank: data?.hierarchy_rank ?? null,
    modules,
    byName,
    /**
     * The same set `navigationTree` renders, flattened and in `sort_order` — for
     * callers that want menu membership without the hierarchy (the dashboard's
     * quick-action tiles).
     *
     * Filtered by navRenderableModules, NOT by `navVisible` alone: a module the
     * backend hid by hiding its parent is out of the menu, and offering it as a
     * dashboard tile would put it straight back in.
     */
    navModules: navRenderableModules(modules).sort(byOrder),

    /**
     * Everything the user may reach. Routes are emitted from this, not from
     * navModules — a module hidden from the menu still answers its own URL, so
     * clearing `is_visible_nav` tidies the menu without 404-ing a page the user
     * is still granted actions on.
     */
    accessibleModules: modules.filter((m) => m.visible).sort(byOrder),

    /**
     * Every module the API described, granted or not. Routes are declared for
     * all of them so an ungranted one answers with a 403 page rather than
     * falling through to the 404 — "you may not see this" and "this does not
     * exist" are different answers, and only the first is true here.
     */
    allModules: modules.slice().sort(byOrder),

    /**
     * The Left Navigation, nested and sorted. Built from `data.navigation` when
     * the backend sends it, otherwise nested from `permissions` by
     * `parent_module_id` — see services/navigation.service.js. Dashboard is the
     * one static entry and is prepended by the shell, not by this.
     */
    navigationTree: buildNavigationTree(data, modules),
  };
}

// Shared with the sidebar so a list and the menu can never disagree on order.
const byOrder = compareByOrder;

export const permissionService = {
  fullContext: (userId) =>
    api.get(`/api/v1/role-permissions/user/${userId}/full-context`).then(normalizeFullContext),

  /**
   * POST /api/v1/role-permissions/sync — writes the permission matrix back.
   *
   * Verified against the live spec on 2026-08-02. `BulkPermissionSync` is
   * `{ role_id?, user_id?, permissions: [{ module_id, action_id, is_allowed }] }`
   * with **exactly one** of the two ids: both is a 400, neither is a 400.
   *
   * This app is always in Mode B — a per-user override, which is what the
   * member page's switches mean — so `user_id` is sent and `role_id` is not.
   * It used to send both, which the API refused with
   * "Choose either role_id OR user_id, not both."
   *
   * @param context   a normalized full-context (see normalizeFullContext)
   * @param change    { moduleName, actionName, granted } — the toggle just flipped
   */
  sync: (context, change) =>
    api.post('/api/v1/role-permissions/sync', buildSyncPayload(context, change), { envelope: true }),
};

/**
 * The whole matrix is sent, not just the delta: a sync endpoint that replaces
 * the role's grants would silently revoke everything omitted from a delta-only
 * body. Sending the full set is correct under either reading.
 */
export function buildSyncPayload(context, { moduleName, actionName, granted }) {
  const permissions = [];
  for (const module of context?.modules ?? []) {
    for (const action of Object.values(module.actions ?? {})) {
      const isTarget = module.name === moduleName && action.name === actionName;
      permissions.push({
        module_id: module.id,
        action_id: action.id,
        // `is_allowed`, not `is_granted`: the read model (full-context) and the
        // write model (PermissionItem) spell it differently.
        is_allowed: isTarget ? granted : action.granted,
      });
    }
  }
  // Mode B only — `user_id` alone. Sending `role_id` as well is a 400, and it
  // would mean something else entirely: editing the role's base grants for
  // every member who holds it, from a screen about one person.
  return { user_id: context?.userId ?? null, permissions };
}
