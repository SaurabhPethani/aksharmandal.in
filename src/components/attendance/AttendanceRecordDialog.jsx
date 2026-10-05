import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import FormDialog from '../FormDialog';
import SchemaField from '../form/SchemaField';
import { Checkbox } from '../form';
import { Text } from '../Typography';
import { useToast } from '../../hooks/core';
import { useCategories, useMandalUsers } from '../../hooks/useLookups';
import { useSabhas } from '../../hooks/useHierarchy';
import { useSaveAttendanceRecord } from '../../hooks/useAttendance';
import { SPECIAL_RECURRING_FORM } from '../../utils/attendanceFormSchema';
import { buildPayload, validateFields } from '../../utils/validation';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

// Field types whose value is an ARRAY, not a string.
const ARRAY_TYPES = new Set(['multiselect', 'checkboxes']);

/**
 * New / Edit Schedule, Special Sabha and Session, as a popup — the mobile port of
 * the web's AttendanceRecordDialog.
 *
 * Which form it is comes from the `form` definition passed in
 * (utils/attendanceFormSchema.js): fields, endpoints, wording and constants all
 * travel with it. `record` decides create from edit — with one, its values
 * prefill and the definition's `updateEndpoint` is PATCHed; without one, the
 * create endpoint is POSTed with the definition's constants.
 *
 * RECURRING TOGGLE. When creating a one-off Special Sabha, a checkbox offers to
 * make it a weekly RECURRING Special Sabha instead; everything keys off
 * `activeForm`, so the swap changes fields, endpoint, wording and validation.
 */
export default function AttendanceRecordDialog({ form, record = null, isOpen, onClose }) {
  const toast = useToast();
  const editing = Boolean(record?.id);

  const canRecur = !editing && form.key === 'special-sabha';
  const [recurring, setRecurring] = useState(false);
  const activeForm = canRecur && recurring ? SPECIAL_RECURRING_FORM : form;

  const save = useSaveAttendanceRecord(activeForm, editing ? record.id : null);

  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);

  const omitted = editing ? activeForm.editOmits ?? [] : [];
  const isSpecial = String(record?.type ?? 'special').toLowerCase() === 'special';
  const fields = activeForm.fields.filter(
    f => !omitted.includes(f.name) && (!f.specialOnly || isSpecial),
  );

  // Opening prefills from the record; closing clears. Re-runs on `activeForm`
  // change so flipping the recurring switch resets to the new form's fields.
  useEffect(() => {
    if (!isOpen) {
      setValues({});
      setErrors({});
      setSubmitError(null);
      setRecurring(false);
      return;
    }
    const next = {};
    for (const field of activeForm.fields) {
      if (ARRAY_TYPES.has(field.type)) {
        const raw = record?.[field.name];
        next[field.name] = Array.isArray(raw) ? raw.map(String) : [];
        continue;
      }
      if (field.type === 'vakta') {
        const nm = record?.[field.name];
        next[field.name] = {
          name: nm != null ? String(nm) : '',
          userId: record?.[field.idField] ?? null,
        };
        continue;
      }
      if (field.defaultValue != null) next[field.name] = String(field.defaultValue);
      const raw = record?.[field.name];
      if (raw != null && raw !== '') next[field.name] = String(raw);
    }
    setValues(next);
    setErrors({});
    setSubmitError(null);
    // `recurring` is intentionally NOT a dep: it drives `activeForm`, which is.
  }, [isOpen, record, activeForm]);

  // Only fetch a lookup when a field on the active form actually uses it, and
  // only while the dialog is open.
  const needsSabhas = fields.some(f => f.lookup === 'sabhas');
  const sabhasQ = useSabhas(null, isOpen && needsSabhas);
  const needsMembers = fields.some(f => f.lookup === 'mandalUsers');
  const membersQ = useMandalUsers(isOpen && needsMembers);
  const needsCategories = fields.some(f => f.lookup === 'userCategories');
  const categoriesQ = useCategories(isOpen && needsCategories);
  const lookups = { sabhas: sabhasQ, mandalUsers: membersQ, userCategories: categoriesQ };

  const setField = (name, value) => {
    setValues(v => ({ ...v, [name]: value }));
    setErrors(e => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const busy = save.isPending;

  const submit = async () => {
    if (busy) return;
    setSubmitError(null);

    const found = validateFields(fields, values);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }

    try {
      const payload = editing
        ? buildPayload(values)
        : { ...buildPayload(values), ...(activeForm.constants ?? {}) };

      // A select hands back a string; numeric/boolean fields are converted here,
      // since buildPayload cannot tell one from the other.
      for (const field of fields) {
        const raw = payload[field.name];
        if (raw == null || raw === '') continue;
        if (field.numeric) payload[field.name] = Number(raw);
        else if (field.boolean) payload[field.name] = raw === true || raw === 'true';
      }

      // Array fields are set from state directly (buildPayload's array branch
      // expects objects per item). `numericArray` turns id strings into ints.
      for (const field of fields) {
        if (!ARRAY_TYPES.has(field.type)) continue;
        const arr = Array.isArray(values[field.name]) ? values[field.name] : [];
        payload[field.name] = field.numericArray ? arr.map(Number) : arr;
      }

      // Vakta slots hold { name, userId } — split into name + `*_user_id`. An
      // explicit null lets an edit clear a link (in-house → external).
      for (const field of fields) {
        if (field.type !== 'vakta') continue;
        const raw = values[field.name];
        const obj = raw && typeof raw === 'object' ? raw : { name: raw ?? '', userId: null };
        const nm = (obj.name ?? '').trim();
        payload[field.name] = nm || null;
        payload[field.idField] = nm && obj.userId != null ? Number(obj.userId) : null;
      }

      const res = await save.mutateAsync(payload);
      toast.success(
        res?.detail || (editing ? activeForm.editSuccessMessage : activeForm.successMessage),
      );
      onClose();
    } catch (err) {
      const placed = Object.entries(err?.fieldErrors ?? {}).filter(([name]) =>
        fields.some(f => f.name === name),
      );
      if (placed.length) setErrors(e => ({ ...e, ...Object.fromEntries(placed) }));

      const everythingPlaced =
        placed.length > 0 && placed.length === Object.keys(err?.fieldErrors ?? {}).length;

      setSubmitError(
        everythingPlaced
          ? null
          : err?.status === 0
            ? 'Network error — check your connection and try again.'
            : err?.detail || err?.message || 'Could not save. Please try again.',
      );
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? activeForm.editTitle : activeForm.title}
      description={editing ? activeForm.editSubtitle : activeForm.subtitle}
      submitLabel={editing ? activeForm.editSubmitLabel : activeForm.submitLabel}
      onSubmit={submit}
      busy={busy}
      error={submitError}
      submitVariant={activeForm.submitVariant ?? 'primary'}
      size={activeForm.size ?? 'lg'}
    >
      {canRecur ? (
        <View style={styles.recurBox}>
          <Checkbox
            label=""
            checked={recurring}
            onChange={setRecurring}
          />
          <View style={styles.recurCopy}>
            <Text style={styles.recurTitle}>Make this a weekly recurring Sabha</Text>
            <Text style={styles.recurHint}>
              Repeats every week for a Category + tag audience in your Mandal, instead of a
              one-off date.
            </Text>
          </View>
        </View>
      ) : null}

      {fields.map(field => (
        <SchemaField
          key={field.name}
          field={field}
          value={
            values[field.name] ??
            (ARRAY_TYPES.has(field.type)
              ? []
              : field.type === 'vakta'
                ? { name: '', userId: null }
                : '')
          }
          error={errors[field.name]}
          onChange={setField}
          lookup={field.lookup ? lookups[field.lookup] : null}
        />
      ))}
    </FormDialog>
  );
}

const styles = StyleSheet.create({
  recurBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(2),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: 'rgba(229,238,245,0.6)',
    padding: space(3),
  },
  recurCopy: { flex: 1 },
  recurTitle: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  recurHint: { marginTop: 2, fontSize: TEXT.xs, color: COLORS.textMuted },
});
