import { useState } from 'react';
import FormDialog from '../FormDialog';
import { Toggle } from '../ui';
import { RULES, todayISO } from '../../utils/validation';
import { NIMIT_SEVAK_LABEL, DOING_POOJA_LABEL } from '../../utils/memberFlags';
import EventCustomFieldsBuilder from './EventCustomFieldsBuilder';
import EventImageField from './EventImageField';

// Level-2 targeting: the membership flags an event may be aimed at, in the same
// order the backend stores them (EVENT_TARGET_FLAGS in events.py). "Ambrish" is
// the general term used for the audience label (a female Ambrish is a Sarhadyi,
// but the target is the standing, not a specific member's gender).
const TARGET_FLAGS = [
  { key: 'is_ambrish', label: 'Ambrish' },
  { key: 'is_nimit_sevak', label: NIMIT_SEVAK_LABEL },
  { key: 'doing_pooja', label: DOING_POOJA_LABEL },
];

/**
 * Create / edit an event.
 *
 * `category` is a free string server-side, so these options are a frontend
 * convention rather than master data — there is no event-category endpoint. The
 * list stays open: an event whose category is not among them still loads and
 * keeps its value (see `categoryOptions`).
 */
const CATEGORY_OPTIONS = ['Samaiyo', 'Shibir', 'Seminar', 'Webinar', 'Sports', 'Blood Donation'];

const BLANK = {
  title: '', category: '', location: '', date: '', time: '',
  description: '', image: '', user_category: [], target_flags: [],
  custom_fields: [], status: true,
};

/**
 * Validate the custom fields against the same rules the backend enforces
 * (label required, 2+ unique non-blank options), and return a cleaned copy with
 * blank options trimmed. Returns `{ error }` on the first problem instead of a
 * cleaned list. Kept here so a bad field is caught before the request rather
 * than as a 422 the dialog would show verbatim.
 */
const CHOICE_TYPES = new Set(['single', 'multi']);
const VALUE_TYPES = new Set(['text', 'number', 'date']);

function cleanCustomFields(fields) {
  const out = [];
  for (const f of fields ?? []) {
    const label = String(f.label ?? '').trim();
    if (!label) return { error: 'Every custom field needs a label.' };
    const type = CHOICE_TYPES.has(f.type) || VALUE_TYPES.has(f.type) ? f.type : 'single';
    const base = { ...(f.id ? { id: f.id } : {}), label, type, required: Boolean(f.required) };

    if (CHOICE_TYPES.has(type)) {
      const options = (f.options ?? []).map((o) => String(o ?? '').trim()).filter(Boolean);
      if (options.length < 2) return { error: `Field "${label}" needs at least two options.` };
      if (new Set(options).size !== options.length) {
        return { error: `Field "${label}" has duplicate options.` };
      }
      out.push({ ...base, options });
    } else if (type === 'date') {
      // Date fields carry a bound rule (any / no_future / no_past) but no options.
      const rule = ['any', 'no_future', 'no_past'].includes(f.date_rule) ? f.date_rule : 'any';
      out.push({ ...base, options: [], date_rule: rule });
    } else {
      // Text / number carry neither options nor a date rule.
      out.push({ ...base, options: [] });
    }
  }
  return { fields: out };
}

const LABEL = 'mb-1.5 block text-sm font-semibold text-primary';

export default function EventFormDialog({
  event, categories, isOpen, busy, error, onClose, onSubmit,
}) {
  const editing = Boolean(event);

  const [form, setForm] = useState(
    editing
      ? {
          title: event.title ?? '',
          category: event.category ?? '',
          location: event.location ?? '',
          date: event.date ?? '',
          time: event.time ?? '',
          description: event.description ?? '',
          image: event.image ?? '',
          user_category: event.user_category ?? [],
          target_flags: event.target_flags ?? [],
          custom_fields: event.custom_fields ?? [],
          status: event.status !== false,
        }
      : BLANK
  );
  const [localError, setLocalError] = useState(null);

  const set = (name, value) => setForm((v) => ({ ...v, [name]: value }));

  // An existing category the option list does not know about must not vanish
  // from the dropdown, or opening and saving would silently blank it.
  const categoryOptions = form.category && !CATEGORY_OPTIONS.includes(form.category)
    ? [form.category, ...CATEGORY_OPTIONS]
    : CATEGORY_OPTIONS;

  const allSelected = form.user_category.length === 0;

  /**
   * An event is something being scheduled, so its date is today or later.
   *
   * The floor is normally today. The exception is an event that ALREADY has a
   * past date: it happened, and its record still has to be editable — fixing a
   * typo in the description must not demand moving the date first. So the
   * calendar opens down to the date it was saved with, and no earlier. A new
   * event has no saved date, so the floor is simply today.
   */
  const savedDate = editing ? String(event.date ?? '').trim() : '';
  const earliest = savedDate && savedDate < todayISO() ? savedDate : todayISO();

  /** `null` when the chosen date is allowed. */
  const dateError = () => {
    if (!form.date) return null;
    if (form.date === savedDate) return null;
    return RULES.notPast(form.date);
  };

  const toggleCategory = (id) => {
    setForm((v) => {
      const next = v.user_category.includes(id)
        ? v.user_category.filter((c) => c !== id)
        : [...v.user_category, id];
      return { ...v, user_category: next };
    });
  };

  const toggleFlag = (key) => {
    setForm((v) => {
      const next = v.target_flags.includes(key)
        ? v.target_flags.filter((f) => f !== key)
        : [...v.target_flags, key];
      return { ...v, target_flags: next };
    });
  };

  const submit = () => {
    const title = form.title.trim();
    if (!title) { setLocalError('Title is required.'); return; }

    // The `min` on the input greys out earlier days, but the picker is only the
    // first gate — a typed or pasted date reaches here regardless.
    const badDate = dateError();
    if (badDate) { setLocalError(badDate); return; }

    const cleaned = cleanCustomFields(form.custom_fields);
    if (cleaned.error) { setLocalError(cleaned.error); return; }

    setLocalError(null);

    // Blank strings are dropped rather than sent: the columns are nullable, and
    // "" is not the same as "not set" for a date the backend parses.
    const payload = {
      title, status: form.status,
      user_category: form.user_category, target_flags: form.target_flags,
      custom_fields: cleaned.fields,
    };
    for (const key of ['category', 'location', 'date', 'time', 'description']) {
      const value = String(form[key] ?? '').trim();
      if (value) payload[key] = value;
    }
    // `image` is always sent — unlike the others, an empty value here is a
    // deliberate "remove", so it must reach the server (null) rather than being
    // dropped and silently leaving the old image in place on an edit.
    payload.image = String(form.image ?? '').trim() || null;
    onSubmit(payload);
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Event Details"
      submitLabel={editing ? 'Save Changes' : 'Create Event'}
      submitVariant={editing ? 'primary' : 'accent'}
      submitDisabled={!form.title.trim() || Boolean(dateError())}
      onSubmit={submit}
      busy={busy}
      error={localError ?? error}
      size="lg"
    >
      <div>
        <label htmlFor="event-title" className={LABEL}>
          Title <span className="text-accent">*</span>
        </label>
        <input
          id="event-title"
          className="input-field"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Annual Youth Convention"
          autoFocus
          autoComplete="off"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="event-category" className={LABEL}>Category</label>
          <select
            id="event-category"
            className="input-field"
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
          >
            <option value="">Select category</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="event-location" className={LABEL}>Location</label>
          <input
            id="event-location"
            className="input-field"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="e.g. Main Hall, Mumbai"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="event-date" className={LABEL}>Date</label>
          <input
            id="event-date"
            type="date"
            // Resolved at render, not baked into a module constant: a dialog
            // left open across midnight would otherwise still floor at yesterday.
            min={earliest}
            className={`input-field ${dateError() ? '!border-danger-fg' : ''}`}
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            aria-describedby="event-date-hint"
          />
          <p
            id="event-date-hint"
            className={`mt-1 text-xs ${dateError() ? 'font-medium text-danger-fg' : 'text-text-muted'}`}
          >
            {dateError() ?? 'Today or later.'}
          </p>
        </div>
        <div>
          <label htmlFor="event-time" className={LABEL}>Time</label>
          <input
            id="event-time"
            type="time"
            className="input-field"
            value={form.time}
            onChange={(e) => set('time', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="event-description" className={LABEL}>Description</label>
        <textarea
          id="event-description"
          className="input-field min-h-[6rem] resize-y"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Short description of the event…"
        />
      </div>

      <EventImageField
        value={form.image}
        onChange={(url) => set('image', url)}
        disabled={busy}
      />

      <div>
        <p className={LABEL}>Target Categories</p>
        <div className="flex flex-wrap gap-2">
          {/* "All" is the ABSENCE of a selection, not a category id — the API
              treats an empty `user_category` as "everyone", so selecting All
              clears the list rather than adding a magic value. */}
          <button
            type="button"
            onClick={() => set('user_category', [])}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              allSelected
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-line-strong text-text-muted hover:border-primary hover:text-primary'
            }`}
          >
            All
          </button>
          {(categories ?? []).map((c) => {
            const on = form.user_category.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCategory(c.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  on
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line-strong text-text-muted hover:border-primary hover:text-primary'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-text-muted">
          Level 1. Empty = every category.
        </p>
      </div>

      <div>
        <p className={LABEL}>Target Membership</p>
        <div className="flex flex-wrap gap-2">
          {TARGET_FLAGS.map((f) => {
            const on = form.target_flags.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleFlag(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  on
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line-strong text-text-muted hover:border-primary hover:text-primary'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        {/* Level 2 narrows Level 1: a member sees the event when their category
            matches AND they carry at least one selected flag. Leave all off to
            place no flag restriction. */}
        <p className="mt-1.5 text-xs text-text-muted">
          Level 2. Empty = no flag restriction. Otherwise a member must match the
          category <span className="font-semibold">and</span> at least one flag.
        </p>
      </div>

      {/* Once an event has registrations, the backend blocks edits that would
          orphan answers (removing a field/option that was chosen, or changing a
          type). Say so up front so a blocked save is not a surprise. */}
      {editing && (event.overall_registered_count > 0 || event.total_registered_count > 0) && (
        <p className="rounded-control border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
          This event already has registrations. You can add fields or options and
          rename labels, but removing a field/option that has answers — or changing
          a field's type — will be blocked to protect collected data.
        </p>
      )}

      <EventCustomFieldsBuilder
        value={form.custom_fields}
        onChange={(next) => set('custom_fields', next)}
        disabled={busy}
      />

      <div className="flex items-center justify-between gap-3 rounded-control border border-line-soft bg-bg px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-primary">Active</p>
          <p className="text-xs text-text-muted">Inactive events are hidden from registration.</p>
        </div>
        <Toggle
          checked={form.status}
          onChange={() => set('status', !form.status)}
          disabled={busy}
          tone="accent"
          label="Event is active"
        />
      </div>
    </FormDialog>
  );
}
