import { Modal } from './Overlays';
import { Button } from './ui';

/**
 * The standard create / update popup for this app.
 *
 * Every write that is not a whole multi-step form goes through this: Add
 * Schedule, Add Special Sabha, Quick Sabha Transfer, Assign Role, Change
 * Follow-up. They differ only in what is between the header and the footer, so
 * everything else — the sealing, the button order, the wording, where a failure
 * that belongs to no single field is printed — is decided once, here.
 *
 * What it standardises:
 *
 *   sealed while busy   `dismissible={!busy}`, so a request in flight cannot be
 *                       walked away from by Escape, a backdrop click, or the
 *                       close button, and neither footer button is live.
 *   button order        Cancel on the left, the action on the right. The action
 *                       carries the busy spinner; Cancel is merely disabled.
 *   the action's name   a verb for what will happen ("Add Schedule", "Transfer
 *                       now"), never "OK" or "Submit".
 *   error placement     field errors render under their own control; anything
 *                       left over — a 500, an offline write, a 422 naming a
 *                       field the dialog does not draw — is printed once, above
 *                       the footer, where the eye already is.
 *
 * Deleting is NOT this component: a delete asks a question rather than
 * collecting an answer, and goes through ConfirmDialog with `destructive`.
 */
export default function FormDialog({
  isOpen,
  onClose,
  title,
  description,
  /** The action button's label. A verb — what pressing it does. */
  submitLabel = 'Save',
  onSubmit,
  /** Disables the action without explaining why — use for an incomplete form. */
  submitDisabled = false,
  /**
   * Drops the action button entirely, leaving Cancel as the only control. For a
   * dialog that has nothing to submit at all — a record the caller may read but
   * not write. A permanently disabled button in that case explains nothing and
   * reads as a bug; the body says why instead.
   */
  hideSubmit = false,
  /**
   * `primary` (navy) by default. `accent` for a screen whose own call to action
   * is orange, so the dialog's button reads as the same action the row's button
   * opened.
   */
  submitVariant = 'primary',
  busy = false,
  /** Page-level failure, already resolved to presentable wording. */
  error = null,
  size = 'md',
  cancelLabel = 'Cancel',
  children,
}) {
  const close = () => {
    if (busy) return;
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={title}
      description={description}
      size={size}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={close} disabled={busy}>{cancelLabel}</Button>
          {!hideSubmit && (
            <Button variant={submitVariant} onClick={onSubmit} busy={busy} disabled={submitDisabled}>
              {submitLabel}
            </Button>
          )}
        </>
      }
    >
      {/* A form element, so Enter submits from any field — a dialog with one
          text box and a button should not need the mouse. */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (!busy && !submitDisabled) onSubmit?.(); }}
        className="space-y-4"
      >
        {children}

        {error && (
          <p className="rounded-control border border-danger-fg/30 bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
            {error}
          </p>
        )}

        {/* Enter reaches the handler above through a submit control; the footer
            button lives outside the form, in the modal's own chrome. */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </Modal>
  );
}
