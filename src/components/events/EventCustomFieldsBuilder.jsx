import { Plus, Trash2, X } from 'lucide-react';
import { Toggle } from '../ui';

/**
 * The admin-facing builder for an event's custom choice fields (the poll-style
 * questions shown in the registration popup). Each field is
 *   { id?, label, type: 'single' | 'multi', required, options: string[] }
 * and the whole array is a controlled value — this component never keeps its own
 * copy, so the parent form owns the state and the id of an edited field (which
 * keeps already-collected answers linked) rides along untouched.
 *
 * Validation lives on submit in the parent, matching the backend rules (label
 * required, 2+ unique options); here the job is only to make the shape easy to
 * assemble.
 */
const BLANK_FIELD = { label: '', type: 'single', required: false, options: ['', ''] };

// The field kinds an admin can pick. Choice types collect an option; value types
// let the registrant type a value (and carry no options).
const FIELD_TYPES = [
  { value: 'single', label: 'Single choice' },
  { value: 'multi', label: 'Multiple choice' },
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
];
const isChoice = (t) => t === 'single' || t === 'multi';

// Caps mirror the backend (schemas/event.py): keep the JSON, the form and the
// exported sheet from ballooning.
const MAX_FIELDS = 20;
const MAX_OPTIONS = 20;
const MAX_LABEL_LEN = 60;
const MAX_OPTION_LEN = 40;

export default function EventCustomFieldsBuilder({ value, onChange, disabled }) {
  const fields = value ?? [];

  const patchField = (i, patch) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const addField = () => onChange([...fields, { ...BLANK_FIELD }]);
  const removeField = (i) => onChange(fields.filter((_, idx) => idx !== i));

  const setOption = (fi, oi, text) =>
    patchField(fi, { options: fields[fi].options.map((o, idx) => (idx === oi ? text : o)) });
  const addOption = (fi) => patchField(fi, { options: [...fields[fi].options, ''] });
  const removeOption = (fi, oi) =>
    patchField(fi, { options: fields[fi].options.filter((_, idx) => idx !== oi) });

  return (
    <div>
      <p className="mb-1.5 block text-sm font-semibold text-primary">Custom Fields</p>
      <p className="mb-2 text-xs text-text-muted">
        Poll-style choices shown when registering, e.g. Seating · Chair / Sofa.
        Single = pick one, Multi = pick any.
      </p>

      <div className="space-y-3">
        {fields.map((f, fi) => (
          <div key={f.id ?? fi} className="rounded-card border border-line-soft bg-bg/50 p-3">
            <div className="flex items-center gap-2">
              <input
                className="input-field flex-1"
                value={f.label}
                maxLength={MAX_LABEL_LEN}
                onChange={(e) => patchField(fi, { label: e.target.value })}
                placeholder="Field label, e.g. Seating"
                autoComplete="off"
                disabled={disabled}
              />
              <button
                type="button"
                onClick={() => removeField(fi)}
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded-control border border-danger-fg/30 px-2 py-2 text-xs font-semibold text-danger-fg hover:bg-danger-bg disabled:opacity-50"
                aria-label="Remove field"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                className="input-field !w-auto !py-1.5 text-xs font-semibold"
                value={f.type}
                onChange={(e) => patchField(fi, { type: e.target.value })}
                disabled={disabled}
                aria-label="Field type"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {/* A date field's bound sits inline with the type and Required. */}
              {f.type === 'date' && (
                <>
                  <span className="text-xs font-semibold text-text-muted">Allowed:</span>
                  <select
                    className="input-field !w-auto !py-1.5 text-xs font-semibold"
                    value={f.date_rule ?? 'any'}
                    onChange={(e) => patchField(fi, { date_rule: e.target.value })}
                    disabled={disabled}
                    aria-label="Date restriction"
                  >
                    <option value="any">Any date</option>
                    <option value="no_future">Not in the future (e.g. D.O.B.)</option>
                    <option value="no_past">Not in the past</option>
                  </select>
                </>
              )}
              <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-text-muted">
                Required
                <Toggle
                  checked={Boolean(f.required)}
                  onChange={() => patchField(fi, { required: !f.required })}
                  disabled={disabled}
                  tone="accent"
                  label="Field is required"
                />
              </label>
            </div>

            {isChoice(f.type) ? (
              <div className="mt-2 space-y-1.5">
                {f.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      className="input-field flex-1 !py-1.5"
                      value={o}
                      maxLength={MAX_OPTION_LEN}
                      onChange={(e) => setOption(fi, oi, e.target.value)}
                      placeholder={`Option ${oi + 1}`}
                      autoComplete="off"
                      disabled={disabled}
                    />
                    {/* Never let the count drop below two — the backend rejects a
                        one-option field, so the last two removals are blocked. */}
                    {f.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(fi, oi)}
                        disabled={disabled}
                        className="rounded-control p-1.5 text-text-muted hover:text-danger-fg disabled:opacity-50"
                        aria-label="Remove option"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addOption(fi)}
                  disabled={disabled || f.options.length >= MAX_OPTIONS}
                  className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                >
                  + Add option
                </button>
              </div>
            ) : f.type !== 'date' ? (
              <p className="mt-2 text-xs text-text-muted">
                {f.type === 'number' ? 'Members will type a number (0 or more).' : 'Members will type a value.'}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addField}
        disabled={disabled || fields.length >= MAX_FIELDS}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-card border-2 border-dashed border-line-strong py-2.5 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-50/40 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        {fields.length >= MAX_FIELDS ? `Maximum ${MAX_FIELDS} fields` : 'Add field'}
      </button>
    </div>
  );
}
