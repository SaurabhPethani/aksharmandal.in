import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { permissionService } from '../services/permissionService';
import { useAuth } from './core';

// Reading and writing *another* user's permission matrix, for the Permission tab
// on their details page.
//
// The signed-in user's own context is not here — it is fetched once per page
// load by AuthContext and held in its state, not in React Query. These two are
// the only hooks that treat full-context as ordinary cached data.

/**
 * Another user's permission matrix. The same endpoint the session boots from —
 * full-context is per user — so viewing a member costs one request and leaves
 * the viewer's own grants untouched.
 */
export function useUserPermissions(userId, enabled = true) {
  return useQuery({
    queryKey: ['user-permissions', String(userId)],
    queryFn: () => permissionService.fullContext(userId),
    enabled: enabled && Boolean(userId),
  });
}

/**
 * Flips one action and writes the matrix back via POST /role-permissions/sync.
 *
 * On success this user's matrix is refetched and the viewer's own context is
 * reloaded — an admin editing grants that affect themselves must see their
 * navigation change immediately rather than on the next reload.
 */
export function useSyncPermissions(userId) {
  const queryClient = useQueryClient();
  const { reloadPermissions } = useAuth();
  return useMutation({
    mutationFn: ({ context, change }) => permissionService.sync(context, change),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-permissions', String(userId)] });
      await reloadPermissions?.();
    },
  });
}
