import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Input, Select } from '../form';
import { Toggle } from '../ui';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

/**
 * The admin-facing builder for an event's custom choice fields (the poll-style
 * questions shown in the registration popup). Each field is
 *   { id?, label, type: 'single' | 'multi', required, options: string[] }
 * and the whole array is a controlled value — this component never keeps its own
 * copy, so the parent form owns the state and the id of an edited field (which
 * keeps already-collected answers linked) rides along untouched.
 *
 * Validation lives on submit in the parent, matching the backend rules (label
 * required, 2+ unique options); here the job is only to make the shape easy to
 * assemble.
 */
const BLANK_FIELD = { label: '', type: 'single', required: false, options: ['', ''] };

// The field kinds an admin can pick. Choice types collect an option; value types
// let the registrant type a value (and carry no options).
const FIELD_TYPES = [
  { value: 'single', label: 'Single choice' },
  { value: 'multi', label: 'Multiple choice' },
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
];
const DATE_RULES = [
  { value: 'any', label: 'Any date' },
  { value: 'no_future', label: 'Not in the future (e.g. D.O.B.)' },
  { value: 'no_past', label: 'Not in the past' },
];
const isChoice = t => t === 'single' || t === 'multi';

// Caps mirror the backend (schemas/event.py): keep the JSON, the form and the
// exported sheet from ballooning.
const MAX_FIELDS = 20;
const MAX_OPTIONS = 20;
const MAX_LABEL_LEN = 60;
const MAX_OPTION_LEN = 40;

export default function EventCustomFieldsBuilder({ value, onChange, disabled }) {
  const fields = value ?? [];

  const patchField = (i, patch) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const addField = () => onChange([...fields, { ...BLANK_FIELD }]);
  const removeField = i => onChange(fields.filter((_, idx) => idx !== i));

  const setOption = (fi, oi, text) =>
    patchField(fi, { options: fields[fi].options.map((o, idx) => (idx === oi ? text : o)) });
  const addOption = fi => patchField(fi, { options: [...fields[fi].options, ''] });
  const removeOption = (fi, oi) =>
    patchField(fi, { options: fields[fi].options.filter((_, idx) => idx !== oi) });

  return (
    <View>
      <Text style={styles.label}>Custom Fields</Text>
      <Text style={styles.hint}>
        Poll-style choices shown when registering, e.g. Seating · Chair / Sofa.
        Single = pick one, Multi = pick any.
      </Text>

      <View style={styles.list}>
        {fields.map((f, fi) => (
          <View key={f.id ?? fi} style={styles.card}>
            <View style={styles.row}>
              <Input
                style={styles.flex1}
                value={f.label}
                maxLength={MAX_LABEL_LEN}
                onChangeText={next => patchField(fi, { label: next })}
                placeholder="Field label, e.g. Seating"
                editable={!disabled}
              />
              <Pressable
                onPress={() => removeField(fi)}
                disabled={disabled}
                accessibilityLabel="Remove field"
                style={({ pressed }) => [
                  styles.iconBtn,
                  styles.dangerIconBtn,
                  pressed && !disabled && styles.dangerIconBtnPressed,
                  disabled && styles.disabled,
                ]}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={space(3.5)} color={COLORS.dangerFg} />
              </Pressable>
            </View>

            <View style={styles.typeRow}>
              <Select
                style={styles.typeSelect}
                value={f.type}
                options={FIELD_TYPES}
                onChange={next => patchField(fi, { type: next })}
                disabled={disabled}
                label="Field type"
              />
              {f.type === 'date' ? (
                <Select
                  style={styles.typeSelect}
                  value={f.date_rule ?? 'any'}
                  options={DATE_RULES}
                  onChange={next => patchField(fi, { date_rule: next })}
                  disabled={disabled}
                  label="Date restriction"
                />
              ) : null}
              <View style={styles.requiredRow}>
                <Text style={styles.requiredLabel}>Required</Text>
                <Toggle
                  checked={Boolean(f.required)}
                  onChange={() => patchField(fi, { required: !f.required })}
                  disabled={disabled}
                  tone="accent"
                  label="Field is required"
                />
              </View>
            </View>

            {isChoice(f.type) ? (
              <View style={styles.options}>
                {f.options.map((o, oi) => (
                  <View key={oi} style={styles.row}>
                    <Input
                      style={styles.flex1}
                      value={o}
                      maxLength={MAX_OPTION_LEN}
                      onChangeText={next => setOption(fi, oi, next)}
                      placeholder={`Option ${oi + 1}`}
                      editable={!disabled}
                    />
                    {/* Never let the count drop below two — the backend rejects a
                        one-option field, so the last two removals are blocked. */}
                    {f.options.length > 2 && (
                      <Pressable
                        onPress={() => removeOption(fi, oi)}
                        disabled={disabled}
                        accessibilityLabel="Remove option"
                        style={({ pressed }) => [
                          styles.iconBtn,
                          pressed && !disabled && styles.iconBtnPressed,
                          disabled && styles.disabled,
                        ]}
                      >
                        <MaterialCommunityIcons name="close" size={space(3.5)} color={COLORS.textMuted} />
                      </Pressable>
                    )}
                  </View>
                ))}
                <Pressable onPress={() => addOption(fi)} disabled={disabled || f.options.length >= MAX_OPTIONS}>
                  <Text style={[styles.addOption, (disabled || f.options.length >= MAX_OPTIONS) && styles.disabled]}>
                    + Add option
                  </Text>
                </Pressable>
              </View>
            ) : f.type !== 'date' ? (
              <Text style={styles.plainHint}>
                {f.type === 'number' ? 'Members will type a number (0 or more).' : 'Members will type a value.'}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <Pressable
        onPress={addField}
        disabled={disabled || fields.length >= MAX_FIELDS}
        style={({ pressed }) => [
          styles.addField,
          pressed && !(disabled || fields.length >= MAX_FIELDS) && styles.addFieldPressed,
          (disabled || fields.length >= MAX_FIELDS) && styles.disabled,
        ]}
      >
        <MaterialCommunityIcons name="plus" size={space(4)} color={COLORS.primary} />
        <Text style={styles.addFieldText}>
          {fields.length >= MAX_FIELDS ? `Maximum ${MAX_FIELDS} fields` : 'Add field'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: space(1.5), fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  hint: { marginBottom: space(2), fontSize: TEXT.xs, color: COLORS.textMuted },
  list: { gap: space(3) },
  card: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: 'rgba(235,240,246,0.5)',
    padding: space(3),
    gap: space(2),
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  flex1: { flex: 1 },
  iconBtn: { borderRadius: RADII.control, padding: space(1.5) },
  iconBtnPressed: { backgroundColor: COLORS.bg },
  dangerIconBtn: { borderWidth: 1, borderColor: 'rgba(185,28,28,0.3)' },
  dangerIconBtnPressed: { backgroundColor: COLORS.dangerBg },
  disabled: { opacity: 0.5 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2) },
  typeSelect: { minWidth: space(36), flexGrow: 1 },
  requiredRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginLeft: 'auto' },
  requiredLabel: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  options: { gap: space(1.5) },
  addOption: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  plainHint: { fontSize: TEXT.xs, color: COLORS.textMuted },
  addField: {
    marginTop: space(3),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1.5),
    borderRadius: RADII.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.lineStrong,
    paddingVertical: space(2.5),
  },
  addFieldPressed: { backgroundColor: COLORS.primary50 },
  addFieldText: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
});
