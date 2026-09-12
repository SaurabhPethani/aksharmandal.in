import { Loader2 } from 'lucide-react';
import { Checkbox, Combobox, DatePicker, FormField, Input, Select, Textarea } from '../form';
import { toOptions } from '../../utils/options';
import { todayISO } from '../../utils/validation';
import { FIELD_CLASS } from './shared';
import { NeedsApprovalBadge } from './ApprovalNotice';

/**
 * A schema `min`/`max` for a date field -> the attribute the input wants.
 *
 * `'today'` is resolved here rather than written into the schema because the
 * schema is a module-level constant: a date baked in at import time would go
 * stale in a tab left open overnight.
 */
const dateBound = (bound) => {
  if (!bound) return undefined;
  return bound === 'today' ? todayISO() : bound;
};

/**
 * One field of the user form, rendered from its schema entry.
 *
 * Everything about how a field behaves — its control, whether it is required,
 * whether it strips non-digits, how long it may be — comes from the definition
 * in utils/userFormSchema.js. Nothing about any specific field is known here.
 */
export default function PlainField({
  field, value, error, onChange, lookup, busy = false, readOnly = false, readOnlyText = null,
  needsApproval = false,
}) {
  const required = (field.rules ?? []).includes('required');
  const id = `f-${field.name}`;
  // Only ever set on a self-edit, and only for the fields the endpoint routes
  // through an approval request — see components/user-form/ApprovalNotice.jsx.
  const badge = needsApproval ? <NeedsApprovalBadge /> : null;

  const handle = (raw) =>
    onChange(field.name, field.digitsOnly ? String(raw).replace(/\D/g, '') : raw);

  if (field.type === 'checkbox') {
    // Locked: the answer is stated rather than offered. A disabled checkbox
    // still looks like a control that might work and invites clicks that do
    // nothing, so this reads as the other locked fields do — a label with its
    // value beside it.
    if (readOnly) {
      return (
        <FormField label={field.label} htmlFor={id} compact>
          <Input
            id={id}
            value={value ? 'Yes' : 'No'}
            readOnly
            disabled
            className={`!bg-bg ${FIELD_CLASS}`}
          />
        </FormField>
      );
    }

    // Otherwise the label belongs beside the box, so it skips FormField.
    return (
      <div className="flex items-end">
        <Checkbox id={id} label={field.label} checked={Boolean(value)} onChange={(v) => onChange(field.name, v)} />
      </div>
    );
  }

  // Set at creation and changed elsewhere (Quick Transfer, Assign Role) or not
  // at all — shown filled in rather than offered as an editable box.
  if (readOnly) {
    return (
      <div className={field.span === 2 ? 'sm:col-span-2' : undefined}>
        <FormField label={field.label} htmlFor={id} badge={badge} compact>
          {/* `readOnlyText` is the display name for a field whose value is an id —
              showing "12" where the member's role belongs would be useless. */}
          <Input
            id={id}
            value={readOnlyText ?? value ?? ''}
            readOnly
            disabled
            className={`!bg-bg ${FIELD_CLASS}`}
          />
        </FormField>
      </div>
    );
  }

  let control;
  if (field.type === 'select') {
    // Fixed lists come from the schema; everything else from its lookup.
    const listed = field.options ?? toOptions(lookup?.data);
    /**
     * A current value the lookup does not offer still renders as itself.
     *
     * A member's role is the case this exists for: assignable-roles returns only
     * the roles this caller may GRANT, which need not include the one the member
     * already holds. Without this the box would fall back to its placeholder and
     * read as "no role", on a record that has one.
     *
     * `readOnlyText` is already the display name behind this id, so nothing new
     * has to be passed in.
     */
    const missing =
      value !== '' && value != null && readOnlyText
      && !listed.some((o) => String(o.value) === String(value));
    const options = missing ? [{ value, label: readOnlyText }, ...listed] : listed;
    const loading = !field.options && lookup?.isLoading;
    const failed = Boolean(!field.options && lookup?.error);
    // A lookup that answered with nothing is not the same as one still loading.
    // Saying so beats an open dropdown with no rows in it, which reads as broken.
    const empty = !field.options && !loading && !failed && lookup?.isFetched && listed.length === 0;

    const selectPlaceholder =
      loading ? 'Loading…'
        : failed ? 'Unavailable'
          : empty ? (field.emptyLabel ?? 'None available')
            : field.placeholder ?? 'Select…';

    // `searchable` swaps the plain <Select> for a type-to-filter <Combobox> —
    // the same control the Change-Follow-up dialog uses. Right for lookups whose
    // list is long (e.g. every member in the Mandal for Reference Person).
    control = field.searchable ? (
      <Combobox
        id={id}
        value={value}
        error={error}
        disabled={loading || failed || empty}
        placeholder={selectPlaceholder}
        emptyLabel={field.emptyLabel ?? 'No matches'}
        options={options}
        onChange={handle}
      />
    ) : (
      <Select
        id={id}
        className={FIELD_CLASS}
        value={value}
        error={error}
        disabled={loading || failed || empty}
        placeholder={selectPlaceholder}
        options={options}
        onChange={(e) => handle(e.target.value)}
      />
    );
  } else if (field.type === 'textarea') {
    control = <Textarea id={id} className={FIELD_CLASS} rows={3} value={value} error={error} placeholder={field.placeholder} onChange={(e) => handle(e.target.value)} />;
  } else if (field.type === 'date') {
    control = (
      <DatePicker
        id={id}
        className={FIELD_CLASS}
        value={value}
        error={error}
        min={dateBound(field.min)}
        max={dateBound(field.max)}
        onChange={(e) => handle(e.target.value)}
      />
    );
  } else {
    control = (
      <div className="relative">
        <Input
          id={id}
          className={FIELD_CLASS}
          type={field.type === 'tel' ? 'text' : field.type}
          value={value}
          error={error}
          placeholder={field.placeholder}
          inputMode={field.inputMode}
          maxLength={field.maxLength}
          // Trimmed on blur as well as at submit, so what is validated is what is
          // shown rather than a value with invisible padding.
          onBlur={(e) => onChange(field.name, e.target.value.trim())}
          onChange={(e) => handle(e.target.value)}
        />
        {busy && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted" />
        )}
      </div>
    );
  }

  return (
    <div className={field.span === 2 ? 'sm:col-span-2' : undefined}>
      <FormField
        label={field.label}
        htmlFor={id}
        required={required}
        error={error}
        hint={field.hint}
        badge={badge}
        compact
      >
        {control}
      </FormField>
    </div>
  );
}
