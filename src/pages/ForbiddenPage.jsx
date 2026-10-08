import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Button } from '../components/ui';
import { Text } from '../components/Typography';
import { FONT_DISPLAY } from '../constants/typography';
import { COLORS, RADII, TEXT, WEIGHT, rem, space } from '../constants/theme';

/**
 * 403 for a screen that exists but the caller's grants do not cover. Rendered
 * inside the page's own header and scroll area.
 */
export default function ForbiddenPage({
  title = 'Permission denied',
  message = 'Your role does not grant access to this page.',
  onBack,
  backLabel = 'Back to dashboard',
}) {
  const { height } = useWindowDimensions();

  return (
    <View style={[styles.wrap, { minHeight: height * 0.6 }]}>
      <View style={styles.icon}>
        <MaterialCommunityIcons
          name="shield-alert-outline"
          size={space(7)}
          color={COLORS.dangerFg}
        />
      </View>
      <Text style={styles.code}>Error 403</Text>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {onBack ? (
        <Button variant="primary" onPress={onBack}>
          {backLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(3),
    paddingHorizontal: space(4),
  },
  icon: {
    width: space(14),
    height: space(14),
    borderRadius: RADII.full,
    backgroundColor: COLORS.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: COLORS.textMuted,
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
    textAlign: 'center',
  },
  message: {
    maxWidth: rem(28),
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
