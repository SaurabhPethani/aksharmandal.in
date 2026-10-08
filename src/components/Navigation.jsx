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
});
