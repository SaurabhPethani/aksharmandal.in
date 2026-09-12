import { Loader2 } from 'lucide-react';
import { FormField, Input, Select } from '../form';
import { PINCODE_FIELDS } from '../../utils/userFormSchema';
import { FIELD_CLASS, readAddress } from './shared';

/** Area is declared in the schema like the other four; found, not written out. */
const AREA_FIELD = PINCODE_FIELDS.find((f) => f.name === 'area');

/** One of the five address-master mirrors: shown, never captured. */
function ReadOnlyAddressField({ field, value }) {
  return (
    <FormField label={field.label} htmlFor={`f-${field.name}`} compact>
      <Input
        id={`f-${field.name}`}
        value={value ?? ''}
        placeholder={field.placeholder}
        readOnly
        disabled
        className={`!bg-bg ${FIELD_CLASS}`}
      />
    </FormField>
  );
}

/**
 * PIN code drives Area / Suburb / City / State / Country. Those five are filled
 * from the address master and shown read-only — they mirror backend data rather
 * than being captured. When a code maps to several areas, Area becomes the
 * choice and the rest follow it.
 *
 * All five are required by UserCreate, so validateTab refuses to move on until
 * the lookup has actually resolved — see the pincode branch there.
 */
export default function PincodeSection({ values, errors, onChange, query, rows, areaIndex, onAreaChange }) {
  const searched = /^\d{6}$/.test(String(values.pincode ?? '').trim());
  const notFound = searched && !query.isLoading && !query.error && rows.length === 0;

  /**
   * A failed lookup belongs under the PIN Code box — it is that field's answer.
   * These used to print as paragraphs across the bottom of the section, which
   * read as page-level problems and left the control they were about unmarked.
   *
   * A validation message still wins: it is about what the user just did, while
   * this is about what the last lookup found.
   */
  const pincodeError =
    errors.pincode ??
    (query.error ? `Could not look up this PIN code. ${query.error.message}` : null) ??
    (notFound ? 'No address found for this PIN code.' : null);

  // The dropdown's options, by position in `rows` so the page can look the whole
  // address back up from the pick.
  const areaOptions = rows
    .map((r, i) => ({ value: String(i), label: readAddress(r).area }))
    .filter((o) => o.label);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="PIN Code" htmlFor="f-pincode" required compact error={pincodeError} hint="6 digits — fills the fields below.">
        <div className="relative">
          <Input
            id="f-pincode"
            className={FIELD_CLASS}
            value={values.pincode ?? ''}
            error={pincodeError}
            placeholder="e.g. 400001"
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => onChange('pincode', e.target.value.replace(/\D/g, ''))}
          />
          {query.isLoading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted" />
          )}
        </div>
      </FormField>

      {/* Area is the one address field the member chooses, so it is a dropdown
          of the areas this PIN code covers — never a typed or read-only box.
          Before a code resolves there is nothing to list, so it shows as the
          same disabled mirror as the other four. */}
      {rows.length > 0 ? (
        <FormField
          label={AREA_FIELD.label}
          htmlFor="f-area"
          required
          compact
          error={errors.area}
          hint={rows.length > 1 ? 'This PIN code covers several areas.' : null}
        >
          <Select
            id="f-area"
            className={FIELD_CLASS}
            error={errors.area}
            value={areaIndex == null ? '' : String(areaIndex)}
            // A row the master has no area name for is not offerable. The
            // placeholder then says so rather than listing a blank option — the
            // code resolved, its areas are simply missing upstream.
            placeholder={areaOptions.length ? 'Select area' : 'No areas registered for this PIN code'}
            options={areaOptions}
            onChange={(e) => onAreaChange(e.target.value === '' ? null : Number(e.target.value))}
          />
        </FormField>
      ) : (
        <ReadOnlyAddressField field={AREA_FIELD} value={values.area} />
      )}

      {PINCODE_FIELDS.filter((f) => f !== AREA_FIELD).map((f) => (
        <ReadOnlyAddressField key={f.name} field={f} value={values[f.name]} />
      ))}

    </div>
  );
}
