import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboardService';
import { readBirthdayWishes } from '../utils/birthdayWish';
import { LOOKUP_CACHE } from './cache';

export function useTodayBirthdays(enabled = true) {
  const query = useQuery({
    queryKey: ['today-birthdays'],
    queryFn: dashboardService.birthdays,
    enabled,
    ...LOOKUP_CACHE,
  });
  const body = query.data;
  const users = Array.isArray(body)
    ? body
    : Array.isArray(body?.users)
      ? body.users
      : [];
  return { ...query, users };
}

/** Today and three days either side; each row carries a signed `days_away`. */
export function useBirthdaysWeek(enabled = true) {
  const query = useQuery({
    queryKey: ['birthdays-week'],
    queryFn: dashboardService.birthdaysWeek,
    enabled,
    ...LOOKUP_CACHE,
  });
  return { ...query, rows: Array.isArray(query.data) ? query.data : [] };
}

/** The wishes sent TO the signed-in member. */
export function useMyBirthdayWishes(enabled = true) {
  const query = useQuery({
    queryKey: ['my-birthday-wishes'],
    queryFn: dashboardService.myBirthdayWishes,
    enabled,
    ...LOOKUP_CACHE,
  });
  return { ...query, rows: readBirthdayWishes(query.data) };
}

export function useSendBirthdayWish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, message }) =>
      dashboardService.sendBirthdayWish({ userId, message }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['today-birthdays'] }),
        queryClient.invalidateQueries({ queryKey: ['birthdays-week'] }),
      ]),
    meta: { refreshOnSuccess: false },
  });
}
