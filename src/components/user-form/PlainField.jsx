import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  Checkbox,
  Combobox,
  DatePicker,
  FormField,
  Input,
  Select,
  Textarea,
} from '../form';
import { toOptions } from '../../utils/options';
import { todayISO } from '../../utils/validation';
import { COLORS, space } from '../../constants/theme';
import { NeedsApprovalBadge } from './ApprovalNotice';

/** `'today'` is resolved here so a long-lived session cannot go stale. */
const dateBound = bound => {
  if (!bound) return undefined;
  return bound === 'today' ? todayISO() : bound;
};

/**
 * One field of the user form, rendered from its schema entry. Everything about
 * how a field behaves comes from utils/userFormSchema.js — nothing about any
 * specific field is known here.
 */
export default function PlainField({
  field,
  value,
  error,
  onChange,
  lookup,
  busy = false,
  readOnly = false,
  readOnlyText = null,
  needsApproval = false,
}) {
  const required = (field.rules ?? []).includes('required');
  const badge = needsApproval ? <NeedsApprovalBadge /> : null;

  const handle = raw =>
    onChange(field.name, field.digitsOnly ? String(raw).replace(/\D/g, '') : raw);

  if (field.type === 'checkbox') {
    // Locked: the answer is stated rather than offered.
    if (readOnly) {
      return (
        <FormField label={field.label} compact>
          <Input value={value ? 'Yes' : 'No'} readOnly />
        </FormField>
      );
    }
    return (
      <Checkbox
        label={field.label}
        checked={Boolean(value)}
        onChange={v => onChange(field.name, v)}
      />
    );
  }

  if (readOnly) {
    return (
      <FormField label={field.label} badge={badge} compact>
        {/* `readOnlyText` is the display name for a field whose value is an id. */}
        <Input value={String(readOnlyText ?? value ?? '')} readOnly />
      </FormField>
    );
  }

  let control;
  if (field.type === 'select') {
    // Fixed lists come from the schema; everything else from its lookup.
    const listed = field.options ?? toOptions(lookup?.data);
    // A current value the lookup does not offer still renders as itself — a
    // member's role need not be among the roles this caller may grant.
    const missing =
      value !== '' &&
      value != null &&
      readOnlyText &&
      !listed.some(o => String(o.value) === String(value));
    const options = missing
      ? [{ value, label: readOnlyText }, ...listed]
      : listed;
    const loading = !field.options && lookup?.isLoading;
    const failed = Boolean(!field.options && lookup?.error);
    const empty =
      !field.options &&
      !loading &&
      !failed &&
      lookup?.isFetched &&
      listed.length === 0;

    const placeholder = loading
      ? 'Loading…'
      : failed
        ? 'Unavailable'
        : empty
          ? field.emptyLabel ?? 'None available'
          : field.placeholder ?? 'Select…';

    const Control = field.searchable ? Combobox : Select;
    control = (
      <Control
        label={field.label}
        value={value}
        error={error}
        disabled={loading || failed || empty}
        placeholder={placeholder}
        emptyLabel={field.emptyLabel ?? 'No matches'}
        options={options}
        onChange={handle}
      />
    );
  } else if (field.type === 'textarea') {
    control = (
      <Textarea
        rows={3}
        value={value}
        error={error}
        placeholder={field.placeholder}
        onChangeText={handle}
      />
    );
  } else if (field.type === 'date') {
    control = (
      <DatePicker
        label={field.label}
        value={value}
        error={error}
        placeholder={field.placeholder ?? 'Select date'}
        min={dateBound(field.min)}
        max={dateBound(field.max)}
        onChange={handle}
      />
    );
  } else {
    control = (
      <View>
        <Input
          value={value == null ? '' : String(value)}
          error={error}
          placeholder={field.placeholder}
          keyboardType={keyboardFor(field)}
          autoCapitalize={field.type === 'email' ? 'none' : 'sentences'}
          maxLength={field.maxLength}
          // Trimmed on blur as well as at submit, so what is validated is what
          // is shown rather than a value with invisible padding.
          onBlur={() => onChange(field.name, String(value ?? '').trim())}
          onChangeText={handle}
        />
        {busy ? (
          <ActivityIndicator
            size="small"
            color={COLORS.textMuted}
            style={styles.busy}
          />
        ) : null}
      </View>
    );
  }

  return (
    <FormField
      label={field.label}
      required={required}
      error={error}
      hint={field.hint}
      badge={badge}
      compact
    >
      {control}
    </FormField>
  );
}

function keyboardFor(field) {
  if (field.inputMode === 'numeric' || field.digitsOnly) return 'number-pad';
  if (field.type === 'email') return 'email-address';
  if (field.type === 'tel') return 'phone-pad';
  return 'default';
}

const styles = StyleSheet.create({
  busy: {
    position: 'absolute',
    right: space(3),
    top: 0,
    bottom: 0,
  },
});
