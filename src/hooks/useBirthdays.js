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
      queryClient.invalidateQueries({ queryKey: ['today-birthdays'] }),
    meta: { refreshOnSuccess: false },
  });
}
