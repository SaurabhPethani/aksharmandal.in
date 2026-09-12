import { useState } from 'react';
import FormDialog from '../FormDialog';

/**
 * Confirming an application, and collecting whatever the profile could not
 * answer for the applicant.
 *
 * WHAT THE POST CARRIES IS THE APPLICANT'S OWN CONTACT DETAILS — the endpoint
 * requires all three — so they are seeded from /users/me and shown for
 * confirmation rather than typed from scratch. A complete profile means the
 * reader reads three lines and presses Apply; an incomplete one asks only for
 * the field that is actually missing.
 *
 * The fields stay EDITABLE even when the profile filled them in: the number a
 * member wants a prospective employer to ring is not always the one on their
 * record, and correcting it here does not touch their profile — the
 * application stores its own copy, so the trail is immune to later edits.
 *
 * ⚠ This dialog does NOT reveal anything. Applying creates a `Pending`
 * application; the employer's details appear only after a checker approves it.
 * The submit copy says so, or the reader presses Apply expecting a phone number
 * and gets a waiting message.
 */

const LABEL = 'mb-1.5 block text-sm font-semibold text-primary';

const FIELDS = [
  ['contactPerson', 'Your name', 'text', 'Who the employer should ask for'],
  ['contactEmail', 'Your email', 'email', 'name@example.com'],
  ['contactMobile', 'Your mobile', 'tel', '10-digit number'],
];

const MISSING_LABELS = {
  contactPerson: 'Your name',
  contactEmail: 'Your email',
  contactMobile: 'Your mobile',
};

/** The applicant's own details, as the endpoint wants them. */
export function contactFromMe(me) {
  return {
    contactPerson:
      [me?.first_name, me?.middle_name, me?.last_name].filter(Boolean).join(' ')
      || me?.user_name || '',
    contactEmail: me?.email || '',
    contactMobile: me?.mobile_number || '',
  };
}

export default function JobApplyDialog({ job, me, isOpen, busy, error, onClose, onSubmit }) {
  const [contact, setContact] = useState(() => contactFromMe(me));
  const [localError, setLocalError] = useState(null);

  const set = (key, value) => setContact((c) => ({ ...c, [key]: value }));

  const submit = () => {
    // Checked here rather than left to a 422 naming a field index: the endpoint
    // takes plain strings and would happily store a blank-looking one.
    const missing = FIELDS.map(([k]) => k).find((k) => !String(contact[k] ?? '').trim());
    if (missing) {
      setLocalError(`${MISSING_LABELS[missing]} is required to apply.`);
      return;
    }
    if (!/^\d{10}$/.test(String(contact.contactMobile).trim())) {
      setLocalError('Your mobile number must be exactly 10 digits.');
      return;
    }
    setLocalError(null);
    onSubmit({
      contactPerson: contact.contactPerson.trim(),
      contactEmail: contact.contactEmail.trim(),
      contactMobile: contact.contactMobile.trim(),
    });
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Apply for ${job?.title || 'this job'}`}
      description="These details go to the employer so they can reach you. Your application is sent for approval — the employer's contact details appear here once it is approved."
      submitLabel="Apply"
      onSubmit={submit}
      busy={busy}
      error={localError ?? error}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(([key, label, type, placeholder]) => (
          <div key={key} className={key === 'contactPerson' ? 'sm:col-span-2' : ''}>
            <label htmlFor={`apply-${key}`} className={LABEL}>
              {label}
              <span className="text-accent"> *</span>
            </label>
            <input
              id={`apply-${key}`}
              type={type}
              className="input-field"
              value={contact[key]}
              disabled={busy}
              placeholder={placeholder}
              inputMode={key === 'contactMobile' ? 'numeric' : undefined}
              autoComplete="off"
              onChange={(e) =>
                set(
                  key,
                  // Ten digits, stripped as it is typed so the rule is visible
                  // rather than sprung at submit.
                  key === 'contactMobile'
                    ? e.target.value.replace(/\D/g, '').slice(0, 10)
                    : e.target.value
                )
              }
            />
          </div>
        ))}
      </div>
    </FormDialog>
  );
}
