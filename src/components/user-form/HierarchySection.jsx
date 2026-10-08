import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FormField, Input, Select } from '../form';
import { toOptions } from '../../utils/options';
import { HIERARCHY_FIELDS } from '../../utils/userFormSchema';
import { space } from '../../constants/theme';

/**
 * The hierarchy levels declared by HIERARCHY_FIELDS, cascading.
 *
 * Each level is a dropdown only when full-context reports the READ grant on
 * that module — `access` is that answer, one entry per level. A level without
 * the grant shows the value from `me`, disabled, and its id still travels in
 * the payload.
 */
export default function HierarchySection({
  values,
  errors,
  access,
  me,
  queries,
  onChange,
  readOnly = false,
}) {
  return (
    <View style={styles.stack}>
      {HIERARCHY_FIELDS.map((level, i) => {
        // Locked on the edit form as well as when the level is not readable —
        // both come down to "show the name, do not offer the list".
        const granted = access?.[level.module] && !readOnly;
        const parent = i === 0 ? null : HIERARCHY_FIELDS[i - 1];
        const parentChosen = !parent || Boolean(values[parent.name]);
        const query = queries?.[level.name];

        if (!granted) {
          const label =
            me?.[level.name.replace('_id', '_name')] ?? me?.[level.name] ?? '';
          return (
            <FormField key={level.name} label={level.label} required compact>
              <Input
                value={label === '' ? '' : String(label)}
                placeholder={`Your ${level.label.toLowerCase()}`}
                readOnly
              />
            </FormField>
          );
        }

        const loading = query?.isLoading;
        return (
          <FormField
            key={level.name}
            label={level.label}
            required
            compact
            error={errors[level.name]}
          >
            <Select
              label={level.label}
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
              onChange={next => onChange(level.name, next)}
            />
          </FormField>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(4) },
});
