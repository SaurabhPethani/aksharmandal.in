import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons/static';
import { Modal } from '../Overlays';
import { Text } from '../Typography';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

// Mobile port of the web's `components/members/MultiSelectFilter.jsx` — a
// summary button that opens a checkbox list. Controlled via `value` (array of
// ids) + `onChange`, same contract as the web control, so callers (e.g. the
// Yuva Seva Sabha / Sabha-group filters) can reuse the same `computeSabhaIds`
// logic without re-deriving it per screen.
//
// Selections are kept in local `pending` state while the sheet is open and are
// only committed (a single `onChange`, which triggers one refetch) when the
// sheet closes — via the ✕, the backdrop, a swipe-down, or "Done" below. This
// keeps a run of taps from firing a reload per tap and re-opening the list.
//
// Props:
//   label     accessible name / modal title
//   allLabel  text shown (and the "clear" row) when nothing is selected
//   options   [{ id, name }]
//   value     id[] currently selected
//   onChange  (id[]) => void
export default function MultiSelectFilter({ label, allLabel, options = [], value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(value || []);

  const openSheet = () => {
    setPending(value || []);
    setOpen(true);
  };

  const commitAndClose = () => {
    onChange(pending);
    setOpen(false);
  };

  const pendingSet = new Set((pending || []).map(String));
  const toggle = id => {
    const key = String(id);
    const next = new Set(pendingSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPending(options.filter(option => next.has(String(option.id))).map(option => option.id));
  };

  const summary =
    !value?.length
      ? allLabel
      : value.length === 1
        ? options.find(option => String(option.id) === String(value[0]))?.name ?? '1 selected'
        : `${value.length} selected`;

  return (
    <View>
      <Pressable
        style={styles.button}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={styles.buttonText} numberOfLines={1}>
          {summary}
        </Text>
        <Icon name="chevron-down" size={16} color={COLORS.primary} />
      </Pressable>
      <Modal
        isOpen={open}
        onClose={commitAndClose}
        title={label}
        footer={
          <Pressable style={styles.doneButton} onPress={commitAndClose} accessibilityRole="button">
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        }
      >
        <Pressable style={styles.option} onPress={() => setPending([])}>
          <View style={[styles.checkbox, !pending?.length && styles.checkboxOn]}>
            {!pending?.length ? <Icon name="check" size={12} color={COLORS.surface} /> : null}
          </View>
          <Text style={[styles.optionText, !pending?.length && styles.optionTextOn]}>{allLabel}</Text>
        </Pressable>
        {options.length === 0 ? (
          <Text style={styles.empty}>Nothing to filter.</Text>
        ) : (
          options.map(option => {
            const on = pendingSet.has(String(option.id));
            return (
              <Pressable key={option.id} style={styles.option} onPress={() => toggle(option.id)}>
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on ? <Icon name="check" size={12} color={COLORS.surface} /> : null}
                </View>
                <Text style={[styles.optionText, on && styles.optionTextOn]} numberOfLines={1}>
                  {option.name}
                </Text>
              </Pressable>
            );
          })
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(1.5),
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.control,
    paddingHorizontal: space(3),
    paddingVertical: space(2.25),
    minWidth: 150,
  },
  buttonText: { color: COLORS.primary, fontSize: TEXT.xs, fontWeight: WEIGHT.bold, flexShrink: 1 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    paddingVertical: space(2.5),
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  optionText: { color: COLORS.primary, fontSize: TEXT.sm, flexShrink: 1 },
  optionTextOn: { fontWeight: WEIGHT.bold },
  empty: { color: COLORS.textFaint, fontSize: TEXT.xs, paddingVertical: space(2) },
  doneButton: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.primary,
    borderRadius: RADII.control,
    paddingHorizontal: space(5),
    paddingVertical: space(2.5),
  },
  doneButtonText: { color: COLORS.surface, fontSize: TEXT.sm, fontWeight: WEIGHT.bold },
});
