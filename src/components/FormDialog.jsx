import React from 'react';
import { Modal, useModalClose } from './Overlays';
import { Button } from './ui';
import { Text } from './Typography';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../constants/theme';
import { StyleSheet, View } from 'react-native';

/**
 * A dialog's Cancel button. It closes through the Modal, so the card goes
 * before the page behind it re-renders.
 */
export function DialogCancel({ variant, disabled, children = 'Cancel' }) {
  const close = useModalClose();
  return (
    <Button variant={variant} onPress={close} disabled={disabled}>
      {children}
    </Button>
  );
}

/**
 * The standard create / update popup for this app — the mobile port of the
 * web's FormDialog.jsx.
 *
 * Every write that is not a whole multi-step form goes through this. It
 * standardises:
 *
 *   sealed while busy   `dismissible={!busy}`, so a request in flight cannot be
 *                       walked away from, and neither footer button is live.
 *   button order        Cancel on the left, the action on the right. The action
 *                       carries the busy spinner; Cancel is merely disabled.
 *   error placement     field errors render under their own control; anything
 *                       left over is printed once, above the footer.
 *
 * No `<form>`/Enter-to-submit here — there is no keyboard "Enter" on a phone,
 * so submitting is always the footer button.
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
   * Drops the action button entirely, leaving Cancel as the only control — for
   * a dialog that has nothing to submit at all.
   */
  hideSubmit = false,
  /**
   * `primary` (navy) by default. `accent` for a screen whose own call to action
   * is orange, so the dialog's button reads as the same action that opened it.
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
          <DialogCancel disabled={busy}>{cancelLabel}</DialogCancel>
          {!hideSubmit && (
            <Button
              variant={submitVariant}
              onPress={onSubmit}
              busy={busy}
              disabled={submitDisabled}
            >
              {submitLabel}
            </Button>
          )}
        </>
      }
    >
      <View style={styles.stack}>
        {children}

        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(4) },
  error: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.3)',
    backgroundColor: COLORS.dangerBg,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.medium,
    color: COLORS.dangerFg,
  },
});
