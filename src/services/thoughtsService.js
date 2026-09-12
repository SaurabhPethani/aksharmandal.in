import { api } from '../api/client';

/**
 * Daily Thoughts — the spiritual quote surfaced on My Dashboard, plus its
 * admin CRUD used by the Master Data screen.
 *
 * Backed by a JSON file on the server, not a table (see
 * `backend/app/services/thoughts_service.py`). Nothing about that shows
 * through here: the shape is a plain envelope with an id, and the frontend
 * treats the store like any other list resource.
 *
 * READ:
 *   `/random`  any authenticated user (dashboard)
 *   `''`       admin only — role_id ≤ 7 (master data tab)
 * WRITE (both admin-only):
 *   POST / DELETE
 */
export const thoughtsService = {
  // Dashboard: the pre-rendered image for today (random among today's, else the
  // last available, else null). Replaces the old `/random` text card.
  todayImage: () => api.get('/api/v1/thoughts/today-image'),
  random: () => api.get('/api/v1/thoughts/random'),
  list: () => api.get('/api/v1/thoughts'),
  create: (text) => api.post('/api/v1/thoughts', { text }, { envelope: true }),
  remove: (id) => api.delete(`/api/v1/thoughts/${id}`, { envelope: true }),
  // Render the image for one unused quote (backend: rank >= 50).
  generate: (id) => api.post(`/api/v1/thoughts/${id}/generate`, {}, { envelope: true }),
  // Delete a quote's image and free it for regeneration (backend: rank == 100).
  removeImage: (id) => api.delete(`/api/v1/thoughts/${id}/image`, { envelope: true }),

  // ── SuperAdmin: the per-user image pool ────────────────────────────────────
  // Bulk-add quotes, one per line (blank lines ignored).
  bulk: (text) => api.post('/api/v1/thoughts/bulk', { text }, { envelope: true }),
  // "Generate new": render up to 200 unused quotes into the pool (background job).
  generateBatch: () => api.post('/api/v1/thoughts/generate-batch', {}, { envelope: true }),
  // "Regenerate": re-render ALL images with the current theme. Default queues for
  // 01:00 IST; run_now runs immediately in the background (dev / scheduler off).
  regenerate: (runNow = false) =>
    api.post('/api/v1/thoughts/regenerate', { run_now: runNow }, { envelope: true }),
  // Control-panel snapshot: pool sizes, consumption, low-buffer alert, top-10
  // bucket, and live job status.
  overview: () => api.get('/api/v1/thoughts/admin/overview'),
};
