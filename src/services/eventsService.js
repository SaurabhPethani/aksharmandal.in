import { api } from '../api/client';

/**
 * Events, and registrations for them.
 *
 * ⚠ The four EVENTS actions are INDEPENDENT, and the backend enforces that with
 * a bespoke resolver (`check_event_permission`) rather than the shared one —
 * its docstring says so explicitly: it exists "so a partial EVENTS grant (e.g.
 * a role that holds only REGISTER) does NOT leak the other actions".
 *
 *   READ      GET  /events              the event list
 *   CREATE    POST /events
 *   UPDATE    PATCH /events/{id}        edit, and activate / deactivate
 *   REGISTER  the /register-for-events trio
 *
 * Nimit Sevak and Yuvak hold REGISTER **and nothing else**, so `GET /events`
 * 403s for them. Any screen that loads the event list before checking READ
 * breaks for exactly the two roles who most need the page.
 */
export const eventsService = {
  /** `status` is the string 'active' | 'inactive'; omit it for all. */
  list: (status) => api.get('/api/v1/events', { params: status ? { status } : undefined }),
  create: (payload) => api.post('/api/v1/events', payload, { envelope: true }),
  update: (id, payload) => api.patch(`/api/v1/events/${id}`, payload, { envelope: true }),

  /**
   * POST /api/v1/event-image — multipart, field name `file` (JPEG/PNG/WEBP, ≤2 MB).
   * Returns `{ filename, image_url }`; the caller stores `image_url` in the
   * event's `image` field. No Content-Type set by hand — the browser must add
   * the multipart boundary (see profileService.uploadProfileImage).
   */
  uploadEventImage: (file) => {
    const form = new FormData();
    form.append('file', file);
    // No `envelope: true` — we want the interceptor to unwrap to `data`
    // (`{ filename, image_url }`), not hand back the whole StandardResponse.
    return api.post('/api/v1/event-image', form);
  },

  /** Poll tallies for one event's custom fields — organiser (EVENTS:CREATE) only. */
  fieldResults: (id) => api.get(`/api/v1/events/${id}/field-results`),

  // --- Registered Data (event creator / higher rank) -----------------------
  /** Events the caller may view full registrant data for (the dropdown). */
  dataEvents: () => api.get('/api/v1/events/registration-data'),
  /** Every registration for one event (all registrars), with poll answers. */
  dataRegistrations: (id) => api.get(`/api/v1/events/${id}/registration-data`),
  /** Excel of one event's registrants; `responseType: blob` per the reports pattern. */
  exportEventData: (id) =>
    api.get(`/api/v1/events/${id}/registration-data/export`, { responseType: 'blob', timeout: 180_000 }),

  /**
   * Probe one mobile against one event, for the Member Register form. Returns
   * `{ registered, user }` — whether the number is already on THIS event, and
   * (independently) the name/gender/age when it belongs to a known member, so
   * the form can warn and/or pre-fill as the number is typed.
   */
  lookupRegistration: (eventId, mobileNumber) =>
    api.get('/api/v1/register-for-events/lookup', {
      params: { event_id: eventId, mobile_number: mobileNumber },
    }),

  myRegistrations: () => api.get('/api/v1/register-for-events'),
  /**
   * BULK and atomic — the endpoint takes an ARRAY and registers every entry in
   * one transaction. Posting per member in a loop would leave a partial success
   * with no way to tell which rows landed.
   */
  register: (items) => api.post('/api/v1/register-for-events', items, { envelope: true }),
  updateRegistration: (id, payload) =>
    api.patch(`/api/v1/register-for-events/${id}`, payload, { envelope: true }),
};
