import { useState } from 'react';
import { RULES } from '../../utils/validation';
import FormDialog from '../FormDialog';
import { FormField, Input, Select } from '../form';
import { GENDER_OPTIONS } from '../../utils/userFormSchema';
import EventAnswerFields, { validateAnswers, pruneAnswers } from './EventAnswerFields';

/**
 * Edit one registration — `PATCH /register-for-events/{id}`.
 *
 * Every field on the update schema is optional, so only what actually changed is
 * sent. That matters here: `mobile_number` is unique per event server-side, and
 * resubmitting an unchanged number would make the row collide with itself.
 */

/**
 * The same one list as the register popup and the member form — see the note
 * there. Editing a registration must not offer an option that registering it
 * does not.
 *
 * ⚠ A registration already stored as "Other" now matches no option and shows
 * the placeholder, which — gender being required here — forces a choice before
 * the row can be saved again. That is the same trade the member form made when
 * the option was dropped.
 */
const GENDERS = GENDER_OPTIONS.map((o) => o.value);

/**
 * The three name parts, taken from the API's own fields.
 *
 * These used to be recovered by splitting `user_name` on whitespace, which was
 * always lossy and quietly wrong: `user_name` is first + last only, so the
 * middle name was NEVER in the string being split. Editing a member called
 * "Amit Kumar Patel" loaded "Amit"/""/"Patel" and saved the middle name away.
 * A two-word surname mis-split the same way. `GET /register-for-events` now
 * returns first_name / middle_name / last_name directly, so nothing is guessed.
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
    setForm((v) => ({ ...v, [name]: value }));
    // Clear this field's complaint as soon as it is being addressed. Leaving it
    // until the next submit means typing the fix while still being told it is
    // wrong, which reads as the form not noticing.
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const submit = () => {
    const next = {};
    for (const f of ['first_name', 'middle_name', 'last_name']) {
      if (!String(form[f] ?? '').trim()) next[f] = 'This field is required.';
      // Same rule as the register dialog — a name rejected there must not be
      // accepted here, or editing becomes a way around the check.
      else {
        const bad = RULES.personName(form[f]);
        if (bad) next[f] = bad;
      }
    }
    const mobile = String(form.mobile_number ?? '').trim();
    if (!mobile) next.mobile_number = 'This field is required.';
    else if (!/^\d{10}$/.test(mobile)) next.mobile_number = 'Enter exactly 10 digits.';

    // EVERY field is checked, not just the first to fail. Returning on the first
    // one made a form with three blanks take three submits to learn about all
    // three, each time reporting only the next.
    // Required poll answers, checked alongside the member fields.
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
      const next = String(form[key] ?? '').trim();
      if (next !== String(initial[key] ?? '').trim()) payload[key] = next;
    }
    const nextAge = String(form.age ?? '').trim();
    if (nextAge !== String(initial.age ?? '').trim()) {
      payload.age = nextAge === '' ? null : Number(nextAge);
    }

    // Answers go in only when they actually changed — comparing the pruned
    // forms so re-selecting the same options is not counted as a change.
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { name: 'first_name', label: 'First Name' },
          { name: 'middle_name', label: 'Middle Name' },
          { name: 'last_name', label: 'Last Name' },
        ].map((f) => (
          <FormField key={f.name} label={f.label} htmlFor={`reg-${f.name}`} required error={errors[f.name]}>
            <Input
              id={`reg-${f.name}`}
              value={form[f.name]}
              error={errors[f.name]}
              onChange={(e) => set(f.name, e.target.value)}
              autoComplete="off"
            />
          </FormField>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="Mobile" htmlFor="reg-mobile" required error={errors.mobile_number}>
          <Input
            id="reg-mobile"
            value={form.mobile_number}
            error={errors.mobile_number}
            onChange={(e) => set('mobile_number', e.target.value.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric"
            autoComplete="off"
          />
        </FormField>
        <FormField label="Gender" htmlFor="reg-gender">
          <Select
            id="reg-gender"
            value={form.gender}
            placeholder="Select"
            options={GENDERS}
            onChange={(e) => set('gender', e.target.value)}
          />
        </FormField>
        <FormField label="Age" htmlFor="reg-age">
          <Input
            id="reg-age"
            value={form.age}
            onChange={(e) => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
          />
        </FormField>
      </div>

      {customFields.length > 0 && (
        <div className="rounded-control border border-line-soft bg-bg/50 px-4 py-3">
          <EventAnswerFields
            fields={customFields}
            value={answers}
            onChange={setAnswers}
            errors={answerErrors}
            disabled={busy}
          />
        </div>
      )}
    </FormDialog>
  );
}
