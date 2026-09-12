import { useEffect, useState } from 'react';
import FormDialog from '../FormDialog';
import SchemaField from '../form/SchemaField';
import { useMandalUsers, useSabhas, useSaveAttendanceRecord, useToast } from '../../hooks';
import { buildPayload, validateFields } from '../../utils/validation';

/**
 * New / Edit Schedule and New / Edit Special Sabha, as a popup.
 *
 * These were full pages behind their own routes, which meant leaving the list to
 * fill in four fields and coming back to it. Creating or changing ONE record is
 * the app's standard popup job — the same shape as Assign Role or Quick
 * Transfer — so they use FormDialog like everything else. The multi-step member
 * form stays a page: seven tabs is not a popup.
 *
 * Which form it is comes from the definition passed in
 * (utils/attendanceFormSchema.js): fields, endpoints, wording and constants all
 * travel with it, so this component names neither of them.
 *
 * `record` decides create from edit. With one, its values prefill the fields and
 * the definition's `updateEndpoint` is PATCHed; without one, the create endpoint
 * is POSTed with the definition's constants.
 */
export default function AttendanceRecordDialog({ form, record = null, isOpen, onClose }) {
  const toast = useToast();
  const editing = Boolean(record?.id);
  const save = useSaveAttendanceRecord(form, editing ? record.id : null);

  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);

  // Fields the update endpoint does not declare are not drawn while editing —
  // shown, they would be filled in and then dropped on the way out.
  const omitted = editing ? form.editOmits ?? [] : [];
  // `specialOnly` fields appear for special sittings and nowhere else. The type
  // comes from the record; a create form is only ever used for one type, and
  // says so in its own constants or fields.
  const isSpecial = String(record?.type ?? 'special').toLowerCase() === 'special';
  const fields = form.fields.filter(
    (f) => !omitted.includes(f.name) && (!f.specialOnly || isSpecial)
  );

  /**
   * Opening prefills from the record and closing clears everything: a dialog
   * reopened on a different row must not show the last one's values, and a
   * cancelled edit must not survive into the next one.
   */
  useEffect(() => {
    if (!isOpen) {
      setValues({});
      setErrors({});
      setSubmitError(null);
      return;
    }
    // A field's `defaultValue` is the answer most sessions want, pre-selected;
    // the record's own value wins wherever it has one.
    const next = {};
    for (const field of form.fields) {
      if (field.defaultValue != null) next[field.name] = String(field.defaultValue);
      const raw = record?.[field.name];
      if (raw != null && raw !== '') next[field.name] = String(raw);
    }
    setValues(next);
  }, [isOpen, record, form]);

  /**
   * Only the Schedule form has a Sabha picker, and only while it is open.
   *
   * The HIERARCHY Sabha list, not sabha *details*: `SabhaScheduleCreate.sabha_id`
   * is the Sabha a recurrence hangs off, and a sabha_detail id would reference
   * an individual sitting. Passing no Mandal id asks for the caller's whole scope.
   */
  const needsSabhas = fields.some((f) => f.lookup === 'sabhas');
  const sabhasQ = useSabhas(null, isOpen && needsSabhas);
  // The Reference Name picker on the session form. Same directory the member
  // form's Reference Person uses.
  const needsMembers = fields.some((f) => f.lookup === 'mandalUsers');
  const membersQ = useMandalUsers(isOpen && needsMembers);
  const lookups = { sabhas: sabhasQ, mandalUsers: membersQ };

  const setField = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const busy = save.isPending;

  const submit = async () => {
    if (busy) return;
    setSubmitError(null);

    const found = validateFields(fields, values);
    if (Object.keys(found).length) { setErrors(found); return; }

    try {
      // Constants are the create's own — `type: 'special'` and the rest describe
      // what is being made, and an update that resent them would be restating
      // facts the row already carries.
      const payload = editing
        ? buildPayload(values)
        : { ...buildPayload(values), ...(form.constants ?? {}) };

      // A `<select>` hands back a string whatever the option looked like. Fields
      // the API types as a number or a boolean say so, and are converted here
      // rather than in buildPayload, which cannot know one from the other.
      for (const field of fields) {
        const raw = payload[field.name];
        if (raw == null || raw === '') continue;
        if (field.numeric) payload[field.name] = Number(raw);
        else if (field.boolean) payload[field.name] = raw === true || raw === 'true';
      }
      const res = await save.mutateAsync(payload);
      // The backend's own wording where it sends one, as everywhere else here.
      toast.success(res?.detail || (editing ? form.editSuccessMessage : form.successMessage));
      onClose();
    } catch (err) {
      // A 422 names its fields, so each message goes under the control that
      // caused it. Only what this form does not draw stays as dialog-level text.
      const placed = Object.entries(err?.fieldErrors ?? {})
        .filter(([name]) => fields.some((f) => f.name === name));
      if (placed.length) setErrors((e) => ({ ...e, ...Object.fromEntries(placed) }));

      const everythingPlaced =
        placed.length > 0 && placed.length === Object.keys(err?.fieldErrors ?? {}).length;

      setSubmitError(
        everythingPlaced
          ? null
          : err?.status === 0
            ? 'Network error — check your connection and try again.'
            : err?.detail || err?.message || 'Could not save. Please try again.'
      );
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? form.editTitle : form.title}
      description={editing ? form.editSubtitle : form.subtitle}
      submitLabel={editing ? form.editSubmitLabel : form.submitLabel}
      onSubmit={submit}
      busy={busy}
      error={submitError}
      submitVariant={form.submitVariant ?? 'primary'}
      size={form.size ?? 'lg'}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <SchemaField
            key={field.name}
            field={field}
            value={values[field.name] ?? ''}
            error={errors[field.name]}
            onChange={setField}
            lookup={field.lookup ? lookups[field.lookup] : null}
          />
        ))}
      </div>
    </FormDialog>
  );
}
