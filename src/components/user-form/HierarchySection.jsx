import { FormField, Input, Select } from '../form';
import { toOptions } from '../../utils/options';
import { HIERARCHY_FIELDS } from '../../utils/userFormSchema';
import { COL_CLASS, FIELD_CLASS } from './shared';

/**
 * The hierarchy levels declared by HIERARCHY_FIELDS, cascading, on one row.
 *
 * Each level is a dropdown only when full-context reports `is_granted: true` on
 * that module's READ action — `access` is that answer, one entry per level. A
 * level without the grant has no list to offer, so it shows the value from
 * `me`, disabled, and its id still travels in the payload. A level with the
 * grant waits for its parent to be chosen before it has anything to list.
 *
 * `queries` is keyed by the schema's field names (`pradesh_id`, …).
 */
export default function HierarchySection({ cols, values, errors, access, me, queries, onChange, readOnly = false }) {
  return (
    <div className={`grid gap-4 ${COL_CLASS[cols]}`}>
      {HIERARCHY_FIELDS.map((level, i) => {
        const id = `f-${level.name}`;
        // Locked on the edit form as well as when the level is not readable —
        // both come down to "show the name, do not offer the list".
        const granted = access[level.module] && !readOnly;
        const parent = i === 0 ? null : HIERARCHY_FIELDS[i - 1];
        const parentChosen = !parent || Boolean(values[parent.name]);
        const query = queries[level.name];

        if (!granted) {
          // Their own placement, shown but not editable. The id still travels in
          // the payload via `values` — see the effect in UserForm.
          const label = me?.[level.name.replace('_id', '_name')] ?? me?.[level.name] ?? '';
          return (
            <FormField key={level.name} label={level.label} htmlFor={id} required compact>
              <Input
                id={id}
                value={label === '' ? '' : String(label)}
                placeholder={`Your ${level.label.toLowerCase()}`}
                readOnly
                disabled
                className={`!bg-bg ${FIELD_CLASS}`}
              />
            </FormField>
          );
        }

        const loading = query?.isLoading;
        return (
          <FormField key={level.name} label={level.label} htmlFor={id} required compact error={errors[level.name]}>
            <Select
              id={id}
              className={FIELD_CLASS}
              value={values[level.name] ?? ''}
              error={errors[level.name]}
              disabled={!parentChosen || loading}
              placeholder={
                !parentChosen
                  ? `Select ${parent.label} first`
                  : loading
                    ? 'Loading…'
                    : `Select ${level.label.toLowerCase()}`
              }
              options={parentChosen ? toOptions(query?.data) : []}
              onChange={(e) => onChange(level.name, e.target.value)}
            />
          </FormField>
        );
      })}
    </div>
  );
}
