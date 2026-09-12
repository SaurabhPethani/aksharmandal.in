import { useState } from 'react';
import FormDialog from '../FormDialog';

/**
 * Create or edit a job post — `JOB_PORTAL:CREATE` covers both, because the
 * module declares no UPDATE action.
 *
 * `title` is the ONLY required field on JobPostCreate; every other column is
 * nullable. So the form validates title and nothing else, and sends only the
 * fields that were actually filled in: posting a blank string into
 * `salary_range` would put an empty value on the board where the card's own
 * "render nothing when absent" rule expects a null.
 */

const LABEL = 'mb-1.5 block text-sm font-semibold text-primary';

/** [name, label, placeholder, type]. Order is the order they are asked for. */
const FIELDS = [
  ['title', 'Job title', 'e.g. Software Engineer', 'text'],
  ['company_name', 'Company', 'e.g. Akshar Technologies', 'text'],
  ['designation', 'Designation', 'e.g. Senior Developer', 'text'],
  ['department', 'Department', 'e.g. Engineering', 'text'],
  ['location', 'Location', 'e.g. Ahmedabad', 'text'],
  ['experience', 'Experience', 'e.g. 2–4 years', 'text'],
  ['education', 'Education', 'e.g. B.E. / B.Tech', 'text'],
  ['salary_range', 'Salary range', 'e.g. ₹6–9 LPA', 'text'],
  ['contact_person', 'Contact person', 'Who applicants should reach', 'text'],
  ['contact_email', 'Contact email', 'name@example.com', 'email'],
  ['contact_mobile', 'Contact mobile', '10-digit number', 'tel'],
];

const LONG_FIELDS = [
  ['job_description', 'Job description', 'What the role involves'],
  ['requirements', 'Requirements', 'Skills and qualifications expected'],
];

/** Only the fields that carry a value — see the note above about blank strings. */
function payloadOf(form) {
  const out = {};
  for (const [key, value] of Object.entries(form)) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

export default function JobFormDialog({ job, isOpen, busy, error, onClose, onSubmit }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(
      [...FIELDS, ...LONG_FIELDS].map(([name]) => [name, job?.[name] ?? ''])
    )
  );
  const [localError, setLocalError] = useState(null);

  const set = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const submit = () => {
    if (!String(form.title).trim()) {
      setLocalError('A job title is required.');
      return;
    }
    // Checked here rather than left to a 422 naming a field index — the endpoint
    // takes a plain string, so a typo would otherwise be stored and shown.
    const mobile = String(form.contact_mobile).trim();
    if (mobile && !/^\d{10}$/.test(mobile)) {
      setLocalError('Contact mobile must be exactly 10 digits.');
      return;
    }
    setLocalError(null);
    onSubmit(payloadOf(form));
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title={job ? 'Edit job post' : 'Create job post'}
      description={
        job
          ? undefined
          : 'New posts start as Pending and reach the board once an approver activates them.'
      }
      submitLabel={job ? 'Save changes' : 'Create post'}
      submitDisabled={!String(form.title).trim()}
      onSubmit={submit}
      busy={busy}
      error={localError ?? error}
      size="lg"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(([name, label, placeholder, type]) => (
          <div key={name} className={name === 'title' ? 'sm:col-span-2' : ''}>
            <label htmlFor={`job-${name}`} className={LABEL}>
              {label}
              {name === 'title' && <span className="text-accent"> *</span>}
            </label>
            <input
              id={`job-${name}`}
              type={type}
              className="input-field"
              value={form[name]}
              disabled={busy}
              placeholder={placeholder}
              autoComplete="off"
              onChange={(e) =>
                set(
                  name,
                  // The endpoint wants ten digits; stripping as it is typed means
                  // the rule is visible rather than sprung at submit.
                  name === 'contact_mobile'
                    ? e.target.value.replace(/\D/g, '').slice(0, 10)
                    : e.target.value
                )
              }
            />
          </div>
        ))}
      </div>

      {LONG_FIELDS.map(([name, label, placeholder]) => (
        <div key={name}>
          <label htmlFor={`job-${name}`} className={LABEL}>{label}</label>
          <textarea
            id={`job-${name}`}
            rows={3}
            className="input-field resize-y"
            value={form[name]}
            disabled={busy}
            placeholder={placeholder}
            onChange={(e) => set(name, e.target.value)}
          />
        </div>
      ))}
    </FormDialog>
  );
}
