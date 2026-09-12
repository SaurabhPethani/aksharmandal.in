import { useState } from 'react';
import { usePermissions, useToast } from '../hooks';
import {
  useApprovalActions, useInfoRequests, useMyTransferRequests,
  usePendingTransfers, useTransferHistory,
} from '../hooks/useApprovals';
import { ACTIONS, MODULES } from '../constants/permissions';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { InfoRequestCard, TransferCard } from '../components/approvals/ApprovalCards';
import { EditApproveDialog, RemarkDialog } from '../components/approvals/ApprovalDialogs';

/**
 * Approvals — four queues, two resources.
 *
 *   Pending Transfers   requests pointed AT me           TRANSFER:UPDATE to act
 *   Approval History    resolved transfers in my scope   read-only
 *   Info Changes        profile edits awaiting review    USERS:APPROVE_USER_INFO
 *   My Requests         transfers I raised               I may cancel my own
 *
 * The tabs are filtered by grant, so a role that can raise a transfer but not
 * review one sees only "My Requests" rather than three empty lists it can do
 * nothing with. Reading is what puts a tab on screen; acting is a second check
 * on the buttons inside it.
 */

const BTN = 'rounded-control px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50';

function List({ query, rows, empty, children }) {
  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-card border border-line-soft bg-surface p-5 shadow-card">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="mt-4 h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }
  if (query.error) {
    return (
      <div className="card">
        <ErrorState error={query.error} onRetry={query.refetch} title="Could not load this list" />
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="card">
        <p className="py-10 text-center text-sm text-text-muted">{empty}</p>
      </div>
    );
  }
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>;
}

export default function ApprovalsPage() {
  const { can } = usePermissions();
  const toast = useToast();

  const canReviewTransfers = can(MODULES.TRANSFER, ACTIONS.UPDATE);
  const canReadTransfers = can(MODULES.TRANSFER, ACTIONS.READ);
  const canApproveInfo = can(MODULES.USERS, ACTIONS.APPROVE_USER_INFO);

  const TABS = [
    { key: 'pending', label: 'Pending Transfers', show: canReadTransfers },
    { key: 'history', label: 'Approval History', show: canReadTransfers },
    { key: 'info', label: 'Info Changes', show: canApproveInfo },
    { key: 'mine', label: 'My Requests', show: canReadTransfers },
  ].filter((t) => t.show);

  const [active, setActive] = useState(TABS[0]?.key);
  const tab = TABS.find((t) => t.key === active) ?? TABS[0];

  const pendingQ = usePendingTransfers(tab?.key === 'pending');
  const historyQ = useTransferHistory(tab?.key === 'history');
  const mineQ = useMyTransferRequests(tab?.key === 'mine');
  const infoQ = useInfoRequests(tab?.key === 'info', { status: 'pending' });

  const actions = useApprovalActions();

  // { kind, row } — which dialog is open and what it acts on.
  const [dialog, setDialog] = useState(null);
  const close = () => setDialog(null);

  const rowsOf = (q) => (Array.isArray(q.data) ? q.data : q.data?.items ?? []);

  const run = (mutation, vars, successMessage) =>
    mutation.mutate(vars, {
      onSuccess: (res) => {
        toast.success(res?.detail ?? successMessage);
        close();
      },
      onError: (err) => toast.error(err?.message ?? 'That did not go through.'),
    });

  if (!TABS.length) {
    return (
      <>
        <PageHeader title="Approvals" />
        <div className="card">
          <EmptyState
            title="Nothing to approve"
            hint="Your role does not grant transfer review or information-change approval."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Approvals" />

      <div className="mb-5 flex flex-wrap items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            aria-current={t.key === tab.key ? 'page' : undefined}
            className={`rounded-xl px-4 py-2 text-sm transition-all ${
              t.key === tab.key
                ? 'bg-surface font-bold text-primary shadow-card'
                : 'font-medium text-text-muted hover:text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab.key === 'pending' && (
        <List query={pendingQ} rows={rowsOf(pendingQ)} empty="No pending transfers awaiting your approval">
          {rowsOf(pendingQ).map((row) => (
            <TransferCard
              key={row.id}
              row={row}
              actions={
                canReviewTransfers && (
                  <>
                    <button
                      type="button"
                      className={`${BTN} bg-primary text-white hover:bg-primary-hover`}
                      onClick={() => setDialog({ kind: 'accept', row })}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className={`${BTN} border border-danger-fg/30 text-danger-fg hover:bg-danger-bg`}
                      onClick={() => setDialog({ kind: 'reject-transfer', row })}
                    >
                      Reject
                    </button>
                  </>
                )
              }
            />
          ))}
        </List>
      )}

      {tab.key === 'history' && (
        <List query={historyQ} rows={rowsOf(historyQ)} empty="No resolved transfers yet">
          {rowsOf(historyQ).map((row) => <TransferCard key={row.id} row={row} />)}
        </List>
      )}

      {tab.key === 'mine' && (
        <List query={mineQ} rows={rowsOf(mineQ)} empty="You have not raised any transfer requests">
          {rowsOf(mineQ).map((row) => (
            <TransferCard
              key={row.id}
              row={row}
              actions={
                // Only a request still awaiting a decision can be withdrawn.
                String(row.status).toLowerCase() === 'requested' && (
                  <button
                    type="button"
                    className={`${BTN} border border-line-strong text-primary hover:border-primary`}
                    onClick={() => setDialog({ kind: 'cancel-transfer', row })}
                  >
                    Cancel Request
                  </button>
                )
              }
            />
          ))}
        </List>
      )}

      {tab.key === 'info' && (
        <List query={infoQ} rows={rowsOf(infoQ)} empty="No information changes awaiting your approval">
          {rowsOf(infoQ).map((row) => (
            <InfoRequestCard
              key={row.id}
              row={row}
              actions={
                <>
                  <button
                    type="button"
                    className={`${BTN} bg-primary text-white hover:bg-primary-hover`}
                    onClick={() => setDialog({ kind: 'approve-info', row })}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={`${BTN} border border-line-strong text-primary hover:border-primary`}
                    onClick={() => setDialog({ kind: 'edit-info', row })}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${BTN} border border-danger-fg/30 text-danger-fg hover:bg-danger-bg`}
                    onClick={() => setDialog({ kind: 'reject-info', row })}
                  >
                    Reject
                  </button>
                </>
              }
            />
          ))}
        </List>
      )}

      {/* A Sabha transfer needs no landing Sabha — the destination is already
          final — so accepting one is just a confirmation. A MANDAL transfer does
          need one, which this dialog cannot collect; see the note in the page
          summary. */}
      <RemarkDialog
        isOpen={dialog?.kind === 'accept'}
        title="Accept Transfer Request"
        label="Note"
        optional
        submitLabel="Accept"
        busy={actions.acceptTransfer.isPending}
        error={actions.acceptTransfer.error?.message ?? null}
        onClose={close}
        onConfirm={() => run(actions.acceptTransfer, { id: dialog.row.id }, 'Transfer accepted.')}
      />

      <RemarkDialog
        isOpen={dialog?.kind === 'reject-transfer'}
        title="Reject Transfer Request"
        label="Reason"
        optional={false}
        busy={actions.rejectTransfer.isPending}
        error={actions.rejectTransfer.error?.message ?? null}
        onClose={close}
        onConfirm={(reason) => run(actions.rejectTransfer, { id: dialog.row.id, reason }, 'Transfer rejected.')}
      />

      <RemarkDialog
        isOpen={dialog?.kind === 'cancel-transfer'}
        title="Cancel Transfer Request"
        label="Reason"
        optional={false}
        busy={actions.cancelTransfer.isPending}
        error={actions.cancelTransfer.error?.message ?? null}
        onClose={close}
        onConfirm={(reason) => run(actions.cancelTransfer, { id: dialog.row.id, reason }, 'Transfer cancelled.')}
      />

      <RemarkDialog
        isOpen={dialog?.kind === 'approve-info'}
        title="Approve Information Change"
        label="Remarks"
        optional
        busy={actions.approveInfo.isPending}
        error={actions.approveInfo.error?.message ?? null}
        onClose={close}
        onConfirm={(remarks) => run(actions.approveInfo, { id: dialog.row.id, remarks }, 'Change approved.')}
      />

      <RemarkDialog
        isOpen={dialog?.kind === 'reject-info'}
        title="Reject Information Change"
        label="Reason"
        optional={false}
        busy={actions.rejectInfo.isPending}
        error={actions.rejectInfo.error?.message ?? null}
        onClose={close}
        onConfirm={(remarks) => run(actions.rejectInfo, { id: dialog.row.id, remarks }, 'Change rejected.')}
      />

      {dialog?.kind === 'edit-info' && (
        // Keyed on the request so the form seeds from the row it is editing
        // rather than from whichever row opened it first.
        <EditApproveDialog
          key={dialog.row.id}
          request={dialog.row}
          isOpen
          busy={actions.approveInfo.isPending}
          error={actions.approveInfo.error?.message ?? null}
          onClose={close}
          onConfirm={({ overrides, remarks }) =>
            run(actions.approveInfo, { id: dialog.row.id, overrides, remarks }, 'Change approved.')
          }
        />
      )}
    </>
  );
}
