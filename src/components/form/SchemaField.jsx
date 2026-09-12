import { Combobox, DatePicker, FormField, Input, Select, Textarea } from './index';
import { pickRows, toOptions } from '../../utils/options';

/**
 * One field of a form *definition* — `{ name, label, type, rules, options?,
 * lookup?, optionLabelKey?, placeholder?, hint?, span? }` — rendered.
 *
 * Lives here rather than beside any one screen because the attendance forms are
 * declared as data (utils/attendanceFormSchema.js) and are drawn in two places:
 * the popup that creates a record, and anywhere a definition is rendered
 * full-page. Two copies of this renderer is two places for a field type to be
 * supported in one and not the other.
 */
export default function SchemaField({ field, value, error, onChange, lookup }) {
  const required = (field.rules ?? []).includes('required');
  const id = `f-${field.name}`;

  let control;
  if (field.type === 'select') {
    // A fixed list comes from the definition and needs no query; everything else
    // resolves from its lookup. `optionLabelKey` lets the field name its own
    // label column rather than this renderer knowing about any one entity.
    const fixed = Boolean(field.options);
    const loading = !fixed && lookup?.isLoading;
    control = (
      <Select
        id={id}
        value={value}
        error={error}
        disabled={loading || Boolean(!fixed && lookup?.error)}
        placeholder={loading ? 'Loading…' : !fixed && lookup?.error ? 'Unavailable' : field.placeholder ?? 'Select…'}
        options={field.options ?? toOptions(lookup?.data, { labelKey: field.optionLabelKey })}
        onChange={(e) => onChange(field.name, e.target.value)}
      />
    );
  } else if (field.type === 'combobox') {
    // Searchable, and the value it stores is whatever column the field names —
    // `reference_name` is a NAME on the API, so the option's value is the
    // member's name rather than their id.
    const rows = pickRows(lookup?.data);
    const options = rows
      .map((r) => ({
        value: String(r[field.optionValueKey ?? 'id'] ?? ''),
        label: String(r[field.optionLabelKey ?? 'name'] ?? ''),
        meta: field.optionMetaKey ? String(r[field.optionMetaKey] ?? '') : '',
      }))
      .filter((o) => o.value && o.label);
    control = (
      <Combobox
        id={id}
        // Inside a dialog the list grows the body; floating, it is clipped by
        // the modal's own scroll container.
        placement="inline"
        value={value}
        onChange={(v) => onChange(field.name, v)}
        options={options}
        disabled={lookup?.isLoading || Boolean(lookup?.error)}
        error={Boolean(error)}
        placeholder={
          lookup?.isLoading ? 'Loading…' : lookup?.error ? 'Unavailable' : field.placeholder ?? 'Select…'
        }
        searchPlaceholder={field.searchPlaceholder}
        emptyLabel="No one matches that search."
      />
    );
  } else if (field.type === 'textarea') {
    control = (
      <Textarea id={id} value={value} error={error} placeholder={field.placeholder} onChange={(e) => onChange(field.name, e.target.value)} />
    );
  } else if (field.type === 'date') {
    control = <DatePicker id={id} value={value} error={error} onChange={(e) => onChange(field.name, e.target.value)} />;
  } else {
    // `time` rides the same input; the platform supplies its picker.
    control = (
      <Input
        id={id}
        type={field.type}
        value={value}
        error={error}
        placeholder={field.placeholder}
        onBlur={(e) => onChange(field.name, e.target.value.trim())}
        onChange={(e) => onChange(field.name, e.target.value)}
      />
    );
  }

  return (
    <div className={field.span === 2 ? 'sm:col-span-2' : undefined}>
      <FormField label={field.label} htmlFor={id} required={required} error={error} hint={field.hint}>
        {control}
      </FormField>
    </div>
  );
}
