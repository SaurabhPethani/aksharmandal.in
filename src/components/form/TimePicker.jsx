import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../Typography';
import { Modal } from '../Overlays';
import { Button } from '../ui';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

// The web's `<input type="time">`: an hour, a minute and an AM/PM column. The
// clock shown is 12-hour; the value stays 24-hour `HH:MM`, as the API stores it.

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ['AM', 'PM'];

const ROW = 44;
const ROWS_SHOWN = 5;

const pad = n => String(n).padStart(2, '0');

/** `HH:MM` (24-hour) as what the three columns hold. */
function partsOf(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour: hour % 12 || 12, minute, period: hour < 12 ? 'AM' : 'PM' };
}

const toValue = ({ hour, minute, period }) =>
  `${pad((hour % 12) + (period === 'PM' ? 12 : 0))}:${pad(minute)}`;

/** "09:30 PM", as the web's time field reads. */
const formatTime = ({ hour, minute, period }) =>
  `${pad(hour)}:${pad(minute)} ${period}`;

const now = () => {
  const d = new Date();
  return partsOf(`${d.getHours()}:${pad(d.getMinutes())}`);
};

function Column({ title, name, values, selected, format = pad, onPick }) {
  // Opens with the chosen row in the middle. Read once, so that picking another
  // row does not make the list jump.
  const [start] = useState(() => {
    const last = Math.max(0, values.length - ROWS_SHOWN);
    return Math.min(last, Math.max(0, values.indexOf(selected) - 2)) * ROW;
  });

  return (
    <View style={styles.column}>
      <Text style={styles.heading}>{title}</Text>
      <ScrollView
        style={styles.list}
        contentOffset={{ x: 0, y: start }}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {values.map(v => {
          const on = v === selected;
          const text = format(v);
          return (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={name ? `${name} ${text}` : text}
              accessibilityState={{ selected: on }}
              onPress={() => onPick(v)}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
                on && styles.selected,
              ]}
            >
              <Text style={[styles.rowText, on && styles.selectedText]}>
                {text}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function TimePicker({
  value,
  placeholder = 'Select time',
  error,
  disabled = false,
  label,
  trigger: Trigger,
  style,
  onChange,
}) {
  const current = partsOf(value);
  const [open, setOpen] = useState(false);
  // What is being picked; only Done writes it back.
  const [draft, setDraft] = useState(now);

  const openPicker = () => {
    setDraft(current ?? now());
    setOpen(true);
  };

  const finish = next => {
    onChange?.(next);
    setOpen(false);
  };

  const pick = part => picked => setDraft(d => ({ ...d, [part]: picked }));

  return (
    <>
      <Trigger
        label={current ? formatTime(current) : value || null}
        placeholder={placeholder}
        icon="clock-outline"
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
        footer={
          <>
            {value ? (
              <Button variant="ghost" onPress={() => finish('')}>
                Clear
              </Button>
            ) : null}
            <Button variant="primary" onPress={() => finish(toValue(draft))}>
              Done
            </Button>
          </>
        }
      >
        <Text style={styles.preview}>{formatTime(draft)}</Text>
        <View style={styles.columns}>
          <Column
            title="Hour"
            name="Hour"
            values={HOURS}
            selected={draft.hour}
            onPick={pick('hour')}
          />
          <Column
            title="Minute"
            name="Minute"
            values={MINUTES}
            selected={draft.minute}
            onPick={pick('minute')}
          />
          <Column
            title="AM / PM"
            values={PERIODS}
            selected={draft.period}
            format={String}
            onPick={pick('period')}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  preview: {
    marginBottom: space(3),
    textAlign: 'center',
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  columns: { flexDirection: 'row', gap: space(2) },
  column: { flex: 1 },
  heading: {
    marginBottom: space(1.5),
    textAlign: 'center',
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  list: { height: ROW * ROWS_SHOWN },
  row: {
    height: ROW,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.lg,
  },
  rowText: { fontSize: TEXT.base, color: COLORS.primary },
  rowPressed: { backgroundColor: COLORS.primary50 },
  selected: { backgroundColor: COLORS.accent },
  selectedText: { color: COLORS.white, fontWeight: WEIGHT.bold },
});
