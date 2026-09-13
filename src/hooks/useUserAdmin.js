import { useQuery } from '@tanstack/react-query';
import { userAdminService } from '../services/userAdminService';
import { openAttendanceService } from '../services/openAttendanceService';
import { usersService } from '../services/usersService';
import { sabhaSpawnService } from '../services/sabhaSpawnService';

/** The trace of past mobile-number changes, newest first (SuperAdmin). */
export function useMobileChangeLog(enabled = true) {
  return useQuery({
    queryKey: ['mobile-change-log'],
    queryFn: () => userAdminService.mobileChangeLog(50),
    enabled,
    staleTime: 30_000,
  });
}

/** Sittings on a given date, with their open flag + present count (SuperAdmin). */
export function useSittingsByDate(date, enabled = true) {
  return useQuery({
    queryKey: ['open-attendance', date],
    queryFn: () => openAttendanceService.byDate(date),
    enabled: enabled && Boolean(date),
    staleTime: 15_000,
  });
}

/** The most recent daily Sabha-spawn run, or null if it has never run (SuperAdmin). */
export function useSabhaSpawnLastRun(enabled = true) {
  return useQuery({
    queryKey: ['sabha-spawn-last-run'],
    queryFn: () => sabhaSpawnService.lastRun(),
    enabled,
    staleTime: 15_000,
  });
}

/**
 * Members in the caller's hierarchy scope who have never logged in
 * (rank >= 20). Sabha-wise; each item is { id, full_name, mobile_number,
 * sabha_id, sabha_name }.
 */
export function useNotLoggedIn(enabled = true) {
  return useQuery({
    queryKey: ['not-logged-in'],
    queryFn: () => usersService.notLoggedIn(),
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Another member's dashboard stats + spiritual friend (rank >= 20, target in
 * scope). `{ full_name, mobile_number, sabha_name, stats, spiritual_friend_* }`.
 */
export function useMemberStats(userId, enabled = true) {
  return useQuery({
    queryKey: ['member-stats', userId],
    queryFn: () => usersService.memberStats(userId),
    enabled: enabled && Boolean(userId),
    staleTime: 60_000,
  });
}
