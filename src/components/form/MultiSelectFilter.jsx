import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons/static';
import { Modal } from '../Overlays';
import { Text } from '../Typography';
import { COLORS, RADII, TEXT, WEIGHT, rem, space } from '../../constants/theme';

// Mobile port of the web's `components/members/MultiSelectFilter.jsx` — a
// summary button that opens a checkbox list. Controlled via `value` (array of
// ids) + `onChange`, same contract as the web control, so callers (e.g. the
// Yuva Seva Sabha / Sabha-group filters) can reuse the same `computeSabhaIds`
// logic without re-deriving it per screen.
//
// Two ways to open:
//
//   sheet (default)  a bottom sheet. Selections are kept in local `pending`
//                    state while it is open and only committed (a single
//                    `onChange`, which triggers one refetch) when it closes —
//                    via the ✕, the backdrop, a swipe-down, or "Done". For a
//                    screen that unmounts this control while it reloads.
//   inline           a dropdown under the button, as on the web. Each tap is
//                    applied at once, and the list stays open for the next.
//
// Props:
//   label     accessible name / sheet title
//   allLabel  text shown (and the "clear" row) when nothing is selected
//   options   [{ id, name }]
//   value     id[] currently selected
//   onChange  (id[]) => void
//   inline    open as a dropdown under the button
//   open, onOpenChange   inline only: lets the screen keep one dropdown open
//                        at a time; without them it keeps its own state
export default function MultiSelectFilter({
  label,
  allLabel,
  options = [],
  value = [],
  onChange,
  inline = false,
  open: openProp,
  onOpenChange,
}) {
  const [openState, setOpenState] = useState(false);
  const [pending, setPending] = useState(value || []);
  const open = openProp ?? openState;
  const setOpen = next => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  const press = () => {
    if (inline) {
      setOpen(!open);
      return;
    }
    setPending(value || []);
    setOpen(true);
  };

  const commitAndClose = () => {
    onChange(pending);
    setOpen(false);
  };

  // Inline: what is ticked is the applied value, and a tap applies it.
  const shown = inline ? value || [] : pending || [];
  const pick = ids => (inline ? onChange(ids) : setPending(ids));

  const shownSet = new Set(shown.map(String));
  const toggle = id => {
    const key = String(id);
    const next = new Set(shownSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    pick(options.filter(option => next.has(String(option.id))).map(option => option.id));
  };

  const summary =
    !value?.length
      ? allLabel
      : value.length === 1
        ? options.find(option => String(option.id) === String(value[0]))?.name ?? '1 selected'
        : `${value.length} selected`;

  const rows = (
    <>
      <Pressable
        style={[styles.option, inline && styles.optionInline]}
        onPress={() => pick([])}
      >
        <View style={[styles.checkbox, !shown.length && styles.checkboxOn]}>
          {!shown.length ? <Icon name="check" size={12} color={COLORS.surface} /> : null}
        </View>
        <Text style={[styles.optionText, !shown.length && styles.optionTextOn]}>{allLabel}</Text>
      </Pressable>
      {options.length === 0 ? (
        <Text style={[styles.empty, inline && styles.optionInline]}>Nothing to filter.</Text>
      ) : (
        options.map(option => {
          const on = shownSet.has(String(option.id));
          return (
            <Pressable
              key={option.id}
              style={[styles.option, inline && styles.optionInline]}
              onPress={() => toggle(option.id)}
            >
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
    </>
  );

  return (
    <View>
      <Pressable
        style={[styles.button, inline && open && styles.buttonOpen]}
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={inline ? { expanded: open } : undefined}
      >
        <Text style={styles.buttonText} numberOfLines={1}>
          {summary}
        </Text>
        <Icon
          name={inline && open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={COLORS.primary}
        />
      </Pressable>
      {inline ? (
        open && <Dropdown>{rows}</Dropdown>
      ) : (
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
          {rows}
        </Modal>
      )}
    </View>
  );
}

/**
 * The same dropdown for one choice out of a list: `options` are
 * `{ value, label }`, and picking one closes it.
 */
export function SelectFilter({
  label,
  options = [],
  value = '',
  onChange,
  placeholder = 'Select…',
  disabled = false,
  open: openProp,
  onOpenChange,
}) {
  const [openState, setOpenState] = useState(false);
  const open = !disabled && (openProp ?? openState);
  const setOpen = next => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const chosen = options.find(o => String(o.value) === String(value));

  return (
    <View>
      <Pressable
        style={[
          styles.button,
          open && styles.buttonOpen,
          disabled && styles.buttonDisabled,
        ]}
        onPress={() => setOpen(!open)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
      >
        <Text style={styles.buttonText} numberOfLines={1}>
          {chosen?.label ?? placeholder}
        </Text>
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={COLORS.primary}
        />
      </Pressable>
      {open && (
        <Dropdown>
          {options.map(option => {
            const on = String(option.value) === String(value);
            return (
              <Pressable
                key={String(option.value)}
                style={[styles.option, styles.optionInline]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  onChange(String(option.value));
                  setOpen(false);
                }}
              >
                <Text style={[styles.optionText, styles.optionGrow, on && styles.optionTextOn]} numberOfLines={1}>
                  {option.label}
                </Text>
                {on ? <Icon name="check" size={16} color={COLORS.accent} /> : null}
              </Pressable>
            );
          })}
        </Dropdown>
      )}
    </View>
  );
}

/** The list under the button. Scrolls on its own once it is taller than the cap. */
function Dropdown({ children }) {
  return (
    <View style={styles.dropdown}>
      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={styles.dropdownScroll}
      >
        {children}
      </ScrollView>
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
  buttonOpen: { borderColor: 'rgba(0,49,88,0.5)' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: COLORS.primary, fontSize: TEXT.xs, fontWeight: WEIGHT.bold, flexShrink: 1 },
  dropdown: {
    marginTop: space(1),
    overflow: 'hidden',
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface,
  },
  dropdownScroll: { maxHeight: rem(16) },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    paddingVertical: space(2.5),
  },
  optionInline: { paddingHorizontal: space(3) },
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
  optionGrow: { flex: 1 },
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
