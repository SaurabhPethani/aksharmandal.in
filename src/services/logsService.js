import { api } from '../api/client';
import { ACTIONS } from '../constants/permissions';

/**
 * The three Logs tabs, as data.
 *
 * They are NOT one endpoint with a filter — they are three, with different
 * shapes, different filters and different permissions:
 *
 *   Activity Logs  /activity-logs  changes to member records
 *   Module Logs    /module-logs    changes inside the feature modules
 *   System Logs    /cron-logs      scheduled-job runs, a different row shape
 *
 * Each carries its own LOGS action — ACTIVITY_LOGS_READ, MODULE_LOGS_READ and
 * CRON_LOGS_READ — and the page renders only the tabs whose action is granted.
 *
 * `categories` are the display categories each endpoint documents. They are
 * listed here rather than fetched because no endpoint exposes them — the values
 * come from the backend's own query-param documentation.
 */
export const LOG_TABS = [
  {
    key: 'activity',
    label: 'Activity Logs',
    path: '/api/v1/activity-logs',
    action: ACTIONS.ACTIVITY_LOGS_READ,
    description:
      'Changes made to member records — profile edits, sabha and mandal transfers, follow-ups, and permission changes.',
    kind: 'activity',
    categories: [
      'Sabha Transfer',
      'Mandal Transfer',
      'Role & Permission',
      'Edit Profile Approval',
      'Yuva Seva',
    ],
  },
  {
    key: 'module',
    label: 'Module Logs',
    path: '/api/v1/module-logs',
    // Its OWN grant, not the activity one — the endpoint checks
    // LOGS:MODULE_LOGS_READ, so gating this tab on ACTIVITY_LOGS_READ would show
    // a tab whose request then 403s.
    action: ACTIONS.MODULE_LOGS_READ,
    description: 'Changes made inside the feature modules — job postings, events and prasangam.',
    kind: 'activity',
    categories: ['Job Posting', 'Events', 'Prasangam'],
  },
  {
    key: 'system',
    label: 'System Logs',
    path: '/api/v1/cron-logs',
    action: ACTIONS.CRON_LOGS_READ,
    description: 'Scheduled jobs the system ran on its own — sabha spawning and birthday wishes.',
    kind: 'cron',
    // /cron-logs filters by `type`, not `category`, and takes no date range —
    // see logsService.list.
    types: ['Sabha', 'Birthday Wish'],
  },
];

export const logsService = {
  /**
   * One page of a tab.
   *
   * The cron endpoint accepts only `page` and `type`; sending it `from_date` or
   * `category` would be silently ignored, which is worse than not offering the
   * control at all — so the page hides those filters for that tab and this
   * function never sends them.
   */
  list: (tab, { page = 1, fromDate, toDate, category, type } = {}) => {
    if (tab.kind === 'cron') {
      return api.get(tab.path, { params: { page, type: type || undefined } });
    }
    return api.get(tab.path, {
      params: {
        page,
        // `to_date` alone is rejected by the backend (from_date is required
        // whenever to_date is given), so it only ever travels as a pair.
        from_date: fromDate || undefined,
        to_date: fromDate && toDate ? toDate : undefined,
        category: category || undefined,
      },
    });
  },
};
