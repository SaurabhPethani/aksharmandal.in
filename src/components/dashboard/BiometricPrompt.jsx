import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Button } from '../ui';
import { useAuth } from '../../hooks/core';
import {
  COLORS,
  RADII,
  SHADOWS,
  TEXT,
  WEIGHT,
  space,
} from '../../constants/theme';

const VISIBLE_MS = 6000;

export default function BiometricPrompt({ onEnable }) {
  const { biometricPromptDue, dismissBiometricPrompt } = useAuth();
  const [open, setOpen] = useState(false);
  const enter = useRef(new Animated.Value(0)).current;

  // Taken once per sign-in, so coming back to the dashboard does not repeat it.
  useEffect(() => {
    if (!biometricPromptDue) return;
    dismissBiometricPrompt();
    setOpen(true);
  }, [biometricPromptDue, dismissBiometricPrompt]);

  useEffect(() => {
    if (!open) return undefined;
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => setOpen(false), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [open, enter]);

  if (!open) return null;

  return (
    // Only the slide is animated: the card never depends on an animation
    // having run to be visible.
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        {
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [-12, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.icon}>
        <MaterialCommunityIcons
          name="fingerprint"
          size={space(6)}
          color={COLORS.primary}
        />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>You can enable biometric login</Text>
        <Text style={styles.hint}>
          Sign in with your fingerprint or face next time.
        </Text>
        <Button
          variant="accent"
          style={styles.action}
          textStyle={styles.actionText}
          onPress={() => {
            setOpen(false);
            onEnable?.();
          }}
        >
          Enable
        </Button>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
        onPress={() => setOpen(false)}
        style={styles.close}
      >
        <MaterialCommunityIcons
          name="close"
          size={space(4)}
          color={COLORS.textMuted}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: space(3),
    left: space(4),
    right: space(4),
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(3),
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    padding: space(3.5),
    ...SHADOWS.card,
    elevation: 6,
  },
  icon: {
    width: space(10),
    height: space(10),
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, alignItems: 'flex-start', gap: space(1) },
  title: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  hint: { fontSize: TEXT.xs, color: COLORS.textMuted },
  action: {
    marginTop: space(2),
    paddingHorizontal: space(4),
    paddingVertical: space(2),
  },
  actionText: { fontSize: TEXT.sm },
  close: { borderRadius: RADII.lg, padding: space(1) },
});
