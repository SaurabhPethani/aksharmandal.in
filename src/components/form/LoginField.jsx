import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text, TextInput } from '../Typography';

// Login-specific field chrome, matching the reference screen: an icon, a small
// label stacked above the input, a green tick once the value is valid, and a red
// border when it is not.
//
// Sizes are the web app's Tailwind values. The web sets `html { font-size:
// 93.75% }`, so 1rem there is 15px — `rem()` converts with that same base so the
// native screen measures the same as the web one.

const rem = value => value * 15;

// Tailwind's `sm` breakpoint.
const SM_WIDTH = 640;

const COLORS = {
  primary: '#003158',
  successFg: '#15803D',
  faint: '#9BB5CB',
  placeholder: '#C5D8E8',
  border: '#E0EAF4',
  error: '#EF4444',
  errorBg: '#FEF2F2', // red-50
  errorBorder: '#FEE2E2', // red-100
  digitBorder: '#D0E2EF',
  digitBorderFocused: '#00315899',
  digitBg: '#F0F5FA',
};

/** Icons do not inherit colour in React Native; pass this to a field's icon. */
export const LOGIN_ICON_COLOR = COLORS.faint;

// Stands in for CSS `focus-within`: a LoginInput anywhere inside a LoginField
// reports its focus here.
const FieldFocusContext = createContext(null);

export function LoginField({
  label,
  icon,
  valid = false,
  error = false,
  style,
  children,
}) {
  const [focused, setFocused] = useState(false);
  const focus = useMemo(
    () => ({
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    }),
    [],
  );

  return (
    <FieldFocusContext.Provider value={focus}>
      <View
        style={[
          styles.field,
          error && styles.fieldError,
          !error && focused && styles.fieldFocused,
          style,
        ]}
      >
        <View style={styles.fieldIcon}>{icon}</View>
        <View style={styles.fieldContent}>
          <Text style={styles.fieldLabel}>{label}</Text>
          {children}
        </View>
        {valid && (
          <View style={styles.validBadge}>
            <MaterialDesignIcons
              name="check-bold"
              size={rem(0.75)}
              color="#FFFFFF"
            />
          </View>
        )}
      </View>
    </FieldFocusContext.Provider>
  );
}

/** The input that sits inside a LoginField (web: `loginInputClass`). */
export const LoginInput = forwardRef(
  (
    { style, disabled = false, editable = true, onFocus, onBlur, ...props },
    ref,
  ) => {
    const field = useContext(FieldFocusContext);
    const off = disabled || !editable;

    return (
      <TextInput
        ref={ref}
        placeholderTextColor={COLORS.placeholder}
        {...props}
        editable={!off}
        onFocus={event => {
          field?.onFocus();
          onFocus?.(event);
        }}
        onBlur={event => {
          field?.onBlur();
          onBlur?.(event);
        }}
        style={[styles.input, off && styles.inputDisabled, style]}
      />
    );
  },
);

LoginInput.displayName = 'LoginInput';

/** Backend error banner. Messages are shown verbatim — never rewritten. */
export function ErrorBanner({ message, style }) {
  if (!message) return null;
  return (
    <View style={[styles.banner, style]}>
      <MaterialDesignIcons
        name="alert-circle-outline"
        size={rem(1)}
        color={COLORS.error}
        style={styles.bannerIcon}
      />
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

/**
 * Segmented numeric input. Advances on entry, steps back on Backspace, accepts a
 * pasted code, and calls onComplete once every box is filled.
 */
export function DigitInput({
  length = 6,
  value,
  onChange,
  onComplete,
  masked = false,
  disabled = false,
  autoFocus = false,
}) {
  const refs = useRef([]);
  const [focusedIndex, setFocusedIndex] = useState(null);
  const { width } = useWindowDimensions();
  const wide = width >= SM_WIDTH;
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const commit = next => {
    const joined = next.join('');
    onChange(joined);
    if (joined.length === length && next.every(Boolean)) onComplete?.(joined);
  };

  const setDigit = (i, raw) => {
    // A paste lands in one box — spread it across the remaining boxes.
    const only = raw.replace(/\D/g, '');
    if (only.length > 1) {
      const next = [...digits];
      for (let k = 0; k < only.length && i + k < length; k += 1)
        next[i + k] = only[k];
      commit(next);
      refs.current[Math.min(i + only.length, length - 1)]?.focus();
      return;
    }
    if (!/^\d?$/.test(only)) return;
    const next = [...digits];
    next[i] = only;
    commit(next);
    if (only && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onKeyPress = (i, key) => {
    if (key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  };

  return (
    /* PHONE: the boxes divide the row between them, so the group is exactly as
       wide as the fields above it — `flex: 1` on each, full width here.
       `sm` AND UP: each box goes back to its fixed 3rem width and the group
       centres, which is what the wider panel was designed around. */
    <View style={[styles.digitRow, wide && styles.digitRowWide]}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={el => {
            refs.current[i] = el;
          }}
          secureTextEntry={masked}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
          maxLength={length}
          value={d}
          editable={!disabled}
          onChangeText={text => setDigit(i, text)}
          onKeyPress={({ nativeEvent }) => onKeyPress(i, nativeEvent.key)}
          onFocus={() => setFocusedIndex(i)}
          onBlur={() =>
            setFocusedIndex(current => (current === i ? null : current))
          }
          style={[
            styles.digit,
            wide && styles.digitWide,
            focusedIndex === i && styles.digitFocused,
            disabled && styles.digitDisabled,
          ]}
          accessibilityLabel={`Digit ${i + 1}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // flex items-center gap-3 rounded-2xl bg-white px-4 py-3
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(0.75),
    borderRadius: rem(1),
    backgroundColor: '#FFFFFF',
    paddingHorizontal: rem(1),
    paddingVertical: rem(0.75),
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  fieldError: { borderColor: COLORS.error },
  // focus-within:shadow-[0_0_0_3px_rgba(0,49,88,0.08)]
  fieldFocused: { boxShadow: '0 0 0 3px rgba(0, 49, 88, 0.08)' },
  fieldIcon: { flexShrink: 0 },
  fieldContent: { flex: 1, minWidth: 0 },
  // mb-0.5 text-[11px] font-semibold leading-none text-[#9BB5CB]
  fieldLabel: {
    marginBottom: rem(0.125),
    fontSize: 11,
    lineHeight: 11,
    fontWeight: '600',
    color: COLORS.faint,
  },
  // h-5 w-5 flex-shrink-0 rounded-full bg-success-fg
  validBadge: {
    width: rem(1.25),
    height: rem(1.25),
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: COLORS.successFg,
  },
  // w-full bg-transparent text-sm font-semibold text-primary
  input: {
    width: '100%',
    minHeight: rem(1.25),
    padding: 0,
    backgroundColor: 'transparent',
    fontSize: rem(0.875),
    fontWeight: '600',
    color: COLORS.primary,
    includeFontPadding: false,
  },
  // disabled:opacity-60
  inputDisabled: { opacity: 0.6 },
  // flex items-center gap-2.5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(0.625),
    borderRadius: rem(1),
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    backgroundColor: COLORS.errorBg,
    paddingHorizontal: rem(1),
    paddingVertical: rem(0.75),
  },
  bannerIcon: { flexShrink: 0 },
  // text-sm font-medium text-[#EF4444]
  bannerText: {
    flexShrink: 1,
    fontSize: rem(0.875),
    lineHeight: rem(1.25),
    fontWeight: '500',
    color: COLORS.error,
  },
  // flex w-full gap-2 sm:justify-center sm:gap-3
  digitRow: { flexDirection: 'row', width: '100%', gap: rem(0.5) },
  digitRowWide: { justifyContent: 'center', gap: rem(0.75) },
  // .pin-digit: h-16 rounded-control border-2 text-center text-xl font-bold
  // text-primary, plus min-w-0 flex-1 on phones
  digit: {
    flex: 1,
    minWidth: 0,
    height: rem(4),
    padding: 0,
    borderRadius: rem(0.75),
    borderWidth: 2,
    borderColor: COLORS.digitBorder,
    backgroundColor: COLORS.digitBg,
    boxShadow: 'inset 2px 2px 6px #00315814, inset -2px -2px 6px #ffffffe6',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: rem(1.25),
    fontWeight: '700',
    color: COLORS.primary,
  },
  // sm:flex-none sm:h-14 sm:w-12
  digitWide: { flex: 0, height: rem(3.5), width: rem(3) },
  // .pin-digit:focus
  digitFocused: { borderColor: COLORS.digitBorderFocused },
  // disabled:opacity-50
  digitDisabled: { opacity: 0.5 },
});
