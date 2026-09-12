import { useState } from 'react';
import FormDialog from '../FormDialog';

/**
 * New Address — one pincode plus, optionally, its first area.
 *
 * The other five Master Data tabs are a single `name`, so they share one plain
 * dialog. An address is a pincode carrying geography, which is why this form
 * exists separately rather than being squeezed into that one.
 *
 * Country defaults to India because every row in this master is Indian; it stays
 * editable rather than hidden, so the one row that is not can still be entered.
 */

const BLANK = { pincode: '', area: '', suburb: '', city: '', state: '', country: 'India' };

/** Required by PincodeCreate — each is `min_length=1` server-side. */
const REQUIRED = ['pincode', 'suburb', 'city', 'state', 'country'];

const FIELDS = [
  { name: 'pincode', label: 'Pincode', placeholder: 'e.g. 400068', inputMode: 'numeric' },
  { name: 'area', label: 'Area', placeholder: 'e.g. Rawalpada', optional: true },
  { name: 'suburb', label: 'Suburb', placeholder: 'e.g. Dahisar East' },
  { name: 'city', label: 'City', placeholder: 'e.g. Mumbai' },
  { name: 'state', label: 'State', placeholder: 'e.g. Maharashtra' },
  { name: 'country', label: 'Country', placeholder: 'e.g. India' },
];

/**
 * `row` present -> edit that address, else create a new one.
 *
 * The parent gives this component a `key` tied to the row, so it remounts with
 * the right starting values instead of syncing them in an effect — an effect
 * would also stomp on what the user typed whenever the list refetched underneath.
 */
export default function AddressFormDialog({ isOpen, onClose, onSubmit, busy, error, row = null }) {
  const editing = Boolean(row);
  const initial = editing
    ? {
        pincode: row.pincode ?? '',
        area: row.area ?? '',
        suburb: row.suburb ?? '',
        city: row.city ?? '',
        state: row.state ?? '',
        country: row.country ?? '',
      }
    : BLANK;

  const [values, setValues] = useState(initial);
  const [touchedError, setTouchedError] = useState(null);

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  const close = () => {
    if (busy) return;
    setValues(initial);
    setTouchedError(null);
    onClose();
  };

  const submit = () => {
    const missing = REQUIRED.filter((f) => !String(values[f] ?? '').trim());
    if (missing.length) {
      const labels = FIELDS.filter((f) => missing.includes(f.name)).map((f) => f.label);
      setTouchedError(`${labels.join(', ')} ${labels.length === 1 ? 'is' : 'are'} required.`);
      return;
    }
    setTouchedError(null);
    onSubmit(
      Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v).trim()])),
      // Reset only once the write has actually succeeded — a failed submit must
      // keep what was typed.
      () => setValues(initial)
    );
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={close}
      title={editing ? 'Edit Address' : 'New Address'}
      description={
        editing
          ? 'Changing the area updates that area; changing the pincode or its geography updates the pincode.'
          : 'Registers a pincode and the geography it determines. The area is optional — more can be mapped to this pincode later.'
      }
      submitLabel={editing ? 'Save changes' : 'Add Address'}
      submitVariant={editing ? 'primary' : 'accent'}
      onSubmit={submit}
      busy={busy}
      error={touchedError ?? error}
      size="md"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.name}>
            <label
              htmlFor={`address-${f.name}`}
              className="mb-1.5 block text-xs font-semibold text-primary"
            >
              {f.label}
              {/* The area is optional only while it does not exist yet — an
                  existing one can be renamed but not blanked (no delete, and the
                  API rejects an empty name). */}
              {f.optional && !(editing && row.areaId != null) && (
                <span className="ml-1 font-normal text-text-faint">(optional)</span>
              )}
            </label>
            <input
              id={`address-${f.name}`}
              className="input-field"
              value={values[f.name]}
              onChange={(e) => set(f.name, e.target.value)}
              placeholder={f.placeholder}
              inputMode={f.inputMode}
              autoComplete="off"
            />
          </div>
        ))}
      </div>
    </FormDialog>
  );
}
