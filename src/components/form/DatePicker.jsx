import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Modal } from '../Overlays';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

// The web's `<input type="date">`. The value stays `yyyy-MM-dd` on both sides,
// so `min` / `max` and the schema's rules are unchanged.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const pad = n => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Read the parts out directly — `new Date(iso)` would parse as UTC. */
function partsOf(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

const outOfRange = (iso, min, max) => (min && iso < min) || (max && iso > max);

export function formatDisplay(iso) {
  const parts = partsOf(iso);
  if (!parts) return iso;
  return `${pad(parts.day)} ${MONTHS[parts.month].slice(0, 3)} ${parts.year}`;
}

export default function DatePicker({
  value,
  min,
  max,
  placeholder = 'Select date',
  error,
  disabled = false,
  label,
  trigger: Trigger,
  style,
  onChange,
}) {
  const today = useMemo(() => new Date(), []);
  const [open, setOpen] = useState(false);
  const [pickingYear, setPickingYear] = useState(false);
  const [view, setView] = useState(() => {
    const current = partsOf(value);
    return {
      year: current?.year ?? today.getFullYear(),
      month: current?.month ?? today.getMonth(),
    };
  });

  const openPicker = () => {
    const current = partsOf(value);
    setView({
      year: current?.year ?? today.getFullYear(),
      month: current?.month ?? today.getMonth(),
    });
    setPickingYear(false);
    setOpen(true);
  };

  const weeks = useMemo(() => {
    const firstWeekday = new Date(view.year, view.month, 1).getDay();
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const cells = [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      while (week.length < 7) week.push(null);
      rows.push(week);
    }
    return rows;
  }, [view]);

  // Wide enough to reach a date of birth without endless tapping.
  const years = useMemo(() => {
    const last = partsOf(max)?.year ?? today.getFullYear() + 5;
    const first = partsOf(min)?.year ?? last - 100;
    return Array.from({ length: last - first + 1 }, (_, i) => last - i);
  }, [min, max, today]);

  const shiftMonth = step => {
    const next = new Date(view.year, view.month + step, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <>
      <Trigger
        label={value ? formatDisplay(value) : null}
        placeholder={placeholder}
        icon="calendar-blank-outline"
        error={error}
        disabled={disabled}
        accessibilityLabel={label ?? placeholder}
        onPress={openPicker}
        style={style}
      />

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={label ?? placeholder}
        size="sm"
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => shiftMonth(-1)}
            disabled={pickingYear}
            style={styles.nav}
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={space(5)}
              color={pickingYear ? COLORS.textFaint : COLORS.primary}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setPickingYear(v => !v)}
            style={styles.titleBtn}
          >
            <Text style={styles.title}>
              {MONTHS[view.month]} {view.year}
            </Text>
            <MaterialCommunityIcons
              name={pickingYear ? 'menu-up' : 'menu-down'}
              size={space(4.5)}
              color={COLORS.primary}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => shiftMonth(1)}
            disabled={pickingYear}
            style={styles.nav}
          >
            <MaterialCommunityIcons
              name="chevron-right"
              size={space(5)}
              color={pickingYear ? COLORS.textFaint : COLORS.primary}
            />
          </Pressable>
        </View>

        {pickingYear ? (
          <ScrollView style={styles.yearList} nestedScrollEnabled>
            <View style={styles.yearGrid}>
              {years.map(year => (
                <Pressable
                  key={year}
                  accessibilityRole="button"
                  onPress={() => {
                    setView(v => ({ ...v, year }));
                    setPickingYear(false);
                  }}
                  style={({ pressed }) => [
                    styles.yearCell,
                    pressed && styles.cellPressed,
                    year === view.year && styles.selected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      year === view.year && styles.selectedText,
                    ]}
                  >
                    {year}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <>
            <View style={styles.week}>
              {WEEKDAYS.map((d, i) => (
                <Text key={`${d}-${i}`} style={styles.weekday}>
                  {d}
                </Text>
              ))}
            </View>

            {weeks.map((week, wi) => (
              <View key={wi} style={styles.week}>
                {week.map((day, di) => {
                  if (day == null) {
                    return <View key={`pad-${di}`} style={styles.day} />;
                  }
                  const iso = toISO(view.year, view.month, day);
                  const blocked = outOfRange(iso, min, max);
                  const isSelected = iso === value;
                  return (
                    <Pressable
                      key={iso}
                      accessibilityRole="button"
                      accessibilityLabel={iso}
                      accessibilityState={{
                        selected: isSelected,
                        disabled: Boolean(blocked),
                      }}
                      disabled={Boolean(blocked)}
                      onPress={() => {
                        onChange?.(iso);
                        setOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.day,
                        pressed && !blocked && styles.cellPressed,
                        isSelected && styles.selected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          blocked && styles.blocked,
                          isSelected && styles.selectedText,
                        ]}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space(3),
  },
  nav: {
    width: space(9),
    height: space(9),
    borderRadius: RADII.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  title: {
    fontSize: TEXT.base,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  week: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: space(1.5),
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  day: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.full,
  },
  dayText: { fontSize: TEXT.sm, color: COLORS.primary },
  blocked: { color: COLORS.textFaint },
  cellPressed: { backgroundColor: COLORS.primary50 },
  selected: { backgroundColor: COLORS.accent },
  selectedText: { color: COLORS.white, fontWeight: WEIGHT.bold },
  yearList: { maxHeight: 260 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  yearCell: {
    width: '25%',
    paddingVertical: space(2.5),
    alignItems: 'center',
    borderRadius: RADII.lg,
  },
});
