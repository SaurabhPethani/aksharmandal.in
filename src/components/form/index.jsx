import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../Typography';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

// The web app's form primitives (components/form/index.jsx), ported as they are
// needed. `.input-field` is the shared look.

export function FormField({
  label,
  error,
  hint,
  required,
  badge = null,
  compact = false,
  children,
}) {
  return (
    <View style={compact ? styles.fieldCompact : styles.field}>
      {label ? (
        // The badge sits on the label's own line, pushed to the far end.
        <View style={badge ? styles.labelRow : undefined}>
          <Text style={[styles.label, compact && styles.labelCompact]}>
            {label}
            {required && <Text style={styles.required}> *</Text>}
          </Text>
          {badge}
        </View>
      ) : null}
      {children}
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const LINE = 24;

export function Textarea({ rows = 4, error, style, onFocus, onBlur, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      multiline
      textAlignVertical="top"
      placeholderTextColor={COLORS.textFaint}
      onFocus={e => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={e => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        { minHeight: rows * LINE + 2 * space(3) },
        focused && styles.inputFocused,
        error && styles.inputError,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: space(1.5) },
  fieldCompact: { gap: space(1) },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(2),
  },
  label: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.textMuted,
  },
  labelCompact: { fontSize: TEXT.xs },
  required: { color: COLORS.dangerFg },
  error: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.medium,
    color: COLORS.dangerFg,
  },
  hint: { fontSize: TEXT.xs, color: COLORS.textMuted },
  // .input-field — 16px text on phones, as on the web.
  input: {
    width: '100%',
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineInput,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    fontSize: 16,
    lineHeight: LINE,
    color: COLORS.primary,
  },
  inputFocused: { borderColor: 'rgba(0,49,88,0.5)' },
  inputError: { borderColor: COLORS.dangerFg },
});
