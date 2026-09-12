import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './ui';
import { useDismissable } from '../hooks';

/** Locks body scroll while any overlay is open. */
function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}

// `2xl` exists for dialogs that lay content out in columns — the role
// permission grid is two module columns wide and reads as cramped below this.
const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-5xl' };

/**
 * `dismissible={false}` seals the modal: no Escape, no backdrop click, no close
 * button. Used while a request the dialog owns is in flight, so the user cannot
 * walk away from a half-finished write.
 */
export function Modal({ isOpen, onClose, title, description, footer, size = 'md', dismissible = true, children }) {
  const panel = useRef(null);
  useDismissable(panel, onClose, isOpen && dismissible);
  useScrollLock(isOpen);
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center px-[2.5%] py-0 sm:items-center sm:p-4">
      <div className="absolute inset-0" style={{ background: 'rgba(10,15,40,0.55)', backdropFilter: 'blur(4px)' }} />
      {/*
        A flex column, and the scroll lives on the body alone.
        Previously the panel was capped at 92vh with `overflow-hidden` while the
        body carried its own `max-h-[70vh]`. Two independent caps: once header +
        70vh + footer exceeded the panel's 92vh, the panel simply clipped — and
        what got clipped was the footer, so the confirm button vanished off the
        bottom of a tall dialog. Here the header and footer are shrink-0 and the
        body is `min-h-0 flex-1`, so they are always on screen and only the
        content between them scrolls.
      */}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        // `content-type` carries the content area's 1pt step (see index.css).
        // Needed HERE because this panel is portalled to document.body, so it
        // lands outside the AppShell wrapper that would otherwise supply it —
        // without this a dialog would read a point smaller than the page it was
        // opened from.
        //
        // HEIGHT: 80vh on a phone, 92vh from `sm` up. As a bottom sheet (mobile
        // is `items-end`), 92vh pushed the header — and its close button — up
        // under the browser URL bar, because mobile `vh` counts the URL-bar
        // area the sheet then can't reach. Capping the sheet at 80vh leaves the
        // top ~20% of the screen showing the backdrop, so the close button sits
        // safely below the URL bar and stays reachable. Desktop (centred) keeps
        // 92vh.
        className={`content-type relative flex max-h-[80vh] w-full flex-col ${SIZES[size]} overflow-hidden rounded-t-card border border-line-soft bg-surface shadow-card sm:max-h-[92vh] sm:rounded-card`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="section-title">{title}</h2>
            {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
          </div>
          {dismissible && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-control p-1.5 text-text-muted transition-colors hover:bg-primary-50 hover:text-primary"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {/*
          Two things below sm, both of which bit on a real phone:

          `flex-wrap` — the footer is a right-aligned row, and two buttons whose
          labels are verbs ("Cancel" + "Register 3 members") overflow a 360px
          sheet. Without wrapping the action button was pushed off the right edge
          of a dialog that cannot scroll sideways, so it could not be pressed.

          The safe-area padding — this is a BOTTOM SHEET below sm (`items-end`,
          flush to the viewport edge), which on an iPhone puts the action button
          under the home indicator. `env()` is 0 everywhere it does not apply, so
          desktop is untouched.
        */}
        {footer && (
          <div
            className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-4 py-4 sm:px-5"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ isOpen, onClose, title, side = 'right', width = 'w-[min(28rem,100vw)]', footer, children }) {
  const panel = useRef(null);
  useDismissable(panel, onClose, isOpen);
  useScrollLock(isOpen);
  if (!isOpen) return null;

  const edge = side === 'left' ? 'left-0' : 'right-0';
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" style={{ background: 'rgba(10,15,40,0.55)', backdropFilter: 'blur(4px)' }} />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        // Portalled like the Modal above, and for the same reason.
        className={`content-type absolute inset-y-0 ${edge} ${width} flex flex-col border-line bg-surface shadow-card ${
          side === 'left' ? 'border-r' : 'border-l'
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="section-title">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-control p-1.5 text-text-muted transition-colors hover:bg-primary-50 hover:text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </aside>
    </div>,
    document.body
  );
}

/**
 * `destructive` is what decides whether the user is warned that an action cannot
 * be undone — not whether a description happened to be passed. Those are
 * unrelated questions, and conflating them told everyone that a reversible
 * status toggle was permanent.
 *
 * `description` is the caller's own wording and is rendered as the body. It is
 * not passed down to Modal as well, which would print it twice.
 */
export function ConfirmDialog({
  isOpen, onClose, onConfirm, title = 'Are you sure?',
  description, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  tone = 'primary', busy = false, destructive = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-muted">
        {description ?? 'Please confirm you want to continue.'}
      </p>
      {destructive && (
        <p className="mt-2 text-sm font-semibold text-danger-fg">This action cannot be undone.</p>
      )}
    </Modal>
  );
}
