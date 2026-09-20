import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboardService';

/**
 * Another member's dashboard stats + spiritual friend (rank >= 20, target in
 * scope). `{ full_name, mobile_number, sabha_name, stats, spiritual_friend_* }`.
 */
export function useMemberStats(userId, enabled = true) {
  return useQuery({
    queryKey: ['member-stats', userId],
    queryFn: () => dashboardService.memberStats(userId),
    enabled: enabled && Boolean(userId),
    staleTime: 60_000,
  });
}
