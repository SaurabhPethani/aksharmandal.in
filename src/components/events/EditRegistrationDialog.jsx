import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { RULES } from '../../utils/validation';
import FormDialog from '../FormDialog';
import { FormField, Input, Select } from '../form';
import { GENDER_OPTIONS } from '../../utils/userFormSchema';
import EventAnswerFields, { pruneAnswers, validateAnswers } from './EventAnswerFields';
import { space } from '../../constants/theme';

/**
 * Edit one registration — `PATCH /register-for-events/{id}`.
 *
 * Every field on the update schema is optional, so only what actually changed is
 * sent. That matters here: `mobile_number` is unique per event server-side, and
 * resubmitting an unchanged number would make the row collide with itself.
 */

/**
 * The three name parts, taken from the API's own fields — never guessed by
 * splitting a display name, which is lossy (see the web's own note on this).
 */
function nameParts(registration) {
  return {
    first_name: registration?.first_name ?? '',
    middle_name: registration?.middle_name ?? '',
    last_name: registration?.last_name ?? '',
  };
}

export default function EditRegistrationDialog({ registration, isOpen, busy, error, onClose, onSubmit }) {
  const initial = {
    ...nameParts(registration),
    mobile_number: registration?.mobile_number ?? '',
    gender: registration?.gender ?? '',
    age: registration?.age == null ? '' : String(registration.age),
  };

  const [form, setForm] = useState(initial);
  const [localError, setLocalError] = useState(null);
  /** Per-field messages, keyed by field name. Empty object means valid. */
  const [errors, setErrors] = useState({});

  // The event's poll fields ride along on the registration, so the answers can
  // be shown pre-selected and edited without a second fetch.
  const customFields = registration?.event_custom_fields ?? [];
  const initialAnswers = registration?.custom_answers ?? {};
  const [answers, setAnswers] = useState(initialAnswers);
  const [answerErrors, setAnswerErrors] = useState({});

  const set = (name, value) => {
    setForm(v => ({ ...v, [name]: value }));
    setErrors(e => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const submit = () => {
    const next = {};
    for (const f of ['first_name', 'middle_name', 'last_name']) {
      if (!String(form[f] ?? '').trim()) next[f] = 'This field is required.';
      else {
        const bad = RULES.personName(form[f]);
        if (bad) next[f] = bad;
      }
    }
    const mobile = String(form.mobile_number ?? '').trim();
    if (!mobile) next.mobile_number = 'This field is required.';
    else if (!/^\d{10}$/.test(mobile)) next.mobile_number = 'Enter exactly 10 digits.';

    // EVERY field is checked, not just the first to fail.
    const aErrs = validateAnswers(customFields, answers);
    if (Object.keys(next).length || Object.keys(aErrs).length) {
      setErrors(next);
      setAnswerErrors(aErrs);
      setLocalError(null);
      return;
    }
    setErrors({});
    setAnswerErrors({});
    setLocalError(null);

    // Only the changed fields. `mobile_number` is unique per event, so sending
    // it unchanged would have the row clash with itself.
    const payload = {};
    for (const key of ['first_name', 'middle_name', 'last_name', 'mobile_number', 'gender']) {
      const value = String(form[key] ?? '').trim();
      if (value !== String(initial[key] ?? '').trim()) payload[key] = value;
    }
    const nextAge = String(form.age ?? '').trim();
    if (nextAge !== String(initial.age ?? '').trim()) {
      payload.age = nextAge === '' ? null : Number(nextAge);
    }

    // Answers go in only when they actually changed.
    const prunedNow = pruneAnswers(answers);
    if (JSON.stringify(prunedNow) !== JSON.stringify(pruneAnswers(initialAnswers))) {
      payload.custom_answers = prunedNow;
    }

    if (Object.keys(payload).length === 0) {
      setLocalError('Nothing was changed.');
      return;
    }
    onSubmit(payload);
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Registration"
      submitLabel="Save Changes"
      onSubmit={submit}
      busy={busy}
      error={localError ?? error}
      size="lg"
    >
      <View style={styles.grid}>
        {[
          { name: 'first_name', label: 'First Name' },
          { name: 'middle_name', label: 'Middle Name' },
          { name: 'last_name', label: 'Last Name' },
        ].map(f => (
          <FormField key={f.name} label={f.label} required compact error={errors[f.name]}>
            <Input
              value={form[f.name]}
              error={errors[f.name]}
              onChangeText={next => set(f.name, next)}
            />
          </FormField>
        ))}
      </View>

      <View style={styles.grid}>
        <FormField label="Mobile" required compact error={errors.mobile_number}>
          <Input
            value={form.mobile_number}
            error={errors.mobile_number}
            onChangeText={next => set('mobile_number', next.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric"
          />
        </FormField>
        <FormField label="Gender" compact>
          <Select
            value={form.gender}
            placeholder="Select"
            options={GENDER_OPTIONS}
            onChange={next => set('gender', next)}
          />
        </FormField>
        <FormField label="Age" compact>
          <Input
            value={form.age}
            onChangeText={next => set('age', next.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
          />
        </FormField>
      </View>

      {customFields.length > 0 ? (
        <View style={styles.answers}>
          <EventAnswerFields
            fields={customFields}
            value={answers}
            onChange={setAnswers}
            errors={answerErrors}
            disabled={busy}
          />
        </View>
      ) : null}
    </FormDialog>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space(3) },
  answers: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDE9F3',
    backgroundColor: 'rgba(235,240,246,0.5)',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
});
