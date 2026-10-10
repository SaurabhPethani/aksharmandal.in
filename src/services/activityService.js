import { api } from '../api/client';

/**
 * GET /api/v1/activity-logs — newest first, server-paginated.
 * Returns { items, page, limit, total_records, total_pages, has_next_page,
 * has_previous_page }. Gated on LOGS:ACTIVITY_LOGS_READ.
 * Optional params: from_date, to_date, category, page.
 */
export const activityService = {
  list: (params) => api.get('/api/v1/activity-logs', { params }),
};
