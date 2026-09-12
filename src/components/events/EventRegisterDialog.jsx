import { useRef, useState } from 'react';
import { RULES } from '../../utils/validation';
import { CalendarDays, CheckCircle2, Loader2, MapPin, Trash2, UserPlus, Users } from 'lucide-react';
import FormDialog from '../FormDialog';
import { FormField, Input, Select } from '../form';
import { apiUrl } from '../../api/client';
import { GENDER_OPTIONS } from '../../utils/userFormSchema';
import { eventsService } from '../../services/eventsService';
import EventAnswerFields, { validateAnswers, pruneAnswers } from './EventAnswerFields';

/**
 * One event's popup — opened by clicking its card, and the only way into
 * `POST /register-for-events`.
 *
 * WHY THE EVENT IS NOT CHOSEN HERE. Registration used to be two buttons in the
 * page header, each opening a dialog whose first field was a "select an event"
 * dropdown. The event is now picked by clicking it, so the dropdown is gone and
 * `event.id` is simply what gets posted — one fewer thing to choose, and no way
 * to open the form against one event and submit it against another.
 *
 * The two ways to register are the two TABS. Both post to the same endpoint,
 * which takes an ARRAY and registers atomically: Self sends a single entry, the
 * member form sends as many rows as were filled in. Neither posts per member in
 * a loop — a partial success would leave the caller with no way to tell which
 * rows landed.
 */

/**
 * Derived from the member form's list, not written out again.
 *
 * This used to be a literal `['Male', 'Female', 'Other']`, which is how it kept
 * offering "Other" after that option was removed from the member form — two
 * copies of the same fixed list, and only one of them got the edit. A person's
 * gender does not depend on which screen is asking, so there is one list.
 */
const GENDERS = GENDER_OPTIONS.map((o) => o.value);

/** Whole years between `dob` and today, or null when there is no usable date. */
export function ageFromDob(dob) {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/** "31 Aug 2026", or "20 Aug 2026 · 21:00" when a time is set. */
function whenLabel(date, time) {
  if (!date) return null;
  const d = new Date(date);
  const day = Number.isNaN(d.getTime())
    ? String(date)
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return time ? `${day} · ${time}` : day;
}

const BLANK_MEMBER = {
  mobile_number: '', first_name: '', middle_name: '', last_name: '', gender: '', age: '',
  custom_answers: {},
};

/** What the popup opens on, and what each choice actually does. */
const TABS = [
  { key: 'self', label: 'Self Register', hint: 'Register yourself', icon: UserPlus },
  { key: 'members', label: 'Member Register', hint: 'Register other members', icon: Users },
];

function EventSummary({ event }) {
  const when = whenLabel(event.date, event.time);
  const active = event.status !== false;

  return (
    <div className="flex gap-3 rounded-control bg-bg px-4 py-3">
      {/* Thumbnail, so the popup is visibly the card that was clicked.
          `event.image` can be one of:
            • an absolute URL   — `https://…` (hosted elsewhere)
            • a data URI        — `data:image/…;base64,…` (inlined, how the
                                  current events on prod are saved)
            • a blob URL        — `blob:…` (rare, previews)
            • a server path     — `/uploads/…` (needs the API origin)
          Was `startsWith('http')`, which passed data / blob values through
          apiUrl and produced 404-in-the-URL nonsense like
          `.../aksharconnect/data:image/jpeg;base64,...` — that is why every
          click on Register was showing a broken thumbnail. Same fix as
          EventCard uses. */}
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-control border border-line-soft bg-surface">
        {event.image ? (
          <img
            src={/^(https?:|data:|blob:|\/\/)/i.test(event.image) ? event.image : apiUrl(event.image)}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CalendarDays className="h-6 w-6 text-line-strong" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display font-bold text-primary">{event.title}</p>
            {event.category && <p className="text-sm font-semibold text-accent">{event.category}</p>}
          </div>
          <span
            className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              active ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success-fg' : 'bg-danger-fg'}`} />
            {active ? 'Active' : 'Inactive'}
          </span>
        </div>

        {(when || event.location) && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
            {when && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                {when}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                {event.location}
              </span>
            )}
          </div>
        )}

        {event.description && (
          <p className="mt-2 text-sm leading-snug text-text-faint">{event.description}</p>
        )}
      </div>
    </div>
  );
}

/**
 * The two registration types, as a segmented control rather than a text tab
 * strip: the point of the popup is that there ARE two, and a row of quiet labels
 * does not say so. Each option carries its own icon and a line naming who it
 * registers, so the difference is readable without pressing either.
 */
function RegisterTabs({ value, onChange, disabled }) {
  return (
    <div>
      <p className="eyebrow mb-2">How do you want to register?</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="tablist">
        {TABS.map((t) => {
          const selected = t.key === value;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => onChange(t.key)}
              className={`flex items-center gap-3 rounded-control border-2 p-3 text-left transition-all disabled:opacity-50 ${
                selected
                  ? 'border-primary bg-primary-50/60 shadow-card'
                  : 'border-line-soft bg-surface hover:border-primary/40'
              }`}
            >
              <span
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                  selected ? 'bg-primary text-white' : 'bg-bg text-text-muted'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-sm font-bold ${selected ? 'text-primary' : 'text-text-muted'}`}>
                  {t.label}
                </span>
                <span className="block truncate text-xs text-text-faint">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function EventRegisterDialog({
  event,
  me,
  canRegister,
  isOpen,
  busy,
  error,
  onClose,
  onSubmit,
  /** Clears the mutation's error, so a failure on one tab does not follow to the other. */
  onResetError,
}) {
  const [tab, setTab] = useState(TABS[0].key);
  const [members, setMembers] = useState([{ ...BLANK_MEMBER }]);
  const [selfAnswers, setSelfAnswers] = useState({});
  const [selfAnswerErrors, setSelfAnswerErrors] = useState({});
  const [localError, setLocalError] = useState(null);

  // The event's admin-built choice fields, shown to every registrant.
  const customFields = event.custom_fields ?? [];
  /**
   * Per-row, per-field messages: `memberErrors[rowIndex][fieldName]`.
   *
   * An array rather than one flat object because the same field name repeats
   * down the rows — "Member 2's mobile" is not "Member 1's mobile", and a flat
   * map would have the second row's complaint overwrite the first's.
   */
  const [memberErrors, setMemberErrors] = useState([]);

  /**
   * Per-row result of the live mobile probe (`GET /register-for-events/lookup`):
   * `{ loading, registered, autofilled }`, index-aligned with `members`.
   *
   * - `registered` draws the red "already on this event" warning under Mobile
   *   Number and blocks that row from submitting — the same (event, mobile) rule
   *   the backend enforces, surfaced before submit instead of as a 409.
   * - `autofilled` means the number matched a known member, so name / gender /
   *   age were filled in and are locked (greyed) — retyping what we already hold
   *   is how a typo spawns a second person.
   */
  const [lookups, setLookups] = useState([{}]);
  // Debounce timers and a per-row request counter, so a fast typist fires one
  // probe on the settled number and a stale reply can never overwrite a newer
  // one. Refs (not state) — they must not trigger renders.
  const lookupTimers = useRef({});
  const lookupSeq = useRef({});

  const runLookup = async (i, mobile) => {
    const seq = (lookupSeq.current[i] || 0) + 1;
    lookupSeq.current[i] = seq;
    setLookups((rows) => rows.map((r, idx) => (idx === i ? { ...r, loading: true } : r)));
    try {
      const res = await eventsService.lookupRegistration(event.id, mobile);
      if (lookupSeq.current[i] !== seq) return; // superseded by a newer edit
      const registered = Boolean(res?.registered);
      const u = registered ? null : res?.user || null;
      setLookups((rows) =>
        rows.map((r, idx) =>
          idx === i
            ? {
                loading: false,
                registered,
                autofilled: Boolean(u),
                // Who the number is already registered for, and by whom — shown
                // in the warning so the operator knows it wasn't just a dupe but
                // "Amit Limbasia, put down by Sagar Limbasia".
                registeredFor: res?.registered_for || null,
                registeredBy: res?.registered_by || null,
              }
            : r,
        ),
      );
      if (u) {
        // Fill and lock identity from the member record.
        setMembers((rows) =>
          rows.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  first_name: u.first_name || '',
                  middle_name: u.middle_name || '',
                  last_name: u.last_name || '',
                  gender: u.gender || '',
                  age: u.age != null ? String(u.age) : '',
                }
              : r,
          ),
        );
        // Any complaints about those cells are now moot.
        setMemberErrors((rows) => (rows[i] ? rows.map((r, idx) => (idx === i ? {} : r)) : rows));
      }
    } catch {
      if (lookupSeq.current[i] !== seq) return;
      // A probe failure must never block registering — fall back to manual entry.
      setLookups((rows) => rows.map((r, idx) => (idx === i ? { loading: false } : r)));
    }
  };

  const onMobileChange = (i, raw) => {
    const mobile = raw.replace(/\D/g, '').slice(0, 10);
    const wasAutofilled = lookups[i]?.autofilled;
    setMembers((rows) =>
      rows.map((r, idx) =>
        idx === i
          ? {
              ...r,
              mobile_number: mobile,
              // Editing the number invalidates a previously auto-filled identity,
              // so clear it rather than leave the old member's name on a new one.
              ...(wasAutofilled
                ? { first_name: '', middle_name: '', last_name: '', gender: '', age: '' }
                : {}),
            }
          : r,
      ),
    );
    setMemberErrors((rows) => {
      if (!rows[i]?.mobile_number) return rows;
      const next = [...rows];
      next[i] = { ...next[i], mobile_number: undefined };
      return next;
    });
    setLookups((rows) => rows.map((r, idx) => (idx === i ? {} : r)));
    clearTimeout(lookupTimers.current[i]);
    if (mobile.length === 10) {
      lookupTimers.current[i] = setTimeout(() => runLookup(i, mobile), 350);
    }
  };

  // An inactive event was already excluded from the old dialogs' dropdown; the
  // rule has not changed, only where it is said.
  const open = event.status !== false;
  const registerable = canRegister && open;

  const age = ageFromDob(me?.dob);
  const summary = [me?.mobile_number, me?.gender, age == null ? null : `${age} yrs`]
    .filter(Boolean)
    .join(' · ');

  const switchTab = (key) => {
    if (key === tab) return;
    setTab(key);
    setLocalError(null);
    setMemberErrors([]);
    setLookups(members.map(() => ({})));
    setSelfAnswerErrors({});
    onResetError?.();
  };

  const setMemberAnswers = (i, answers) => {
    setMembers((rows) => rows.map((r, idx) => (idx === i ? { ...r, custom_answers: answers } : r)));
    // Clear this row's answer complaints as they are being fixed.
    setMemberErrors((rows) => {
      if (!rows[i]?.custom) return rows;
      const next = [...rows];
      next[i] = { ...next[i], custom: undefined };
      return next;
    });
  };

  const setMember = (i, name, value) => {
    setMembers((rows) => rows.map((r, idx) => (idx === i ? { ...r, [name]: value } : r)));
    // Clear just this cell's complaint while it is being fixed.
    setMemberErrors((rows) => {
      if (!rows[i]?.[name]) return rows;
      const next = [...rows];
      next[i] = { ...next[i], [name]: undefined };
      return next;
    });
  };

  const addMember = () => {
    setMembers((rows) => [...rows, { ...BLANK_MEMBER }]);
    setLookups((rows) => [...rows, {}]);
  };
  const removeMember = (i) => {
    setMembers((rows) => rows.filter((_, idx) => idx !== i));
    // Errors and probe results are positional, so they have to move with the rows
    // they describe — otherwise removing row 1 leaves its messages attached to
    // what is now row 1.
    setMemberErrors((rows) => rows.filter((_, idx) => idx !== i));
    setLookups((rows) => rows.filter((_, idx) => idx !== i));
  };

  const submitSelf = () => {
    // The API requires a middle name; a member record without one would 422, so
    // it is caught here with a message that names the fix.
    if (!me?.first_name || !me?.last_name) {
      setLocalError('Your profile is missing a name, so you cannot be registered.');
      return;
    }
    const answerErrs = validateAnswers(customFields, selfAnswers);
    if (Object.keys(answerErrs).length) {
      setSelfAnswerErrors(answerErrs);
      setLocalError(null);
      return;
    }
    setSelfAnswerErrors({});
    setLocalError(null);
    const answers = pruneAnswers(selfAnswers);
    onSubmit([
      {
        event_id: Number(event.id),
        first_name: me.first_name,
        middle_name: me.middle_name || '',
        last_name: me.last_name,
        mobile_number: me.mobile_number,
        ...(me.gender ? { gender: me.gender } : {}),
        ...(age == null ? {} : { age }),
        ...(Object.keys(answers).length ? { custom_answers: answers } : {}),
      },
    ]);
  };

  const submitMembers = () => {
    /**
     * Every row and every field, in one pass.
     *
     * This used to `return` on the first problem and report it as one sentence
     * in the dialog's banner — so three blank rows took three submits to
     * discover, the message named a row number the eye then had to go count,
     * and the offending box looked exactly like a valid one.
     */
    const found = members.map((m, i) => {
      const row = {};
      // A row the live probe flagged as already on this event cannot be
      // submitted — the backend would 409 the whole atomic batch anyway.
      if (lookups[i]?.registered) {
        row.mobile_number = 'This mobile is already registered for this event.';
        return row;
      }
      for (const f of ['first_name', 'middle_name', 'last_name']) {
        if (!String(m[f] ?? '').trim()) row[f] = 'This field is required.';
        // Digits used to sail through here and get SAVED: blank was the only
        // thing these three fields were checked for, on this side and on the
        // backend both. `RULES.personName` is shared with the edit dialog so a
        // name cannot be rejected on one screen and accepted on the other.
        else {
          const bad = RULES.personName(m[f]);
          if (bad) row[f] = bad;
        }
      }
      const mobile = String(m.mobile_number ?? '').trim();
      if (!mobile) row.mobile_number = 'This field is required.';
      // Matches the endpoint's own `^\d{10}$`, so a bad number is caught here
      // rather than as a 422 naming a field index.
      else if (!/^\d{10}$/.test(mobile)) row.mobile_number = 'Enter exactly 10 digits.';

      // Required custom answers for this row, kept under `custom` so they sit
      // beside the field-name messages without colliding with them.
      const answerErrs = validateAnswers(customFields, m.custom_answers);
      if (Object.keys(answerErrs).length) row.custom = answerErrs;
      return row;
    });

    if (found.some((row) => Object.keys(row).length)) {
      setMemberErrors(found);
      setLocalError(null);
      return;
    }
    setMemberErrors([]);
    setLocalError(null);

    onSubmit(
      members.map((m) => {
        const answers = pruneAnswers(m.custom_answers);
        return {
          event_id: Number(event.id),
          first_name: m.first_name.trim(),
          middle_name: m.middle_name.trim(),
          last_name: m.last_name.trim(),
          mobile_number: m.mobile_number.trim(),
          ...(m.gender ? { gender: m.gender } : {}),
          ...(String(m.age).trim() ? { age: Number(m.age) } : {}),
          ...(Object.keys(answers).length ? { custom_answers: answers } : {}),
        };
      })
    );
  };

  const isSelf = tab === 'self';

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title={event.title || 'Event'}
      submitLabel={
        isSelf ? 'Register me'
          : members.length > 1 ? `Register ${members.length} members` : 'Register member'
      }
      onSubmit={isSelf ? submitSelf : submitMembers}
      // Nothing to submit when the caller cannot register, or the event is
      // closed — the body says which, so a dead button would only add noise.
      hideSubmit={!registerable}
      cancelLabel="Close"
      busy={busy}
      error={localError ?? error}
      size="lg"
    >
      <EventSummary event={event} />

      {!canRegister && (
        <p className="text-sm text-text-muted">
          Your role does not grant the <span className="font-semibold text-primary">Events · Register</span> action,
          so this event can only be viewed.
        </p>
      )}

      {canRegister && !open && (
        <p className="rounded-control border border-line-soft bg-bg px-4 py-3 text-sm text-text-muted">
          This event is inactive, so registration is closed.
        </p>
      )}

      {registerable && (
        <>
          <RegisterTabs value={tab} onChange={switchTab} disabled={busy} />

          {isSelf ? (
            /* Details are read-only and taken from the caller's own record: the
               endpoint wants first/middle/last and a mobile, and asking someone
               to retype what the system already holds invites a typo that
               creates a second person. */
            <>
              <div className="rounded-control bg-bg px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Registering yourself</p>
                <p className="mt-1 font-semibold text-primary">
                  {[me?.first_name, me?.middle_name, me?.last_name].filter(Boolean).join(' ') || '—'}
                </p>
                {summary && <p className="text-sm text-text-muted">{summary}</p>}
              </div>
              {customFields.length > 0 && (
                <div className="rounded-control border border-line-soft bg-surface px-4 py-3">
                  <EventAnswerFields
                    fields={customFields}
                    value={selfAnswers}
                    onChange={setSelfAnswers}
                    errors={selfAnswerErrors}
                    disabled={busy}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {members.map((m, i) => {
                const lk = lookups[i] || {};
                // Name/gender/age are pulled from the member record and locked;
                // the red warning wins over the fill when the number is already
                // on the event.
                const locked = Boolean(lk.autofilled) && !lk.registered;
                // When the number is already on the event, the specific
                // "for X by Y" line wins over any generic field message; parts
                // drop out gracefully if a name is missing.
                const mobileError = lk.registered
                  ? `Already registered${lk.registeredFor ? ` for ${lk.registeredFor}` : ''}` +
                    `${lk.registeredBy ? ` by ${lk.registeredBy}` : ''}.`
                  : memberErrors[i]?.mobile_number;
                return (
                <div key={i} className="rounded-card border border-line-soft p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Member {i + 1}</p>
                    {/* Only offered from the second row on: removing the only
                        member would leave a form that cannot be submitted. */}
                    {members.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMember(i)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-danger-fg hover:underline disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Labels rather than placeholders now that each field can
                      carry a message: a placeholder disappears the moment
                      anything is typed, so an error under an unlabelled box
                      would name a field the user can no longer see named. */}
                  <div className="space-y-3">
                    <FormField
                      label="Mobile Number"
                      htmlFor={`m${i}-mobile`}
                      required
                      compact
                      error={mobileError}
                    >
                      <Input
                        id={`m${i}-mobile`}
                        value={m.mobile_number}
                        error={mobileError}
                        onChange={(e) => onMobileChange(i, e.target.value)}
                        placeholder="10 digits"
                        inputMode="numeric"
                        autoComplete="off"
                      />
                      {/* Live probe feedback, under the field: a spinner while it
                          checks, then a green line when the number matched a known
                          member and their details were filled in below. The
                          already-registered case shows as the red error above. */}
                      {lk.loading && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
                        </p>
                      )}
                      {locked && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-success-fg">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Member found — details filled in below.
                        </p>
                      )}
                    </FormField>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {[
                        ['first_name', 'First Name'],
                        ['middle_name', 'Middle Name'],
                        ['last_name', 'Last Name'],
                      ].map(([f, label]) => (
                        <FormField
                          key={f}
                          label={label}
                          htmlFor={`m${i}-${f}`}
                          required
                          compact
                          error={memberErrors[i]?.[f]}
                        >
                          <Input
                            id={`m${i}-${f}`}
                            value={m[f]}
                            error={memberErrors[i]?.[f]}
                            onChange={(e) => setMember(i, f, e.target.value)}
                            autoComplete="off"
                            // Locked when auto-filled from a member record: editing
                            // here would only diverge the row from the person the
                            // number belongs to.
                            disabled={locked}
                            className={locked ? 'disabled:cursor-not-allowed disabled:bg-bg disabled:text-text-muted' : ''}
                          />
                        </FormField>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <FormField label="Gender" htmlFor={`m${i}-gender`} compact>
                        <Select
                          id={`m${i}-gender`}
                          value={m.gender}
                          placeholder="Select"
                          options={GENDERS}
                          onChange={(e) => setMember(i, 'gender', e.target.value)}
                          disabled={locked}
                          className={locked ? 'disabled:cursor-not-allowed disabled:bg-bg disabled:text-text-muted' : ''}
                        />
                      </FormField>
                      <FormField label="Age" htmlFor={`m${i}-age`} compact>
                        <Input
                          id={`m${i}-age`}
                          value={m.age}
                          onChange={(e) => setMember(i, 'age', e.target.value.replace(/\D/g, '').slice(0, 3))}
                          inputMode="numeric"
                          disabled={locked}
                          className={locked ? 'disabled:cursor-not-allowed disabled:bg-bg disabled:text-text-muted' : ''}
                        />
                      </FormField>
                    </div>

                    {customFields.length > 0 && (
                      <div className="border-t border-line-soft pt-3">
                        <EventAnswerFields
                          fields={customFields}
                          value={m.custom_answers}
                          onChange={(answers) => setMemberAnswers(i, answers)}
                          errors={memberErrors[i]?.custom}
                          disabled={busy}
                        />
                      </div>
                    )}
                  </div>
                </div>
                );
              })}

              <button
                type="button"
                onClick={addMember}
                disabled={busy}
                className="w-full rounded-card border-2 border-dashed border-line-strong py-3 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-50/40 disabled:opacity-50"
              >
                + Add another member
              </button>
            </>
          )}
        </>
      )}
    </FormDialog>
  );
}
