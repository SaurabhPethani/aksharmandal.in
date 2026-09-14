import { createContext, useMemo } from 'react';

export const PermissionContext = createContext(null);

export function PermissionProvider({ context, children }) {
  const value = useMemo(() => {
    if (!context) return null;

    const can = (moduleName, actionName) =>
      context.byName[moduleName]?.actions?.[actionName]?.granted === true;

    return {
      ...context,
      can,
      canAny: (moduleName, actions = []) => actions.some((a) => can(moduleName, a)),
      isVisible: (moduleName) => context.byName[moduleName]?.visible === true,
      /**
       * Actions granted on a module, as a render-ready list. Callers map over this
       * rather than asking for a fixed CRUD set — the API's verb vocabulary
       * includes module-specific entries (APPROVE_USER_INFO, GENERATE_QR, ...).
       */
      grantedActions: (moduleName) => context.byName[moduleName]?.grantedActions ?? [],
      // Reachable modules, not menu entries: a page hidden from the Left
      // Navigation still renders when its URL is opened directly.
      moduleFor: (path) => context.accessibleModules.find((m) => m.path === path) ?? null,
    };
  }, [context]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}
