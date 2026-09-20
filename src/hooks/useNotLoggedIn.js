import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboardService';

export function useNotLoggedIn(enabled = true) {
  return useQuery({
    queryKey: ['not-logged-in'],
    queryFn: dashboardService.notLoggedIn,
    enabled,
    staleTime: 60_000,
  });
}
