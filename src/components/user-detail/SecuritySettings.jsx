import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { FONT_DISPLAY } from '../../constants/typography';
import { Button, Toggle } from '../ui';
import { FormField, Input } from '../form';
import { useAuth, useToast } from '../../hooks/core';
import { authService } from '../../services/authService';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

/**
 * In-profile credential changes — Change Password and Change PIN — WITHOUT the
 * OTP / forgot-password flow. The member proves ownership with their CURRENT
 * value, and the backend keeps the session alive (no token-version bump), so
 * changing a credential here does not sign them out.
 *
 * Validation mirrors the backend so the member learns the rule before the round
 * trip; the backend re-checks everything and is the authority.
 */

const PIN_LENGTH = 6;
const PW_MIN = 8;
const PW_MAX = 15;

const onlyDigits = (v, n) => String(v).replace(/\D/g, '').slice(0, n);

function passwordProblem(pw) {
  if (pw.length < PW_MIN || pw.length > PW_MAX)
    return `Password must be ${PW_MIN}–${PW_MAX} characters.`;
  if (!/[A-Z]/.test(pw)) return 'Password needs an uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password needs a lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password needs a digit.';
  if (!/[^A-Za-z0-9\s]/.test(pw)) return 'Password needs a symbol.';
  return null;
}

function Section({ icon, title, hint, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <MaterialCommunityIcons
          name={icon}
          size={space(4)}
          color={COLORS.accent}
        />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.sectionHint}>{hint}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function BiometricSection() {
  const toast = useToast();
  const {
    biometricAvailable: available,
    biometricEnabled: enabled,
    enableBiometric,
    disableBiometric,
    refreshBiometric,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  // A fingerprint added in the phone's settings shows up on the way back.
  useEffect(() => {
    refreshBiometric();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && !working.current) refreshBiometric();
    });
    return () => sub.remove();
  }, [refreshBiometric]);

  const toggle = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      if (enabled) {
        await disableBiometric();
        toast.success('Biometric login is turned off.');
      } else {
        await enableBiometric();
        toast.success('Biometric login is turned on.');
      }
    } catch {
      toast.error(
        enabled
          ? 'Could not turn off biometric login. Please try again.'
          : 'Could not turn on biometric login. Please try again.',
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  return (
    <Section
      icon="fingerprint"
      title="Biometric Login"
      hint="Sign in with your fingerprint or face instead of typing your PIN or password. This applies to this phone only."
    >
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>Enable biometric login</Text>
          <Text style={styles.switchHint}>
            {!available
              ? 'No fingerprint or face is set up on this phone. Add one in the phone’s settings first.'
              : enabled
                ? 'On for this phone.'
                : 'Off.'}
          </Text>
        </View>
        <Toggle
          tone="accent"
          label="Enable biometric login"
          checked={enabled}
          disabled={!available || busy}
          onChange={toggle}
        />
      </View>
    </Section>
  );
}

export default function SecuritySettings() {
  const toast = useToast();

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pin, setPin] = useState({ current: '', next: '', confirm: '' });

  const changePassword = useMutation({
    mutationFn: () => authService.changePassword(pw.current, pw.next),
    onSuccess: res => {
      toast.success(res?.detail || 'Password updated.');
      setPw({ current: '', next: '', confirm: '' });
    },
    onError: err => toast.error(err?.message || 'Could not update password.'),
  });

  const changePin = useMutation({
    mutationFn: () => authService.changePin(pin.current, pin.next),
    onSuccess: res => {
      toast.success(res?.detail || 'PIN updated.');
      setPin({ current: '', next: '', confirm: '' });
    },
    onError: err => toast.error(err?.message || 'Could not update PIN.'),
  });

  const submitPassword = () => {
    if (!pw.current) return toast.error('Enter your current password.');
    const problem = passwordProblem(pw.next);
    if (problem) return toast.error(problem);
    if (pw.next !== pw.confirm)
      return toast.error('The new passwords do not match.');
    return changePassword.mutate();
  };

  const submitPin = () => {
    if (pin.current.length !== PIN_LENGTH)
      return toast.error(`Enter your current ${PIN_LENGTH}-digit PIN.`);
    if (pin.next.length !== PIN_LENGTH)
      return toast.error(`The new PIN must be exactly ${PIN_LENGTH} digits.`);
    if (pin.next !== pin.confirm)
      return toast.error('The new PINs do not match.');
    return changePin.mutate();
  };

  return (
    <View style={styles.stack}>
      <BiometricSection />

      <Section
        icon="lock-outline"
        title="Change Password"
        hint={`Update your password without an OTP. It must be ${PW_MIN}–${PW_MAX} characters with an uppercase letter, a lowercase letter, a digit and a symbol.`}
      >
        <FormField label="Current password">
          <Input
            secureTextEntry
            autoComplete="off"
            value={pw.current}
            disabled={changePassword.isPending}
            onChangeText={v => setPw(s => ({ ...s, current: v }))}
          />
        </FormField>
        <FormField label="New password">
          <Input
            secureTextEntry
            autoComplete="off"
            value={pw.next}
            disabled={changePassword.isPending}
            onChangeText={v => setPw(s => ({ ...s, next: v }))}
          />
        </FormField>
        <FormField label="Confirm new password">
          <Input
            secureTextEntry
            autoComplete="off"
            value={pw.confirm}
            disabled={changePassword.isPending}
            onChangeText={v => setPw(s => ({ ...s, confirm: v }))}
          />
        </FormField>
        <Button
          variant="accent"
          style={styles.submit}
          onPress={submitPassword}
          busy={changePassword.isPending}
        >
          Update Password
        </Button>
      </Section>

      <Section
        icon="key-outline"
        title="Change PIN"
        hint={`Update your ${PIN_LENGTH}-digit login PIN without an OTP.`}
      >
        <FormField label="Current PIN">
          <Input
            secureTextEntry
            keyboardType="number-pad"
            autoComplete="off"
            value={pin.current}
            disabled={changePin.isPending}
            onChangeText={v =>
              setPin(s => ({ ...s, current: onlyDigits(v, PIN_LENGTH) }))
            }
          />
        </FormField>
        <FormField label="New PIN">
          <Input
            secureTextEntry
            keyboardType="number-pad"
            autoComplete="off"
            value={pin.next}
            disabled={changePin.isPending}
            onChangeText={v =>
              setPin(s => ({ ...s, next: onlyDigits(v, PIN_LENGTH) }))
            }
          />
        </FormField>
        <FormField label="Confirm new PIN">
          <Input
            secureTextEntry
            keyboardType="number-pad"
            autoComplete="off"
            value={pin.confirm}
            disabled={changePin.isPending}
            onChangeText={v =>
              setPin(s => ({ ...s, confirm: onlyDigits(v, PIN_LENGTH) }))
            }
          />
        </FormField>
        <Button
          variant="accent"
          style={styles.submit}
          onPress={submitPin}
          busy={changePin.isPending}
        >
          Update PIN
        </Button>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(4) },
  section: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.bg,
    padding: space(5),
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
  },
  sectionTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.lg,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  sectionHint: {
    marginTop: space(1),
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.5,
    color: COLORS.textMuted,
  },
  sectionBody: { marginTop: space(4), gap: space(3) },
  submit: { alignSelf: 'flex-start' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  switchCopy: { flex: 1 },
  switchTitle: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  switchHint: { fontSize: TEXT.xs, color: COLORS.textMuted },
});
