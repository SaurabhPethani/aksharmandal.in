import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from './Typography';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../constants/theme';

export function Breadcrumbs({ items = [], onHome }) {
  return (
    <View accessibilityRole="toolbar" style={styles.crumbs}>
      <Pressable
        onPress={onHome}
        accessibilityRole="link"
        style={styles.crumb}
      >
        {({ pressed }) => {
          const color = pressed ? COLORS.primary : COLORS.textMuted;
          return (
            <>
              <MaterialCommunityIcons
                name="home-outline"
                size={space(3.5)}
                color={color}
              />
              <Text style={[styles.crumbText, { color }]}>Dashboard</Text>
            </>
          );
        }}
      </Pressable>
      {items.map((item, i) => (
        <View key={item.label} style={styles.crumb}>
          <MaterialCommunityIcons
            name="chevron-right"
            size={space(3.5)}
            color={COLORS.textFaint}
          />
          {item.onPress && i < items.length - 1 ? (
            <Pressable onPress={item.onPress} accessibilityRole="link">
              {({ pressed }) => (
                <Text
                  style={[
                    styles.crumbText,
                    { color: pressed ? COLORS.primary : COLORS.textMuted },
                  ]}
                >
                  {item.label}
                </Text>
              )}
            </Pressable>
          ) : (
            <Text style={[styles.crumbText, styles.crumbCurrent]}>
              {item.label}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export function Tabs({ tabs = [], value, onChange, style, variant = 'underline' }) {
  const solid = variant === 'solid';
  const strip = useRef(null);
  const stripWidth = useRef(0);
  const offsetX = useRef(0);
  const layouts = useRef({});

  /**
   * Bring the active tab into view. On a phone the strip can be wider than the
   * screen, so a tab five along can be selected and still be off the edge,
   * leaving the row looking as though nothing is selected at all. Only scrolls
   * when the tab is not already fully visible, so the row does not jolt.
   */
  useEffect(() => {
    const at = layouts.current[value];
    if (!at || !strip.current) return;
    const left = offsetX.current;
    const right = left + stripWidth.current;
    if (at.x < left) {
      strip.current.scrollTo({ x: at.x, animated: true });
    } else if (at.x + at.width > right) {
      strip.current.scrollTo({
        x: at.x + at.width - stripWidth.current,
        animated: true,
      });
    }
  }, [value]);

  return (
    <View style={[!solid && styles.underlineWrap, style]}>
      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={e => {
          stripWidth.current = e.nativeEvent.layout.width;
        }}
        onScroll={e => {
          offsetX.current = e.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={32}
        style={solid && styles.solidStrip}
        contentContainerStyle={[styles.strip, solid && styles.solidContent]}
      >
        {tabs.map(t => {
          const key = t.value ?? t;
          const active = key === value;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              onLayout={e => {
                layouts.current[key] = e.nativeEvent.layout;
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={
                solid
                  ? [styles.solidTab, active && styles.solidTabActive]
                  : [styles.underlineTab, active && styles.underlineTabActive]
              }
            >
              <Text style={[styles.label, active && styles.labelActive]}>
                {t.label ?? t}
              </Text>
              {t.count != null && (
                <View style={styles.count}>
                  <Text style={styles.countText}>{t.count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const STEPPER_MIN_WIDTH = 640;

/**
 * The steps of a multi-step form: each one's label over a circle, the circles
 * joined by a line. `steps` are `{ key, label, badge }`; the circle shows the
 * badge, or the step's number without one. Wider than a phone, so it scrolls,
 * and keeps the current step in view.
 */
export function Stepper({ steps = [], value, onChange, style }) {
  const strip = useRef(null);
  const viewport = useRef(0);
  const content = useRef(0);
  const activeIndex = steps.findIndex(s => s.key === value);

  const reveal = animated => {
    if (activeIndex < 0 || !viewport.current || !content.current) return;
    const stepWidth = content.current / steps.length;
    const centred = activeIndex * stepWidth - (viewport.current - stepWidth) / 2;
    const x = Math.max(0, Math.min(content.current - viewport.current, centred));
    strip.current?.scrollTo({ x, animated });
  };

  useEffect(() => {
    reveal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  return (
    <ScrollView
      ref={strip}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={e => {
        viewport.current = e.nativeEvent.layout.width;
        reveal(false);
      }}
      onContentSizeChange={width => {
        content.current = width;
        reveal(false);
      }}
      style={[styles.stepper, style]}
      contentContainerStyle={styles.stepperContent}
    >
      {steps.map((step, i) => {
        const active = i === activeIndex;
        const done = i < activeIndex;
        return (
          <View key={step.key} style={styles.step}>
            <Pressable
              onPress={() => onChange(step.key)}
              accessibilityRole="button"
              accessibilityLabel={step.label}
              hitSlop={4}
              style={styles.stepLabelBox}
            >
              <Text
                numberOfLines={1}
                style={[styles.stepLabel, active && styles.stepLabelActive]}
              >
                {step.label}
              </Text>
            </Pressable>
            <View style={styles.stepRow}>
              {i > 0 && <View style={[styles.stepRail, styles.stepRailLeft]} />}
              {i < steps.length - 1 && (
                <View style={[styles.stepRail, styles.stepRailRight]} />
              )}
              <View style={styles.stepCircleBox}>
                {active && <View style={styles.stepHalo} />}
                <Pressable
                  onPress={() => onChange(step.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${step.label}, step ${i + 1}`}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.stepCircle,
                    done && styles.stepCircleDone,
                    active && styles.stepCircleActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepBadge,
                      done && styles.stepBadgeDone,
                      active && styles.stepBadgeActive,
                    ]}
                  >
                    {step.badge ?? i + 1}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const STEP_CIRCLE = space(10);
const STEP_HALO = 5;

const styles = StyleSheet.create({
  crumbs: {
    marginTop: space(2),
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(1.5),
  },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  crumbText: { fontSize: TEXT.xs, color: COLORS.textMuted },
  crumbCurrent: { fontWeight: WEIGHT.semibold, color: COLORS.primary },

  underlineWrap: { borderBottomWidth: 1, borderBottomColor: COLORS.line },
  strip: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  underlineTab: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
  },
  // The Birthdays screenshot from the live site draws the active underline in
  // the brand navy.
  underlineTabActive: { borderBottomColor: COLORS.primary },
  solidStrip: { flexGrow: 0, alignSelf: 'flex-start', maxWidth: '100%' },
  solidContent: {
    borderRadius: RADII['2xl'],
    backgroundColor: 'rgba(229,238,245,0.7)',
    padding: space(1),
  },
  solidTab: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADII.xl,
    paddingHorizontal: space(4),
    paddingVertical: space(2),
  },
  solidTabActive: {
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
  label: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  labelActive: { fontWeight: WEIGHT.bold, color: COLORS.primary },
  count: {
    marginLeft: space(2),
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  countText: { fontSize: 12.33, color: COLORS.primary },

  stepper: { flexGrow: 0 },
  // The halo round the current circle reaches past the row, hence the padding.
  stepperContent: {
    flexGrow: 1,
    minWidth: STEPPER_MIN_WIDTH,
    alignItems: 'flex-start',
    paddingBottom: STEP_HALO + 1,
  },
  step: { flex: 1, minWidth: 0, alignItems: 'center' },
  stepLabelBox: {
    maxWidth: '100%',
    marginBottom: space(2),
    paddingHorizontal: space(1),
  },
  stepLabel: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  stepLabelActive: { color: COLORS.primary },
  stepRow: {
    width: '100%',
    height: STEP_CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepRail: {
    position: 'absolute',
    top: STEP_CIRCLE / 2,
    height: 1,
    width: '50%',
    backgroundColor: COLORS.lineStrong,
  },
  stepRailLeft: { left: 0 },
  stepRailRight: { right: 0 },
  stepCircleBox: { width: STEP_CIRCLE, height: STEP_CIRCLE },
  stepHalo: {
    position: 'absolute',
    top: -STEP_HALO,
    right: -STEP_HALO,
    bottom: -STEP_HALO,
    left: -STEP_HALO,
    borderRadius: RADII.full,
    backgroundColor: 'rgba(255,134,42,0.2)',
  },
  stepCircle: {
    width: STEP_CIRCLE,
    height: STEP_CIRCLE,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleDone: {
    borderColor: 'rgba(0,49,88,0.3)',
    backgroundColor: COLORS.primary50,
  },
  stepCircleActive: {
    borderColor: 'transparent',
    backgroundColor: COLORS.primary,
  },
  stepBadge: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.bold,
    color: COLORS.textMuted,
  },
  stepBadgeDone: { color: COLORS.primary },
  stepBadgeActive: { color: COLORS.white },
});
