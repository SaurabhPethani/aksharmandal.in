import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { FormField, Input, Select } from '../form';
import { PINCODE_FIELDS } from '../../utils/userFormSchema';
import { readAddress } from './shared';
import { COLORS, space } from '../../constants/theme';

/** Area is declared in the schema like the other four; found, not written out. */
const AREA_FIELD = PINCODE_FIELDS.find(f => f.name === 'area');

/** One of the five address-master mirrors: shown, never captured. */
function ReadOnlyAddressField({ field, value }) {
  return (
    <FormField label={field.label} compact>
      <Input value={value ?? ''} placeholder={field.placeholder} readOnly />
    </FormField>
  );
}

/**
 * PIN code drives Area / Suburb / City / State / Country. Those five are filled
 * from the address master and shown read-only. When a code maps to several
 * areas, Area becomes the choice and the rest follow it.
 */
export default function PincodeSection({
  values,
  errors,
  onChange,
  query,
  rows,
  areaIndex,
  onAreaChange,
}) {
  const searched = /^\d{6}$/.test(String(values.pincode ?? '').trim());
  const notFound =
    searched && !query.isLoading && !query.error && rows.length === 0;

  // A failed lookup belongs under the PIN Code box — it is that field's answer.
  // A validation message still wins: it is about what the user just did.
  const pincodeError =
    errors.pincode ??
    (query.error
      ? `Could not look up this PIN code. ${query.error.message}`
      : null) ??
    (notFound ? 'No address found for this PIN code.' : null);

  // Options by position in `rows`, so the page can look the whole address back
  // up from the pick.
  const areaOptions = rows
    .map((r, i) => ({ value: String(i), label: readAddress(r).area }))
    .filter(o => o.label);

  return (
    <View style={styles.stack}>
      <FormField
        label="PIN Code"
        required
        compact
        error={pincodeError}
        hint="6 digits — fills the fields below."
      >
        <View>
          <Input
            value={values.pincode ?? ''}
            error={pincodeError}
            placeholder="e.g. 400001"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={next => onChange('pincode', next.replace(/\D/g, ''))}
          />
          {query.isLoading ? (
            <ActivityIndicator
              size="small"
              color={COLORS.textMuted}
              style={styles.busy}
            />
          ) : null}
        </View>
      </FormField>

      {/* Area is the one address field the member chooses, so it is a dropdown
          of the areas this PIN code covers. Before a code resolves there is
          nothing to list, so it shows as the same disabled mirror. */}
      {rows.length > 0 ? (
        <FormField
          label={AREA_FIELD.label}
          required
          compact
          error={errors.area}
          hint={rows.length > 1 ? 'This PIN code covers several areas.' : null}
        >
          <Select
            label={AREA_FIELD.label}
            error={errors.area}
            value={areaIndex == null ? '' : String(areaIndex)}
            placeholder={
              areaOptions.length
                ? 'Select area'
                : 'No areas registered for this PIN code'
            }
            options={areaOptions}
            onChange={next => onAreaChange(next === '' ? null : Number(next))}
          />
        </FormField>
      ) : (
        <ReadOnlyAddressField field={AREA_FIELD} value={values.area} />
      )}

      {PINCODE_FIELDS.filter(f => f !== AREA_FIELD).map(f => (
        <ReadOnlyAddressField key={f.name} field={f} value={values[f.name]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(4) },
  busy: { position: 'absolute', right: space(3), top: 0, bottom: 0 },
});
