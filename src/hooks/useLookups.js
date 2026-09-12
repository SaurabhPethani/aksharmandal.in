import { useQuery } from '@tanstack/react-query';
import { masterDataService } from '../services/masterDataService';
import { authService } from '../services/authService';
import { featuresService } from '../services/featuresService';
import { useDebounced } from './core';
import { LOOKUP_CACHE } from './cache';

// Dropdown sources for the user form, plus the two typed-field lookups.
//
// Every one of these is `enabled`-gated by its caller, so opening the form does
// not fetch seven dropdowns nobody has looked at yet — see LOOKUP_TAB in
// pages/UserFormPage.jsx.

function useLookup(key, queryFn, enabled = true) {
  return useQuery({ queryKey: ['lookup', key], queryFn, enabled, ...LOOKUP_CACHE });
}

/**
 * Backend module toggles — the same list `GET /api/v1/features` returns.
 *
 * Cached like a lookup because the flags do not move within a session (a
 * deployment change costs a page refresh anyway). `data` is a plain object of
 * booleans, e.g. `{ jobs: true, resume: false, prasangam: false }`.
 *
 * READ AS "OFF UNTIL PROVEN ON": while the request is in-flight or has failed,
 * `features?.jobs` is undefined and callers should treat that as false — a
 * flag mid-fetch must not un-hide a tab that is disabled in the deployment.
 */
export const useFeatures = () => useLookup('features', featuresService.getAll);

export const useCategories = (enabled) => useLookup('user-categories', masterDataService.categories, enabled);
export const useRoles = (enabled) => useLookup('roles', masterDataService.roles, enabled);
export const useEducationLevels = (enabled) => useLookup('education-levels', masterDataService.educationLevels, enabled);
export const useJobIndustries = (enabled) => useLookup('job-industries', masterDataService.jobIndustries, enabled);
export const useNaturesOfBusiness = (enabled) => useLookup('nature-of-business', masterDataService.naturesOfBusiness, enabled);
export const useMandalUsers = (enabled) => useLookup('mandal-users', masterDataService.mandalUsers, enabled);
/** Relation types for the Family section. */
export const useRelations = (enabled) => useLookup('relations', masterDataService.relations, enabled);

/**
 * Follow-up candidates, optionally scoped to one Sabha.
 *
 * The id is part of the query key, so each Sabha's list is cached separately and
 * switching back to one already seen costs no request. With no id the param is
 * omitted entirely and the backend answers for the caller's own scope.
 */
export const useFollowupPersons = (enabled, sabhaId) =>
  useQuery({
    queryKey: ['lookup', 'followup-persons', sabhaId ?? null],
    queryFn: () => masterDataService.followupPersons(sabhaId),
    enabled,
    ...LOOKUP_CACHE,
  });

/**
 * The signed-in user's own record from GET /api/v1/users/me.
 *
 * The form falls back to this for the hierarchy levels the caller may not read:
 * without PRADESH:READ there is no list to choose from, so their own Pradesh is
 * shown instead, disabled.
 */
export function useMe(enabled = true) {
  return useQuery({ queryKey: ['me'], queryFn: authService.me, enabled, ...LOOKUP_CACHE });
}

/**
 * Address lookup for a PIN code. Only fires on a complete 6-digit code, so
 * typing does not spray requests at the backend for every keystroke.
 */
export function useAddressByPincode(pincode, enabled = true) {
  const debounced = useDebounced(pincode, 400);
  const valid = /^\d{6}$/.test(String(debounced ?? '').trim());
  return useQuery({
    queryKey: ['address-master', debounced],
    queryFn: () => masterDataService.addressByPincode(debounced),
    // `enabled` is the caller's gate — the Address step being open. Without it
    // the edit form would look the PIN code up the moment the record prefilled
    // one, on whichever step happened to be showing.
    enabled: enabled && valid,
    ...LOOKUP_CACHE,
  });
}

/**
 * Is a mobile number already registered? Fires only on a complete 10-digit
 * number, debounced, so typing does not spray requests at the backend.
 */
export function useMobileCheck(mobile) {
  const debounced = useDebounced(mobile, 500);
  const value = String(debounced ?? '').trim();
  return useQuery({
    queryKey: ['check-mobile', value],
    queryFn: () => masterDataService.checkMobile(value),
    enabled: /^\d{10}$/.test(value),
    // A number freed up mid-session is rare; a stale "taken" would be worse than
    // an extra request, so this is not cached beyond the default.
    retry: false,
  });
}
