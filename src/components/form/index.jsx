import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text, TextInput } from '../Typography';
import { Modal } from '../Overlays';
import BaseDatePicker from './DatePicker';
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

export function Input({
  error,
  style,
  readOnly = false,
  disabled = false,
  onFocus,
  onBlur,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const off = readOnly || disabled;
  return (
    <TextInput
      editable={!off}
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
        focused && !off && styles.inputFocused,
        error && styles.inputError,
        off && styles.inputLocked,
        style,
      ]}
      {...rest}
    />
  );
}

/** The `.input-field` box as a button — what Select, Combobox and DatePicker sit in. */
function FieldTrigger({
  label,
  placeholder,
  icon,
  error,
  disabled,
  accessibilityLabel,
  onPress,
  style,
}) {
  const filled = label != null && label !== '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.input,
        styles.trigger,
        pressed && !disabled && styles.inputFocused,
        error && styles.inputError,
        disabled && styles.inputLocked,
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.triggerText, !filled && styles.triggerPlaceholder]}
      >
        {filled ? label : placeholder}
      </Text>
      <MaterialCommunityIcons
        name={icon}
        size={space(4.5)}
        color={COLORS.textMuted}
      />
    </Pressable>
  );
}

function OptionList({ options, value, onPick, emptyLabel }) {
  if (!options.length) {
    return <Text style={styles.optionEmpty}>{emptyLabel}</Text>;
  }
  return (
    <View>
      {options.map(option => {
        const active = String(option.value) === String(value);
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onPick(String(option.value))}
            style={({ pressed }) => [
              styles.option,
              pressed && styles.optionPressed,
              active && styles.optionActive,
            ]}
          >
            <View style={styles.optionCopy}>
              <Text
                numberOfLines={1}
                style={[styles.optionText, active && styles.optionTextActive]}
              >
                {option.label}
              </Text>
              {option.meta ? (
                <Text numberOfLines={1} style={styles.optionMeta}>
                  {option.meta}
                </Text>
              ) : null}
            </View>
            {active ? (
              <MaterialCommunityIcons
                name="check"
                size={space(4.5)}
                color={COLORS.accent}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The web's `<select>`. Same contract minus the DOM event: `onChange` is handed
 * the chosen value.
 */
export function Select({
  value,
  options = [],
  placeholder = 'Select…',
  emptyLabel = 'None available',
  error,
  disabled = false,
  label,
  onChange,
  style,
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find(o => String(o.value) === String(value));

  return (
    <>
      <FieldTrigger
        label={chosen?.label}
        placeholder={placeholder}
        icon="chevron-down"
        error={error}
        disabled={disabled}
        accessibilityLabel={label ?? placeholder}
        onPress={() => setOpen(true)}
        style={style}
      />
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={label ?? placeholder}
        size="sm"
      >
        <OptionList
          options={options}
          value={value}
          emptyLabel={emptyLabel}
          onPick={next => {
            onChange?.(next);
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}

/** Select with a search box — for lookups long enough to scroll past. */
export function Combobox({
  value,
  options = [],
  placeholder = 'Search…',
  emptyLabel = 'No matches',
  error,
  disabled = false,
  label,
  onChange,
  style,
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const chosen = options.find(o => String(o.value) === String(value));

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o =>
      `${o.label} ${o.meta ?? ''}`.toLowerCase().includes(q),
    );
  }, [options, term]);

  const close = () => {
    setOpen(false);
    setTerm('');
  };

  return (
    <>
      <FieldTrigger
        label={chosen?.label}
        placeholder={placeholder}
        icon="magnify"
        error={error}
        disabled={disabled}
        accessibilityLabel={label ?? placeholder}
        onPress={() => setOpen(true)}
        style={style}
      />
      <Modal isOpen={open} onClose={close} title={label ?? placeholder} size="sm">
        <Input
          value={term}
          onChangeText={setTerm}
          placeholder={placeholder}
          autoCorrect={false}
          style={styles.searchBox}
        />
        <OptionList
          options={filtered}
          value={value}
          emptyLabel={emptyLabel}
          onPick={next => {
            onChange?.(next);
            close();
          }}
        />
      </Modal>
    </>
  );
}

export function Checkbox({ label, checked = false, disabled = false, onChange }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange?.(!checked)}
      style={({ pressed }) => [
        styles.checkboxRow,
        pressed && !disabled && styles.checkboxPressed,
        disabled && styles.inputLocked,
      ]}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? (
          <MaterialCommunityIcons
            name="check"
            size={space(3.5)}
            color={COLORS.white}
          />
        ) : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

export function DatePicker(props) {
  return <BaseDatePicker {...props} trigger={FieldTrigger} />;
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
  inputLocked: { backgroundColor: COLORS.bg, color: COLORS.textMuted },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(2),
  },
  triggerText: { flex: 1, fontSize: 16, lineHeight: LINE, color: COLORS.primary },
  triggerPlaceholder: { color: COLORS.textFaint },
  searchBox: { marginBottom: space(3) },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    borderRadius: RADII.control,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
  },
  optionPressed: { backgroundColor: COLORS.primary50 },
  optionActive: { backgroundColor: COLORS.bg },
  optionCopy: { flex: 1 },
  optionText: { fontSize: TEXT.base, color: COLORS.primary },
  optionTextActive: { fontWeight: WEIGHT.semibold },
  optionMeta: { marginTop: 2, fontSize: TEXT.xs, color: COLORS.textMuted },
  optionEmpty: {
    paddingVertical: space(6),
    textAlign: 'center',
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    paddingVertical: space(2),
  },
  checkboxPressed: { opacity: 0.7 },
  checkbox: {
    width: space(5),
    height: space(5),
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  checkboxLabel: {
    flexShrink: 1,
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  inputError: { borderColor: COLORS.dangerFg },
});
