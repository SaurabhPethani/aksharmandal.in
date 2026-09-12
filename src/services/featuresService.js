import { api } from '../api/client';

/**
 * Backend module toggles — GET /api/v1/features returns a plain dict of
 * boolean flags (no StandardResponse envelope), e.g.
 *   { jobs: true, resume: false, prasangam: false }
 *
 * A flag is FALSE when the corresponding module router is not mounted in the
 * running backend (per-env rollout gate in `backend/app/core/config.py`), so
 * the frontend must hide anything that would call one of its endpoints —
 * otherwise the request 404s and reads as a broken screen.
 *
 * Public: no permission, no user context. Every authenticated screen may read
 * it, and the sign-in gate does not.
 */
export const featuresService = {
  getAll: () => api.get('/api/v1/features'),
};
