import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../Typography';
import { DatePicker, Input } from '../form';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';
import { todayISO } from '../../utils/validation';

/**
 * Renders an event's custom choice fields as pickable pills for one registrant,
 * and reports the chosen answers up. Controlled: `value` is the answers object
 * ({ fieldId: string | string[] }), `onChange` gets the next one.
 *
 *   single  → pick one   (a chosen pill replaces the previous)
 *   multi   → pick any    (each pill toggles independently)
 *
 * `errors` is an optional { fieldId: message } map for required fields left
 * blank. Returns null when the event has no fields, so callers can drop it in
 * unconditionally.
 */
const TODAY = todayISO();

export default function EventAnswerFields({ fields, value, onChange, errors, disabled }) {
  if (!fields?.length) return null;
  const answers = value ?? {};

  const pickSingle = (fid, opt) => {
    // Tapping the chosen pill again clears it (unless required is enforced on
    // submit) — a single field with no obligation should be un-answerable.
    onChange({ ...answers, [fid]: answers[fid] === opt ? undefined : opt });
  };
  const toggleMulti = (fid, opt) => {
    const cur = Array.isArray(answers[fid]) ? answers[fid] : [];
    const next = cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt];
    onChange({ ...answers, [fid]: next });
  };
  const setValue = (fid, next) => onChange({ ...answers, [fid]: next });

  const isChoice = t => t === 'single' || t === 'multi';

  return (
    <View style={styles.stack}>
      {fields.map(f => (
        <View key={f.id}>
          <Text style={styles.label}>
            {f.label}
            {f.required ? <Text style={styles.required}> *</Text> : null}
            {f.type === 'multi' ? (
              <Text style={styles.hint}> (pick any)</Text>
            ) : null}
          </Text>
          {isChoice(f.type) ? (
            <View style={styles.pills}>
              {f.options.map(opt => {
                const on =
                  f.type === 'multi'
                    ? Array.isArray(answers[f.id]) && answers[f.id].includes(opt)
                    : answers[f.id] === opt;
                return (
                  <Pressable
                    key={opt}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled }}
                    onPress={() =>
                      f.type === 'multi' ? toggleMulti(f.id, opt) : pickSingle(f.id, opt)
                    }
                    style={({ pressed }) => [
                      styles.pill,
                      on && styles.pillOn,
                      pressed && !disabled && styles.pillPressed,
                      disabled && styles.pillDisabled,
                    ]}
                  >
                    <Text style={[styles.pillText, on && styles.pillTextOn]}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : f.type === 'date' ? (
            <DatePicker
              value={typeof answers[f.id] === 'string' ? answers[f.id] : ''}
              onChange={next => setValue(f.id, next)}
              disabled={disabled}
              error={errors?.[f.id]}
              // A date field's bound: no_future (D.O.B.) caps at today, no_past
              // floors at today.
              max={f.date_rule === 'no_future' ? TODAY : undefined}
              min={f.date_rule === 'no_past' ? TODAY : undefined}
            />
          ) : (
            <Input
              value={typeof answers[f.id] === 'string' ? answers[f.id] : ''}
              onChangeText={next => {
                if (f.type === 'number') {
                  setValue(f.id, next.replace(/\D/g, ''));
                } else {
                  setValue(f.id, next.slice(0, 40));
                }
              }}
              inputMode={f.type === 'number' ? 'numeric' : undefined}
              maxLength={f.type === 'text' ? 40 : undefined}
              editable={!disabled}
              error={errors?.[f.id]}
            />
          )}
          {errors?.[f.id] ? <Text style={styles.error}>{errors[f.id]}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Required-answer check shared by the self and member paths. Returns a
 * { fieldId: message } map (empty when everything required is answered).
 */
export function validateAnswers(fields, answers) {
  const errs = {};
  for (const f of fields ?? []) {
    const v = (answers ?? {})[f.id];
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (f.required && empty) { errs[f.id] = 'Please choose an option.'; continue; }
    // Date bound (mirrors the backend): no_future = today or earlier (D.O.B.),
    // no_past = today or later. Only checked when a value is present.
    if (f.type === 'date' && !empty && typeof v === 'string') {
      if (f.date_rule === 'no_future' && v > TODAY) errs[f.id] = 'Date cannot be in the future.';
      if (f.date_rule === 'no_past' && v < TODAY) errs[f.id] = 'Date cannot be in the past.';
    }
    if (f.type === 'number' && !empty && Number(v) < 0) {
      errs[f.id] = 'Cannot be negative.';
    }
  }
  return errs;
}

/** Drop empty answers so we never send `{ fieldId: undefined }` or empty lists. */
export function pruneAnswers(answers) {
  const out = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) { if (v.length) out[k] = v; }
    else out[k] = v;
  }
  return out;
}

const styles = StyleSheet.create({
  stack: { gap: space(3) },
  label: {
    marginBottom: space(1),
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: COLORS.textMuted,
  },
  required: { color: COLORS.accent },
  hint: { fontWeight: WEIGHT.medium, textTransform: 'none', color: COLORS.textFaint },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  pill: {
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
  pillOn: { borderColor: COLORS.accent, backgroundColor: 'rgba(255,134,42,0.1)' },
  pillPressed: { opacity: 0.7 },
  pillDisabled: { opacity: 0.5 },
  pillText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  pillTextOn: { color: COLORS.accent },
  error: {
    marginTop: space(1),
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.medium,
    color: COLORS.dangerFg,
  },
});
