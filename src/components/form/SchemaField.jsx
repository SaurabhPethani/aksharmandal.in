import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../Typography';
import {
  Combobox,
  DatePicker,
  FormField,
  Input,
  Select,
  Textarea,
  TimePicker,
} from './index';
import VaktaPicker from './VaktaPicker';
import { toOptions } from '../../utils/options';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

const ARRAY_TYPES = new Set(['multiselect', 'checkboxes']);

/**
 * One field of a form *definition* (utils/attendanceFormSchema.js), rendered as a
 * native control. The mobile port of the web's SchemaField — same field grammar,
 * RN controls in place of DOM ones.
 *
 *   select        fixed options, or a lookup resolved with toOptions. A
 *                 lookup-backed select uses the searchable Combobox since those
 *                 lists (Sabhas, categories) run long on a phone.
 *   vakta         the { name, userId } speaker slot (VaktaPicker).
 *   multiselect   a lookup-backed chip group returning an array of values.
 *   checkboxes    a fixed chip group returning an array of values.
 *   date / time   the native pickers.
 *   text (default) a single-line Input.
 */
export default function SchemaField({ field, value, error, onChange, lookup }) {
  const required = (field.rules ?? []).some(r => r === 'required' || r === 'vaktaRequired');
  const fixed = Boolean(field.options);
  const loading = !fixed && lookup?.isLoading;
  const lookupError = Boolean(!fixed && lookup?.error);

  let control;
  if (field.type === 'select') {
    const options = field.options ?? toOptions(lookup?.data, { labelKey: field.optionLabelKey });
    const placeholder = loading
      ? 'Loading…'
      : lookupError
        ? 'Unavailable'
        : field.placeholder ?? 'Select…';
    control = fixed ? (
      <Select
        value={value}
        error={error}
        label={field.label}
        placeholder={placeholder}
        options={options}
        onChange={next => onChange(field.name, next)}
      />
    ) : (
      <Combobox
        value={value}
        error={error}
        label={field.label}
        disabled={loading || lookupError}
        placeholder={placeholder}
        options={options}
        emptyLabel="No matches"
        onChange={next => onChange(field.name, next)}
      />
    );
  } else if (field.type === 'vakta') {
    control = (
      <VaktaPicker
        value={value}
        error={error}
        placeholder={field.placeholder}
        onChange={next => onChange(field.name, next)}
      />
    );
  } else if (ARRAY_TYPES.has(field.type)) {
    const opts = field.options ?? toOptions(lookup?.data, { labelKey: field.optionLabelKey });
    const selected = Array.isArray(value) ? value.map(String) : [];
    const toggle = v => {
      const s = String(v);
      const next = selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s];
      onChange(field.name, next);
    };
    control = (
      <View style={styles.chips}>
        {loading ? (
          <Text style={styles.chipsNote}>Loading…</Text>
        ) : opts.length === 0 ? (
          <Text style={styles.chipsNote}>{lookupError ? 'Unavailable' : 'No options'}</Text>
        ) : (
          opts.map(o => {
            const on = selected.includes(String(o.value));
            return (
              <Pressable
                key={String(o.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => toggle(o.value)}
                style={({ pressed }) => [
                  styles.chip,
                  on && styles.chipOn,
                  pressed && !on && styles.chipPressed,
                ]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
              </Pressable>
            );
          })
        )}
      </View>
    );
  } else if (field.type === 'textarea') {
    control = (
      <Textarea
        value={value}
        error={error}
        placeholder={field.placeholder}
        onChangeText={next => onChange(field.name, next)}
      />
    );
  } else if (field.type === 'date') {
    control = (
      <DatePicker
        value={value}
        error={error}
        label={field.label}
        placeholder={field.placeholder ?? 'Select date'}
        onChange={next => onChange(field.name, next)}
      />
    );
  } else if (field.type === 'time') {
    control = (
      <TimePicker
        value={value}
        error={error}
        label={field.label}
        placeholder={field.placeholder ?? 'Select time'}
        onChange={next => onChange(field.name, next)}
      />
    );
  } else {
    control = (
      <Input
        value={value}
        error={error}
        placeholder={field.placeholder}
        onChangeText={next => onChange(field.name, next)}
      />
    );
  }

  return (
    <FormField label={field.label} required={required} error={error} hint={field.hint}>
      {control}
    </FormField>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chipsNote: { fontSize: TEXT.xs, color: COLORS.textMuted },
  chip: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
  chipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  chipPressed: { opacity: 0.7 },
  chipText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  chipTextOn: { color: COLORS.white },
});
