import { useQuery } from '@tanstack/react-query';
import { permissionService } from '../services/permissionService';
import { useAuth } from './core';

const withCan = context => ({
  ...context,
  can: (moduleName, actionName) =>
    context.byName[moduleName]?.actions?.[actionName]?.granted === true,
});

/** The signed-in member's own grants. `data` is undefined until they load. */
export function useMyPermissions() {
  const { activeUserId } = useAuth();
  return useQuery({
    queryKey: ['user-permissions', String(activeUserId)],
    queryFn: () => permissionService.fullContext(activeUserId),
    enabled: activeUserId != null,
    select: withCan,
  });
}
