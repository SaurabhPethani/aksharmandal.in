import { iconFor, registryFor } from '../utils/moduleRegistry';
import { humanize } from '../utils/format';

// ---------------------------------------------------------------------------
// THE LEFT NAVIGATION, BUILT ENTIRELY FROM full-context
// ---------------------------------------------------------------------------
// Nothing about the menu is declared in the frontend: no name, no icon, no
// route, no parent-child mapping, no order. Every one of those comes from
// GET /api/v1/role-permissions/user/{id}/full-context. Dashboard is the single
// static entry and it is added by the shell (hooks/useNavigation.js), not here.
//
// TWO SOURCES, ONE OUTPUT. The response may describe the menu either way:
//
//   data.navigation   already hierarchical — preferred, nothing to infer.
//   data.permissions  flat rows carrying parent_module_id / menu_level, which
//                     this file nests.
//
// Both run through the same rules — drop `is_visible_nav === false`, sort by
// `sort_order` ASC independently at every level — and both emit the same node
// shape, so the renderer never learns which one the backend sent.
//
// DEPTH IS NOT FIXED. Nesting follows `parent_module_id` alone, so menu_level 3
// or 4 nests exactly like level 2 and needs no change here or in the renderer.

/** A node the sidebar can render. The only shape this module emits. */
function toNode({ id, name, label, path, icon, order, fallbackOrder, menuLevel }) {
  return { id, name, label, path, icon, order, fallbackOrder, menuLevel, children: [] };
}

/**
 * `sort_order` ASC — lowest first, highest last — applied independently at every
 * level of the tree.
 *
 * THE API's `sort_order` IS THE ONLY SORT KEY, and the registry's order is a
 * tiebreaker beneath it rather than a peer. Those two are different number
 * scales: the API counts 1, 2, 3… while the registry counts 10, 20, 30… 900. If
 * a response carries `sort_order` for only some modules and both scales sort as
 * one key, an API "6" lands ahead of a registry "10" and the menu comes out in
 * an order that matches neither — which is what "sort order is not applied"
 * looks like from the outside.
 *
 * So anything the API ordered comes first, in its order. Anything it did not
 * order follows, in the registry's order. When the API orders nothing, every
 * entry falls through to the registry and the old behaviour is unchanged.
 */
export function compareByOrder(a, b) {
  const ao = Number.isFinite(a.order) ? a.order : null;
  const bo = Number.isFinite(b.order) ? b.order : null;

  if (ao !== null && bo !== null) {
    if (ao !== bo) return ao - bo;
  } else if (ao !== null) {
    return -1; // ordered by the API beats unordered
  } else if (bo !== null) {
    return 1;
  }

  const af = Number.isFinite(a.fallbackOrder) ? a.fallbackOrder : 0;
  const bf = Number.isFinite(b.fallbackOrder) ? b.fallbackOrder : 0;
  if (af !== bf) return af - bf;

  return String(a.label ?? '').localeCompare(String(b.label ?? ''));
}

function sortTree(nodes) {
  nodes.sort(compareByOrder);
  for (const node of nodes) if (node.children.length) sortTree(node.children);
  return nodes;
}

/**
 * `is_visible_nav` decides menu membership and nothing else decides it.
 *
 * Absence is read as "not a reason to hide": a backend that has not shipped the
 * field yet must not empty the menu. Only an explicit `false` removes an entry.
 */
const isNavVisible = (raw) => raw?.is_visible_nav !== false;

// ---------------------------------------------------------------------------
// Source 1 — data.navigation (already hierarchical)
// ---------------------------------------------------------------------------

/**
 * Normalizes one backend navigation node:
 *
 *   { id, module_name, display_name, route, icon, sort_order,
 *     is_visible_nav?, children[] }
 *
 * A hidden node takes its whole subtree with it — the children of a menu the
 * backend withdrew are not promoted into its place.
 */
export function normalizeNavigationNode(node) {
  if (!node || !isNavVisible(node)) return null;

  const reg = registryFor(node.module_name);

  return {
    id: node.id ?? node.module_id,
    name: node.module_name,
    label: node.display_name || reg?.label || humanize(node.module_name),
    // The API's route wins; the registry is consulted only where it is silent.
    path: node.route || node.path || reg?.path || null,
    // Icons cannot travel as components in JSON, so the API names one. An
    // unknown name falls back to the registry's, then to the renderer's default.
    icon: iconFor(node.icon) || iconFor(node.module_name) || reg?.icon || null,
    // null, not the registry's number: the two are different scales and must not
    // sort as one key — see compareByOrder.
    order: Number.isFinite(node.sort_order) ? node.sort_order : null,
    fallbackOrder: reg?.order ?? 0,
    menuLevel: node.menu_level ?? null,
    children: (node.children || []).map(normalizeNavigationNode).filter(Boolean),
  };
}

export function parseNavigationTree(navigationList = []) {
  if (!Array.isArray(navigationList)) return [];
  return sortTree(navigationList.map(normalizeNavigationNode).filter(Boolean));
}

// ---------------------------------------------------------------------------
// Source 2 — data.permissions (flat rows + parent_module_id / menu_level)
// ---------------------------------------------------------------------------

const ROOT = null;

/** A row is a root when it names no parent, or names itself. */
function parentIdOf(m) {
  const pid = m.parentId;
  if (pid == null || pid === 0 || pid === m.id) return ROOT;
  return pid;
}

/** `menu_level`, 1-based. 0 means the row did not declare one. */
function levelOf(m) {
  return Number.isFinite(m.menuLevel) && m.menuLevel >= 1 ? m.menuLevel : 0;
}

/**
 * Would attaching `childId` under `parentId` close a loop? Only malformed data
 * can do this, but the renderer recurses on `children`, so a loop that reached
 * it would hang the tab rather than misdraw a menu.
 */
function wouldCycle(parentId, childId, byId) {
  let cur = byId.get(parentId);
  for (let hops = 0; cur && hops < 64; hops += 1) {
    if (cur.id === childId) return true;
    const pid = parentIdOf(cur);
    if (pid === ROOT) return false;
    cur = byId.get(pid);
  }
  // Ran past a sane depth: treat as a loop rather than keep walking.
  return cur != null;
}

/**
 * Who is whose parent — decided once for the whole response, from BOTH signals.
 *
 *   parent_module_id  authoritative wherever it names a module the response
 *                     actually sent. An explicit link beats an inferred one.
 *   menu_level        takes over wherever it does not: the field is absent, or
 *                     null, or names a module that is not in the response. A
 *                     level-N row then belongs to the nearest level-(N-1) row
 *                     before it — the ordinary reading of a flat outline, and
 *                     what lets a backend that sends only `menu_level` still
 *                     produce a multi-level menu instead of a flat one.
 *
 * Because the second rule reads "before it", this walks the response in the
 * order the API sent it, not in sort_order: an outline is only meaningful in
 * document order, and each level is sorted afterwards by sortTree.
 *
 * Levels need not be contiguous — a level 4 following a level 2 attaches to that
 * level 2 rather than being dropped for want of a level 3.
 *
 * @returns Map<module id, parent id | null>
 */
export function resolveParents(modules = []) {
  const byId = new Map();
  for (const m of modules) if (m.id != null) byId.set(m.id, m);

  const parents = new Map();
  const openAtLevel = new Map(); // menu_level -> the last module id seen at it

  for (const m of modules) {
    const level = levelOf(m);
    const pid = parentIdOf(m);
    let parentId = null;

    if (pid !== ROOT && byId.has(pid) && !wouldCycle(pid, m.id, byId)) {
      parentId = pid;
    } else if (level > 1) {
      // Nearest shallower level still open, so a gap in the numbering does not
      // strand the row at the top level.
      for (let up = level - 1; up >= 1; up -= 1) {
        if (openAtLevel.has(up)) { parentId = openAtLevel.get(up); break; }
      }
    }

    parents.set(m.id, parentId);

    if (level >= 1) {
      openAtLevel.set(level, m.id);
      // Anything deeper than this row is closed by it.
      for (const k of [...openAtLevel.keys()]) if (k > level) openAtLevel.delete(k);
    }
  }

  return parents;
}

/**
 * Is this module allowed in the menu — is it, and every ancestor, nav-visible
 * AND granted?
 *
 * Both questions, because they answer different halves of the same one. The
 * backend decides menu MEMBERSHIP with `is_visible_nav`; full-context decides
 * ACCESS with `is_granted`. EVERY entry answers both. Dashboard and Logout are
 * the only two things in the sidebar that do not, and neither passes through
 * here: Dashboard is added by hooks/useNavigation.js and Logout is not a module.
 *
 * THE ACCESS RULE, in full:
 *
 *   declares a READ action  -> it must be granted. A module the caller cannot
 *                              read is an entry that leads straight to a 403,
 *                              even if some other action on it is granted.
 *   declares no READ action -> at least one of its OTHER actions must be
 *                              granted. Such a module is still reachable, just
 *                              through a different verb.
 *
 * That second line used to read "`is_visible_nav` alone decides", which meant an
 * action-only module appeared for everybody the backend had not explicitly
 * hidden it from — a permission check that could never fail. Two modules go
 * through that branch and both were leaking:
 *
 *   YUVA_SEVA  declares ADD and nothing else, so it now needs YUVA_SEVA:ADD
 *   LOGS       declares the three *_LOGS_READ actions and no plain READ, so it
 *              now needs one of them
 *
 * A PARENT'S GRANT GATES ITS WHOLE BRANCH, and a submenu NEVER moves up a level.
 *
 * The first level of the menu is the response's level-1 modules and nothing
 * else. A level-2 module is reachable only THROUGH its parent, so without
 * ADMIN:READ the caller has no Admin section — and Master Data, Logs and User
 * Roles are out of the menu with it, however they are granted individually.
 * Their own grants still hold everywhere else: the routes stay declared, so a
 * direct URL answers, and the ban is on the menu, not on the pages.
 *
 * This is what keeps one layout for every caller. Judging each row on its own
 * grant and promoting the survivors gave one role "Admin ▸ Master Data, Logs,
 * User Roles" and the next the same three modules as loose top-level rows — the
 * same menu drawn two different ways. Now a role either has the Admin section or
 * has no trace of it, and what it does have sits at the level the backend put it.
 *
 * A submenu whose parent is hidden FROM THE MENU goes the same way:
 * `is_visible_nav: false` on "Admin" must not leave "Logs" stranded at the top
 * level. An ancestor the response never mentioned is the one remaining case —
 * there is no parent to judge, so the row is promoted rather than dropped, and a
 * partial response loses a level of nesting instead of a menu.
 */

/** The access rule for one module, ignoring its ancestors and children. */
function readAllows(mod) {
  const read = mod?.actions?.READ;
  if (read) return read.granted === true;
  // No READ to satisfy — so the module has to be reachable by some other verb.
  return (mod?.grantedActions ?? []).length > 0;
}

/**
 * The whole rule for one module: it, and every ancestor the response actually
 * sent, must be nav-visible AND granted. One failing link anywhere up the chain
 * takes the row out of the menu — a submenu is only ever reached through the
 * section it lives in.
 */
function isRenderable(m, byId, parents) {
  let cur = m;
  for (let hops = 0; cur && hops < 64; hops += 1) {
    if (!cur.navVisible || !readAllows(cur)) return false;
    const pid = parents.get(cur.id) ?? null;
    if (pid === null) return true;
    const parent = byId.get(pid);
    if (!parent) return true; // ancestor not in the response — nothing to judge
    cur = parent;
  }
  return true; // ran past a sane depth; the tree build breaks the chain too
}

/**
 * The modules that belong in the Left Navigation, flat and unsorted.
 *
 * THE definition of menu membership, and the reason it is exported: the sidebar
 * renders the tree while the dashboard's quick actions read a flat list, and if
 * those two applied different rules a module hidden by its parent would vanish
 * from the menu but still be offered as a tile.
 */
export function navRenderableModules(modules = [], parents = null) {
  if (!Array.isArray(modules)) return [];
  const byId = new Map();
  for (const m of modules) if (m.id != null) byId.set(m.id, m);
  const links = parents ?? resolveParents(modules);
  return modules.filter((m) => isRenderable(m, byId, links));
}

/**
 * Nests the normalized modules to any depth — by `parent_module_id`, and by
 * `menu_level` wherever that is silent (see resolveParents) — keeping only what
 * `is_visible_nav` allows and sorting by `sort_order` at every level.
 *
 * Takes normalized modules (not raw rows) so that the API-first-then-registry
 * resolution of route / icon / label / order lives in exactly one place.
 */
export function buildTreeFromModules(modules = []) {
  if (!Array.isArray(modules)) return [];

  const parents = resolveParents(modules);
  const visible = navRenderableModules(modules, parents);

  const nodes = new Map();
  for (const m of visible) nodes.set(m.id, toNode(m));

  const roots = [];
  for (const m of visible) {
    const node = nodes.get(m.id);
    const parent = nodes.get(parents.get(m.id) ?? -1);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return sortTree(roots);
}

// ---------------------------------------------------------------------------

/**
 * The Left Navigation for a full-context response.
 *
 * `data.navigation` is preferred when the backend sends it — it is already
 * hierarchical, so nothing has to be inferred. Otherwise the tree is built from
 * `data.permissions`, which is the only source guaranteed to be there.
 *
 * @param data     the raw full-context payload
 * @param modules  its normalized modules (see normalizeFullContext)
 */
export function buildNavigationTree(data, modules = []) {
  const supplied = data?.navigation;
  if (Array.isArray(supplied) && supplied.length > 0) {
    const tree = parseNavigationTree(supplied);
    // An all-hidden `navigation` is a real answer (an empty menu). An empty one
    // next to modules that do want a menu is a backend that sent the key without
    // filling it — fall through rather than render nothing.
    if (tree.length > 0) return tree;
  }
  return buildTreeFromModules(modules);
}

export const navigationService = {
  buildNavigationTree,
  buildTreeFromModules,
  navRenderableModules,
  resolveParents,
  parseNavigationTree,
  normalizeNavigationNode,
};
