import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '../services/analyticsService';

const HEARTBEAT_MS = 60_000;

/**
 * Marks the signed-in user present once a minute WHILE THE TAB IS VISIBLE — the
 * signal behind the dashboard's "time on site". Mounted once in the authed
 * shell. A hidden or backgrounded tab sends nothing, so time is only counted
 * while the app is actually on screen; the backend dedupes by the minute, so an
 * extra ping never double-counts. Failures are swallowed — a missed heartbeat is
 * a lost minute of a metric, never something the user should see.
 */
export function useActivityHeartbeat() {
  useEffect(() => {
    let timer = null;
    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      analyticsService.heartbeat().catch(() => {});
    };
    const start = () => {
      ping();
      if (timer) clearInterval(timer);
      timer = setInterval(ping, HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}

/** The SuperAdmin traffic dashboard payload for a window of `days`. */
export function useTraffic(days = 30) {
  return useQuery({
    queryKey: ['analytics-traffic', days],
    queryFn: () => analyticsService.traffic(days),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

/** The full active-member list — fetched on demand (when "view all" is opened). */
export function useActiveMembers(days, enabled) {
  return useQuery({
    queryKey: ['analytics-active-members', days],
    queryFn: () => analyticsService.activeMembers(days),
    enabled,
    staleTime: 60_000,
  });
}

/** Members for one day — fetched when a day bar is clicked. */
export function useDayMembers(date, metric, enabled) {
  return useQuery({
    queryKey: ['analytics-day-members', date, metric],
    queryFn: () => analyticsService.dayMembers(date, metric),
    enabled: enabled && Boolean(date),
    staleTime: 60_000,
  });
}
