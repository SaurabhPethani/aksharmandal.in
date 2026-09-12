import { AlertCircle } from 'lucide-react';
import { Modal } from '../Overlays';
import { Button } from '../ui';

/**
 * Confirmation for the Attending / Not Attending toggle.
 *
 * The toggle never moves on click — this dialog is what stands between the click
 * and PATCH /api/v1/users/status/bulk, and the row only changes once the server
 * has confirmed. While `busy` the dialog is sealed (no Escape, no backdrop
 * click, no close button) and both buttons are disabled, so a second submit is
 * impossible.
 *
 * `error` is the backend's own message, shown verbatim; the buttons come back
 * enabled so the user can retry or back out without losing the dialog.
 */
export default function StatusConfirmDialog({ member, nextStatus, busy = false, error, onConfirm, onCancel }) {
  const label = nextStatus ? 'Attending' : 'Not Attending';

  return (
    <Modal
      isOpen={Boolean(member)}
      onClose={onCancel}
      dismissible={!busy}
      size="sm"
      title={`Mark as ${label}?`}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>No</Button>
          <Button variant="primary" onClick={onConfirm} busy={busy}>Yes</Button>
        </>
      }
    >
      <p className="text-sm text-text-muted">
        Are you sure you want to mark{' '}
        <span className="font-semibold text-primary">{member?.user_name}</span> as {label}?
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-control border border-danger-fg/20 bg-danger-bg px-3 py-2.5"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger-fg" />
          <p className="text-sm text-danger-fg">{error}</p>
        </div>
      )}
    </Modal>
  );
}
