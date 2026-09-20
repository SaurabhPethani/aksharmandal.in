import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eventsService } from '../services/eventsService';

/**
 * `enabled` must be the caller's EVENTS:READ check, not just "the page is open".
 * A REGISTER-only role (Nimit Sevak, Yuvak) gets a 403 from this endpoint.
 */
export function useEvents(status, enabled) {
  return useQuery({
    queryKey: ['events', status ?? 'all'],
    queryFn: () => eventsService.list(status),
    enabled,
  });
}

/** The caller's own registrations — the whole view for a REGISTER-only role. */
export function useMyRegistrations(enabled) {
  return useQuery({
    queryKey: ['event-registrations'],
    queryFn: eventsService.myRegistrations,
    enabled,
  });
}

/**
 * Poll tallies for one event's custom fields (organiser only). `enabled` gates
 * the fetch so it fires only when the results dialog is actually open.
 */
export function useEventFieldResults(eventId, enabled) {
  return useQuery({
    queryKey: ['event-field-results', eventId],
    queryFn: () => eventsService.fieldResults(eventId),
    enabled: Boolean(eventId) && enabled,
  });
}

/** Events the caller may view full registrant data for (Registered Data dropdown). */
export function useRegistrationDataEvents(enabled) {
  return useQuery({
    queryKey: ['event-data-events'],
    queryFn: eventsService.dataEvents,
    enabled,
  });
}

/** All registrations for one event (any registrar), for the Registered Data table. */
export function useEventRegistrationData(eventId, enabled) {
  return useQuery({
    queryKey: ['event-data-registrations', eventId],
    queryFn: () => eventsService.dataRegistrations(eventId),
    enabled: Boolean(eventId) && enabled,
  });
}

/**
 * Trigger the Excel download for one event. Reuses the reports blob→anchor
 * pattern; changes nothing server-side so it never refreshes queries.
 */
export function useEventDataExport() {
  return useMutation({
    meta: { refreshOnSuccess: false },
    mutationFn: async ({ eventId, filename }) => {
      const blob = await eventsService.exportEventData(eventId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'event-registrations.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    },
  });
}

export function useEventMutations() {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['events'] });
    // A registration changes an event's total/confirmed/denied counts, so the
    // event list is stale too — the counts are computed server-side.
    qc.invalidateQueries({ queryKey: ['event-registrations'] });
    // A registration also changes the poll tallies.
    qc.invalidateQueries({ queryKey: ['event-field-results'] });
  };

  const saveEvent = useMutation({
    mutationFn: ({ id, payload }) =>
      id ? eventsService.update(id, payload) : eventsService.create(payload),
    onSuccess: invalidate,
  });

  // Its own mutation, sending `status` alone: the edit form carries no status
  // field, so activating cannot ride along with an unrelated rename.
  const setStatus = useMutation({
    mutationFn: ({ id, status }) => eventsService.update(id, { status }),
    onSuccess: invalidate,
  });

  const register = useMutation({
    mutationFn: (payload) => eventsService.register(payload),
    onSuccess: invalidate,
  });

  const updateRegistration = useMutation({
    mutationFn: ({ id, payload }) => eventsService.updateRegistration(id, payload),
    onSuccess: invalidate,
  });

  return { saveEvent, setStatus, register, updateRegistration };
}
