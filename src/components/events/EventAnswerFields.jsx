/**
 * Renders an event's custom choice fields as pickable pills for one registrant,
 * and reports the chosen answers up. Controlled: `value` is the answers object
 * ({ fieldId: string | string[] }), `onChange` gets the next one.
 *
 *   single  → pick one   (a chosen pill replaces the previous)
 *   multi   → pick any    (each pill toggles independently)
 *
 * `errors` is an optional { fieldId: message } map for required fields left
 * blank. Returns null when the event has no fields, so callers can drop it in
 * unconditionally.
 */
// Today as YYYY-MM-DD in the viewer's local time — the min/max floor/ceiling for
// bounded date fields.
const TODAY = (() => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
})();

export default function EventAnswerFields({ fields, value, onChange, errors, disabled }) {
  if (!fields?.length) return null;
  const answers = value ?? {};

  const pickSingle = (fid, opt) => {
    // Tapping the chosen pill again clears it (unless required is enforced on
    // submit) — a single field with no obligation should be un-answerable.
    onChange({ ...answers, [fid]: answers[fid] === opt ? undefined : opt });
  };
  const toggleMulti = (fid, opt) => {
    const cur = Array.isArray(answers[fid]) ? answers[fid] : [];
    const next = cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt];
    onChange({ ...answers, [fid]: next });
  };
  const setValue = (fid, value) => onChange({ ...answers, [fid]: value });

  const isChoice = (t) => t === 'single' || t === 'multi';

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.id}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-text-muted">
            {f.label}
            {f.required && <span className="text-accent"> *</span>}
            {f.type === 'multi' && <span className="ml-1 font-normal normal-case text-text-faint">(pick any)</span>}
          </p>
          {isChoice(f.type) ? (
            <div className="flex flex-wrap gap-2">
              {f.options.map((opt) => {
                const on = f.type === 'multi'
                  ? Array.isArray(answers[f.id]) && answers[f.id].includes(opt)
                  : answers[f.id] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={disabled}
                    onClick={() => (f.type === 'multi' ? toggleMulti(f.id, opt) : pickSingle(f.id, opt))}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      on
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-line-strong text-text-muted hover:border-primary hover:text-primary'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          ) : (
            // Value field: a typed input. Date -> native picker (D.O.B.), number
            // -> numeric, text -> plain. The answer is a string either way.
            <input
              type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
              inputMode={f.type === 'number' ? 'numeric' : undefined}
              // Text answers are capped at 40 characters (backend enforces the
              // same); date/number have their own natural bounds.
              maxLength={f.type === 'text' ? 40 : undefined}
              // A date field's bound greys out disallowed days in the picker:
              // no_future (D.O.B.) caps at today, no_past floors at today.
              max={f.type === 'date' && f.date_rule === 'no_future' ? TODAY : undefined}
              // number floors at 0 (no negatives); date no_past floors at today.
              min={
                f.type === 'number' ? 0
                  : f.type === 'date' && f.date_rule === 'no_past' ? TODAY
                  : undefined
              }
              className="input-field !py-1.5"
              value={typeof answers[f.id] === 'string' ? answers[f.id] : ''}
              onChange={(e) => setValue(f.id, e.target.value)}
              disabled={disabled}
              autoComplete="off"
            />
          )}
          {errors?.[f.id] && <p className="mt-1 text-xs font-medium text-danger-fg">{errors[f.id]}</p>}
        </div>
      ))}
    </div>
  );
}

/**
 * Required-answer check shared by the self and member paths. Returns a
 * { fieldId: message } map (empty when everything required is answered).
 */
export function validateAnswers(fields, answers) {
  const errs = {};
  for (const f of fields ?? []) {
    const v = (answers ?? {})[f.id];
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (f.required && empty) { errs[f.id] = 'Please choose an option.'; continue; }
    // Date bound (mirrors the backend): no_future = today or earlier (D.O.B.),
    // no_past = today or later. Only checked when a value is present.
    if (f.type === 'date' && !empty && typeof v === 'string') {
      if (f.date_rule === 'no_future' && v > TODAY) errs[f.id] = 'Date cannot be in the future.';
      if (f.date_rule === 'no_past' && v < TODAY) errs[f.id] = 'Date cannot be in the past.';
    }
    if (f.type === 'number' && !empty && Number(v) < 0) {
      errs[f.id] = 'Cannot be negative.';
    }
  }
  return errs;
}

/** Drop empty answers so we never send `{ fieldId: undefined }` or empty lists. */
export function pruneAnswers(answers) {
  const out = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) { if (v.length) out[k] = v; }
    else out[k] = v;
  }
  return out;
}
