import { api } from '../api/client';

// Traffic analytics — the SuperAdmin dashboard, and the presence heartbeat that
// feeds its "time on site" figure.
export const analyticsService = {
  // One minute of presence for the signed-in user. Fire-and-forget; the backend
  // dedupes by the minute, so calling it a little too often is harmless.
  heartbeat: () => api.post('/api/v1/analytics/heartbeat'),

  // The whole dashboard payload for a window of `days`.
  traffic: (days = 30) => api.get('/api/v1/analytics/traffic', { params: { days } }),

  // The full active-member list (dashboard shows only the top few).
  activeMembers: (days = 30) => api.get('/api/v1/analytics/active-members', { params: { days } }),

  // Members for one IST day: metric 'logins' (who signed in) or 'new' (first-timers).
  dayMembers: (date, metric = 'logins') =>
    api.get('/api/v1/analytics/day-members', { params: { date, metric } }),
};
