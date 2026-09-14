import { useCallback, useMemo, useState } from 'react';
import { usePermissions } from './core';
import { useInfoRequests, useMyTransferRequests, usePendingTransfers } from './useApprovals';
import { ACTIONS, MODULES } from '../constants/permissions';
import {
  fromInfoRequests, fromMyTransferRequests, fromPendingTransfers,
  isUnread, markAllRead, readWatermark, sortByNewest,
} from '../utils/notifications';

/**
 * Everything behind the bell, from the three lists the Approvals screen already
 * reads. See utils/notifications.js for why those three and not others.
 *
 * EACH SOURCE IS GATED ON ITS OWN GRANT, and the gate is the query's `enabled`
 * rather than a filter afterwards: a caller without USERS:APPROVE_USER_INFO
 * gets a 403 from /information-requests, and firing it to throw away the error
 * would put a failed request on every page load.
 *
 * This gates the DATA and never the bell, which renders for everyone. A caller
 * with no readable source lands on the caught-up state rather than a spinner:
 * a disabled query is idle, not pending, so `isLoading` below is false for them
 * from the first render and there is nothing to wait for.
 *
 * The queries are shared with the Approvals screen by query key, so opening that
 * page after the bell has loaded costs nothing.
 */
export function useNotifications() {
  const { can } = usePermissions();

  const canReadTransfers = can(MODULES.TRANSFER, ACTIONS.READ);
  const canApproveInfo = can(MODULES.USERS, ACTIONS.APPROVE_USER_INFO);

  const pendingQ = usePendingTransfers(canReadTransfers);
  const mineQ = useMyTransferRequests(canReadTransfers);
  const infoQ = useInfoRequests(canApproveInfo, { status: 'pending' });

  // Watermark in state so "Mark all read" repaints immediately — localStorage
  // does not notify its own tab, and re-reading it on render would not either.
  const [watermark, setWatermark] = useState(readWatermark);

  const rowsOf = (q) => (Array.isArray(q.data) ? q.data : q.data?.items ?? []);

  const items = useMemo(
    () => sortByNewest([
      ...fromPendingTransfers(rowsOf(pendingQ)),
      ...fromMyTransferRequests(rowsOf(mineQ)),
      ...fromInfoRequests(rowsOf(infoQ)),
    ]).map((entry) => ({ ...entry, unread: isUnread(entry, watermark) })),
    [pendingQ, mineQ, infoQ, watermark]
  );

  const unreadCount = items.filter((i) => i.unread).length;

  return {
    items,
    unreadCount,
    // Loading only while something is actually in flight for a source this
    // caller may read — a role with no sources is not "loading", it is empty.
    isLoading: pendingQ.isLoading || mineQ.isLoading || infoQ.isLoading,
    /**
     * Every source refused. Reported separately from `items` so the UI can say
     * "could not load" instead of "you're all caught up", which would be a lie
     * told by an empty array.
     */
    error: pendingQ.error ?? mineQ.error ?? infoQ.error ?? null,
    markAllRead: useCallback(() => setWatermark(markAllRead()), []),
    /**
     * Does this caller have ANY readable source?
     *
     * NOT a gate on the bell — that renders for everyone. This gates the two
     * places where an empty feed would be a dead end rather than a state: the
     * "View all notifications" link, and the /notifications page it leads to.
     * Without a single source, that page can only ever say "nothing here", and
     * a link to it is a promise the app cannot keep.
     */
    canViewAll: canReadTransfers || canApproveInfo,
  };
}
