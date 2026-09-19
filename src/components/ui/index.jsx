import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import {
  COLORS,
  RADII,
  SHADOWS,
  TEXT,
  TNUM,
  WEIGHT,
  rem,
  space,
} from '../../constants/theme';

// Primitives map onto the live site's component classes (defined in the web's
// index.css), so shape/padding/shadow/pressed state match without re-deriving
// them in every screen. Tokens live in constants/theme.js.
//
// Mobile port: `className` becomes `style`, and an `icon` is a
// MaterialDesignIcons name rather than a lucide component.

export function Card({ style, children, ...rest }) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

// `.btn-*` — styled below as `<variant>Box / Pressed / Text / PressedText`.
// Pressed takes the web's hover colour plus its `active:scale-[.97]`.
const BUTTON_VARIANTS = ['primary', 'accent', 'outline', 'ghost', 'danger'];

export function Button({
  variant = 'outline',
  style,
  textStyle,
  busy = false,
  disabled,
  children,
  ...rest
}) {
  const kind = BUTTON_VARIANTS.includes(variant) ? variant : 'outline';
  const off = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      style={({ pressed }) => [
        styles.btn,
        styles[`${kind}Box`],
        pressed && styles[`${kind}Pressed`],
        pressed && styles.btnPressedScale,
        off && styles.btnDisabled,
        style,
      ]}
      {...rest}
    >
      {({ pressed }) => {
        const label = [
          styles.btnText,
          styles[`${kind}Text`],
          pressed && styles[`${kind}PressedText`],
          textStyle,
        ];
        const color = StyleSheet.flatten(label).color;
        return (
          <>
            {busy && <ActivityIndicator size="small" color={color} />}
            {React.Children.map(children, child => {
              if (typeof child === 'string' || typeof child === 'number') {
                return <Text style={label}>{child}</Text>;
              }
              // An icon with no colour of its own follows the label, as a
              // lucide icon follows `currentColor` on the web.
              if (
                React.isValidElement(child) &&
                child.props.name !== undefined &&
                child.props.color === undefined
              ) {
                return React.cloneElement(child, { color });
              }
              return child;
            })}
          </>
        );
      }}
    </Pressable>
  );
}

/**
 * Skeleton placeholder. Sized by the caller so the loading layout occupies the
 * same box as the loaded one — no layout shift, and never a placeholder number.
 */
export function Skeleton({ style, ...rest }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Tailwind's `animate-pulse`: 1 → .5 → 1 over two seconds.
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.skeleton, style, { opacity }]}
      {...rest}
    />
  );
}

export function Loader({ label = 'Loading', style }) {
  return (
    <View style={[styles.loader, style]}>
      <ActivityIndicator size="small" color={COLORS.textMuted} />
      <Text style={styles.loaderText}>{label}…</Text>
    </View>
  );
}

/** Full-page loader for session boot and screen loads. */
export function PageLoader({ label = 'Loading' }) {
  const { height } = useWindowDimensions();
  return (
    <View style={[styles.pageLoader, { minHeight: height * 0.6 }]}>
      <Loader label={label} />
    </View>
  );
}

/**
 * Covers content that is already on screen while it is being replaced —
 * a page change, a sort, a filter, a slow response.
 *
 * The distinction from `Loader`: that one stands in for content that does not
 * exist yet, this one sits over content that is about to be stale. The old rows
 * stay visible underneath (so the list does not collapse and jump), but the
 * overlay takes the touches, so a second sort cannot be fired at rows that
 * are already being replaced.
 *
 * The caller must be the positioned parent for this to anchor.
 */
export function BusyOverlay({ label = 'Loading' }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${label}…`}
      style={styles.busyOverlay}
    >
      <View style={styles.busyPill}>
        <ActivityIndicator size="small" color={COLORS.accent} />
        <Text style={styles.busyText}>{label}…</Text>
      </View>
    </View>
  );
}

export function EmptyState({
  title = 'Nothing to show',
  hint,
  action,
  icon = 'inbox-outline',
}) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.stateIcon, styles.emptyIcon]}>
        <MaterialCommunityIcons
          name={icon}
          size={space(6)}
          color={COLORS.primary}
        />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      {hint && <Text style={styles.stateHint}>{hint}</Text>}
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <View style={styles.errorState}>
      <View style={[styles.stateIcon, styles.errorIcon]}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={space(6)}
          color={COLORS.dangerFg}
        />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateHint}>
        {error?.message || 'Please try again.'}
      </Text>
      {onRetry && <Button onPress={onRetry}>Try again</Button>}
    </View>
  );
}

/**
 * Switch. Controlled and stateless on purpose — it renders `checked` and calls
 * `onChange`, never flipping itself. Screens that must wait for the server (the
 * member status toggle) therefore cannot drift out of sync with it.
 */
/**
 * `tone` colours the "on" state. Green is the default because the first switch
 * in the app answers "is this member attending" — a yes/no about a fact. The
 * permission switches answer "may they", which is the brand's accent, not a
 * health signal.
 */
const TOGGLE_ON = { success: COLORS.successFg, accent: COLORS.accent };
const KNOB_OFF = space(0.5);
const KNOB_ON = 18;

export function Toggle({
  checked = false,
  onChange,
  disabled = false,
  label,
  tone = 'success',
  style,
}) {
  const offset = useRef(new Animated.Value(checked ? KNOB_ON : KNOB_OFF))
    .current;

  useEffect(() => {
    Animated.timing(offset, {
      toValue: checked ? KNOB_ON : KNOB_OFF,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [checked, offset]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onChange}
      style={({ pressed }) => [
        styles.toggle,
        {
          backgroundColor: checked
            ? TOGGLE_ON[tone] ?? TOGGLE_ON.success
            : COLORS.toggleOff,
        },
        disabled && styles.btnDisabled,
        pressed && !disabled && styles.togglePressed,
        style,
      ]}
    >
      <Animated.View
        style={[styles.toggleKnob, { transform: [{ translateX: offset }] }]}
      />
    </Pressable>
  );
}

const BADGE = {
  neutral: { box: { backgroundColor: COLORS.bg }, color: COLORS.textMuted },
  ok: { box: { backgroundColor: COLORS.successBg }, color: COLORS.successFg },
  bad: { box: { backgroundColor: COLORS.dangerBg }, color: COLORS.dangerFg },
};

export function Badge({ tone = 'neutral', children }) {
  const kind = BADGE[tone] ?? BADGE.neutral;
  return (
    <View style={[styles.badge, kind.box]}>
      <Text style={[styles.badgeText, { color: kind.color }]}>{children}</Text>
    </View>
  );
}

/**
 * Dashboard metric tile. Padding is tighter than `Card` because the live layout
 * runs several across.
 */
export function StatCard({
  label,
  value,
  percentage,
  sub,
  loading,
  icon,
  iconBg = COLORS.primary50,
  iconColor = COLORS.primary,
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.statHeader}>
        {icon && (
          <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
            <MaterialCommunityIcons
              name={icon}
              size={space(4)}
              color={iconColor}
            />
          </View>
        )}
        <Text style={styles.statLabel}>{label}</Text>
      </View>

      {loading ? (
        <Skeleton style={styles.statSkeleton} />
      ) : (
        <View style={styles.statValueRow}>
          <Text style={styles.statValue}>{value}</Text>
          {percentage != null && (
            <View style={styles.statPercent}>
              <Text style={styles.statPercentText}>
                {Number(percentage).toFixed(1)}%
              </Text>
            </View>
          )}
        </View>
      )}
      {sub && !loading && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumbs }) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderRow}>
        <View style={styles.pageHeaderCopy}>
          <Text style={styles.pageTitle}>{title}</Text>
          {subtitle && <Text style={styles.pageSubtitle}>{subtitle}</Text>}
        </View>
        {/* `actions` may be a single element or an array — render when there is
            something (an empty array still counts as nothing). */}
        {(Array.isArray(actions) ? actions.length > 0 : Boolean(actions)) && (
          <View style={styles.pageActions}>{actions}</View>
        )}
      </View>
      {/* Below the title, not above it — the heading is what identifies the page,
          and the trail reads as a follow-on to it. */}
      {breadcrumbs}
    </View>
  );
}

const styles = StyleSheet.create({
  // .card — phone padding (p-4); the web steps up to p-6 only from `sm`.
  card: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    padding: space(4),
    ...SHADOWS.card,
  },
  // .panel
  panel: {
    borderRadius: RADII['2xl'],
    borderWidth: 1,
    borderColor: '#E8EEF6',
    backgroundColor: COLORS.white,
    padding: space(4),
    ...SHADOWS.panel,
  },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
  },
  btnText: { fontSize: TEXT.base },
  btnPressedScale: { transform: [{ scale: 0.97 }] },
  btnDisabled: { opacity: 0.5 },
  primaryBox: {
    borderRadius: RADII.control,
    backgroundColor: COLORS.primary,
    paddingHorizontal: space(6),
    paddingVertical: space(3),
  },
  primaryPressed: { backgroundColor: COLORS.primaryHover },
  primaryText: { color: COLORS.white, fontWeight: WEIGHT.semibold },
  accentBox: {
    borderRadius: RADII.control,
    backgroundColor: COLORS.accent,
    paddingHorizontal: space(6),
    paddingVertical: space(3),
  },
  accentPressed: { backgroundColor: COLORS.accentHover },
  accentText: { color: COLORS.white, fontWeight: WEIGHT.semibold },
  outlineBox: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(6),
    paddingVertical: space(3),
  },
  outlinePressed: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  outlineText: { color: COLORS.primary, fontWeight: WEIGHT.semibold },
  outlinePressedText: { color: COLORS.white },
  ghostBox: {
    borderRadius: RADII.lg,
    paddingHorizontal: space(4),
    paddingVertical: space(2),
  },
  ghostPressed: { backgroundColor: COLORS.primary50 },
  ghostText: { color: COLORS.primary, fontWeight: WEIGHT.medium },
  dangerBox: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.3)',
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(6),
    paddingVertical: space(3),
  },
  dangerPressed: {
    borderColor: COLORS.dangerFg,
    backgroundColor: COLORS.dangerFg,
  },
  dangerText: { color: COLORS.dangerFg, fontWeight: WEIGHT.semibold },
  dangerPressedText: { color: COLORS.white },

  skeleton: { borderRadius: RADII.lg, backgroundColor: COLORS.bg },

  loader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    padding: space(8),
  },
  loaderText: { fontSize: TEXT.sm, color: COLORS.textMuted },
  pageLoader: { alignItems: 'center', justifyContent: 'center' },

  busyOverlay: {
    // `absoluteFillObject` is gone in React Native 0.87; `absoluteFill` is the
    // object to spread.
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.card,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  busyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    borderRadius: RADII.full,
    backgroundColor: COLORS.white,
    paddingHorizontal: space(4),
    paddingVertical: space(2),
    ...SHADOWS.card,
  },
  busyText: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.medium,
    color: COLORS.primary,
  },

  emptyState: {
    alignItems: 'center',
    gap: space(3),
    paddingHorizontal: space(6),
    paddingVertical: space(14),
  },
  errorState: {
    alignItems: 'center',
    gap: space(3),
    paddingHorizontal: space(6),
    paddingVertical: space(12),
  },
  stateIcon: {
    width: space(12),
    height: space(12),
    borderRadius: RADII.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: { backgroundColor: COLORS.primary50 },
  errorIcon: { backgroundColor: COLORS.dangerBg },
  stateTitle: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
    textAlign: 'center',
  },
  stateHint: {
    maxWidth: rem(28),
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  toggle: {
    width: space(9),
    height: space(5),
    borderRadius: RADII.full,
    justifyContent: 'center',
  },
  togglePressed: { opacity: 0.9 },
  toggleKnob: {
    width: space(4),
    height: space(4),
    borderRadius: RADII.full,
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },

  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADII.full,
    paddingHorizontal: space(2.5),
    paddingVertical: space(0.5),
  },
  badgeText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },

  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    marginBottom: space(4),
  },
  statIcon: {
    width: space(8),
    height: space(8),
    borderRadius: RADII.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    flexShrink: 1,
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  statSkeleton: { height: space(8), width: space(24) },
  statValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2.5) },
  statValue: {
    ...TNUM,
    fontSize: TEXT.stat,
    lineHeight: TEXT.stat,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  statPercent: {
    marginBottom: space(0.5),
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  statPercentText: {
    ...TNUM,
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  statSub: {
    marginTop: space(2),
    fontSize: TEXT.xs,
    lineHeight: TEXT.xs * 1.375,
    color: COLORS.textMuted,
  },

  pageHeader: { marginBottom: space(6) },
  pageHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space(3),
  },
  // Shrinks, so a long subtitle wraps instead of running off the screen.
  pageHeaderCopy: { flexShrink: 1 },
  pageTitle: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  pageSubtitle: {
    marginTop: space(1),
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
  },
  pageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
  },
});
