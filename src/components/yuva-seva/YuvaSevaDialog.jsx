import { useEffect, useState } from 'react';
import FormDialog from '../FormDialog';
import { DatePicker, FormField, Input, Select, Textarea } from '../form';
import { useAddYuvaSeva, useToast } from '../../hooks';
import { todayISO } from '../../utils/validation';

/**
 * Add Yuva Seva — one follow-up, logged against one member.
 *
 * POST /api/v1/yuva-seva with `{ user_id, mode, date, time, duration, remark? }`.
 * Adding only — a logged seva is a record of something that happened, and the
 * screen has no way to reach one again to correct it.
 *
 * `time` is required by the API but is not on the form: nobody logging a
 * follow-up wants to type the clock time it happened at, and a wrong one is
 * worse than the current one. It is filled in on submit — see below.
 */

/**
 * The modes the endpoint documents: "Phone / Outside / Home / Sabha / Other".
 * A free-text field would let five spellings of "Phone" into the data; the API
 * types it as a plain string, so the list has to live somewhere, and it lives
 * here beside the request that sends it.
 */
const MODE_OPTIONS = ['Phone', 'Outside', 'Home'].map((m) => ({ value: m, label: m }));

/** "14:05" — now, in the browser's own clock, which is the member's too. */
function nowTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function YuvaSevaDialog({ member, isOpen, onClose }) {
  const toast = useToast();
  const save = useAddYuvaSeva();

  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);

  // Cleared on the way out, so the next member's dialog never shows the last
  // one's notes.
  useEffect(() => {
    if (isOpen) return;
    setValues({});
    setErrors({});
    setSubmitError(null);
  }, [isOpen]);

  const setField = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const busy = save.isPending;

  const validate = () => {
    const found = {};
    if (!values.mode) found.mode = 'Please choose how this seva happened.';
    if (!String(values.duration ?? '').trim()) found.duration = 'Please enter the duration in minutes.';
    else if (!/^\d+$/.test(String(values.duration).trim())) found.duration = 'Minutes only, as a whole number.';
    if (!values.date) found.date = 'Please choose the date.';
    // The endpoint rejects a future date with a 400; catching it here names the
    // field rather than surfacing a bare error at the bottom.
    else if (values.date > todayISO()) found.date = 'A seva cannot be logged for a future date.';
    return found;
  };

  const submit = async () => {
    if (busy) return;
    setSubmitError(null);

    const found = validate();
    if (Object.keys(found).length) { setErrors(found); return; }

    try {
      const res = await save.mutateAsync({
        user_id: Number(member.user_id ?? member.id),
        mode: values.mode,
        date: values.date,
        // Required by the schema and not asked for: stamped with the time it
        // was logged, which is the closest true answer available.
        time: nowTime(),
        duration: Number(values.duration),
        ...(String(values.remark ?? '').trim() ? { remark: values.remark.trim() } : {}),
      });
      toast.success(res?.detail || 'Yuva Seva added.');
      onClose();
    } catch (err) {
      // A 422 names its fields; anything else is dialog-level.
      const placed = Object.entries(err?.fieldErrors ?? {}).filter(([n]) => n in values);
      if (placed.length) setErrors((e) => ({ ...e, ...Object.fromEntries(placed) }));
      if (!placed.length) {
        setSubmitError(
          err?.status === 0
            ? 'Network error — check your connection and try again.'
            : err?.detail || err?.message || 'Could not save. Please try again.'
        );
      }
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      // The member is named beside the title, not inside it: whose follow-up
      // this is matters as much as what the dialog does.
      title={
        <>
          Add Yuva Seva
          {member?.user_name && (
            <span className="ml-2 font-normal text-text-muted">· {member.user_name}</span>
          )}
        </>
      }
      submitLabel="Add Yuva Seva"
      submitVariant="accent"
      onSubmit={submit}
      busy={busy}
      error={submitError}
      size="md"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Mode" htmlFor="ys-mode" required error={errors.mode}>
          <Select
            id="ys-mode"
            value={values.mode ?? ''}
            error={errors.mode}
            onChange={(e) => setField('mode', e.target.value)}
            options={MODE_OPTIONS}
            placeholder="Select mode"
          />
        </FormField>

        <FormField label="Duration (min)" htmlFor="ys-duration" required error={errors.duration}>
          <Input
            id="ys-duration"
            type="number"
            min="0"
            value={values.duration ?? ''}
            placeholder="e.g. 30"
            error={errors.duration}
            onChange={(e) => setField('duration', e.target.value)}
          />
        </FormField>

        <div className="sm:col-span-2">
          <FormField label="Date" htmlFor="ys-date" required error={errors.date}>
            <DatePicker
              id="ys-date"
              value={values.date ?? ''}
              error={errors.date}
              // Today is the latest the endpoint accepts, so the picker says so
              // as well as the validation.
              max={todayISO()}
              onChange={(e) => setField('date', e.target.value)}
            />
          </FormField>
        </div>

        <div className="sm:col-span-2">
          <FormField label="Remark" htmlFor="ys-remark">
            <Textarea
              id="ys-remark"
              value={values.remark ?? ''}
              placeholder="Follow-up notes (optional)"
              onChange={(e) => setField('remark', e.target.value)}
            />
          </FormField>
        </div>
      </div>
    </FormDialog>
  );
}
