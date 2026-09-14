import { useContext } from 'react';
import { PermissionContext } from '../contexts/PermissionContext';
import { MODULES, ACTIONS } from '../constants/permissions';
import { LayoutDashboard, Activity, Phone, SlidersHorizontal, CalendarCheck, CalendarPlus, QrCode, Images } from 'lucide-react';

/**
 * DASHBOARD is the only hardcoded navigation entry, and it always comes first.
 *
 * Everything else — names, icons, routes, parent-child mapping and order — is
 * built from the Full Context API in services/navigation.service.js, from
 * `data.navigation` when the backend sends it and from `data.permissions`
 * otherwise. Nothing about the menu is declared in this file or below it.
 */
const DASHBOARD_ITEM = {
  id: '__dashboard__',
  name: 'DASHBOARD',
  label: 'Dashboard',
  path: '/dashboard',
  icon: LayoutDashboard,
  order: -1,           // always first
  children: [],
};

// SuperAdmin-only, appended at the end. Like Dashboard it is not a permission
// module, so it is declared here rather than coming from full-context.
const ANALYTICS_ITEM = {
  id: '__analytics__',
  name: 'ANALYTICS',
  label: 'Traffic',
  path: '/analytics',
  icon: Activity,
  order: 999,
  children: [],
};

// SuperAdmin "Control Panel" — a parent group holding the admin actions
// (Traffic stays its own top-level item, it is a dashboard not an action).
const CONTROL_PANEL_ITEM = {
  id: '__control_panel__',
  name: 'CONTROL_PANEL',
  label: 'Control Panel',
  icon: SlidersHorizontal,
  order: 1000,
  children: [
    {
      id: '__change_mobile__',
      name: 'CHANGE_MOBILE',
      label: 'Change Mobile',
      path: '/change-mobile',
      icon: Phone,
      // Delegable: a role granted USER_ADMIN:CHANGE_MOBILE sees this item too
      // (SuperAdmin always sees every Control Panel item). Add `requires` to any
      // other child to open it up the same way.
      requires: { module: MODULES.USER_ADMIN, action: ACTIONS.CHANGE_MOBILE },
      children: [],
    },
    {
      id: '__open_attendance__',
      name: 'OPEN_ATTENDANCE',
      label: 'Open Attendance',
      path: '/open-attendance',
      icon: CalendarCheck,
      children: [],
    },
    {
      id: '__sabha_spawn__',
      name: 'SABHA_SPAWN',
      label: 'Sabha Spawn',
      path: '/sabha-spawn',
      icon: CalendarPlus,
      children: [],
    },
    {
      id: '__thought_pool__',
      name: 'THOUGHT_POOL',
      label: "Today's Thought",
      path: '/todays-thought-pool',
      icon: Images,
      children: [],
    },
    {
      id: '__regenerate_qr__',
      name: 'REGENERATE_QR',
      label: 'Regenerate QR Codes',
      path: '/regenerate-qr',
      icon: QrCode,
      children: [],
    },
  ],
};

export function useNavigation() {
  const context = useContext(PermissionContext);

  if (!context) {
    return {
      navigationTree: [DASHBOARD_ITEM],
      isLoading: true,
    };
  }

  // Already filtered by is_visible_nav and sorted by sort_order at every level
  // (buildNavigationTree), so there is nothing left to do here but put Dashboard
  // in front of it.
  const dynamicTree = context.navigationTree || [];
  const tree = [DASHBOARD_ITEM, ...dynamicTree];

  // Control Panel: SuperAdmin sees every tool; any other role sees only the
  // tools it has been granted (a child with `requires` that `can(...)` allows).
  // Traffic stays SuperAdmin-only.
  if (context.roleName === 'SuperAdmin') {
    tree.push(ANALYTICS_ITEM, CONTROL_PANEL_ITEM);
  } else {
    const grantedChildren = CONTROL_PANEL_ITEM.children.filter(
      (c) => c.requires && context.can?.(c.requires.module, c.requires.action),
    );
    if (grantedChildren.length) {
      tree.push({ ...CONTROL_PANEL_ITEM, children: grantedChildren });
    }
  }

  return {
    navigationTree: tree,
    isLoading: false,
  };
}
