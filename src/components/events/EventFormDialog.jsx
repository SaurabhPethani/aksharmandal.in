import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import FormDialog from '../FormDialog';
import { Text } from '../Typography';
import { DatePicker, FormField, Input, Select, Textarea } from '../form';
import { Toggle } from '../ui';
import { RULES, todayISO } from '../../utils/validation';
import { NIMIT_SEVAK_LABEL, SWAYAM_SEVAK_LABEL, DOING_POOJA_LABEL } from '../../utils/memberFlags';
import EventCustomFieldsBuilder from './EventCustomFieldsBuilder';
import EventImageField from './EventImageField';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

// Level-2 targeting: the membership flags an event may be aimed at, in the same
// order the backend stores them (EVENT_TARGET_FLAGS in events.py).
const TARGET_FLAGS = [
  { key: 'is_ambrish', label: 'Ambrish' },
  { key: 'is_nimit_sevak', label: NIMIT_SEVAK_LABEL },
  { key: 'is_swayam_sevak', label: SWAYAM_SEVAK_LABEL },
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
      const options = (f.options ?? []).map(o => String(o ?? '').trim()).filter(Boolean);
      if (options.length < 2) return { error: `Field "${label}" needs at least two options.` };
      if (new Set(options).size !== options.length) {
        return { error: `Field "${label}" has duplicate options.` };
      }
      out.push({ ...base, options });
    } else if (type === 'date') {
      const rule = ['any', 'no_future', 'no_past'].includes(f.date_rule) ? f.date_rule : 'any';
      out.push({ ...base, options: [], date_rule: rule });
    } else {
      out.push({ ...base, options: [] });
    }
  }
  return { fields: out };
}

/** A best-effort HH:MM (24-hr) mask as the field is typed. */
function maskTime(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function TargetPill({ label, on, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        on && styles.pillOn,
        pressed && !disabled && styles.pillPressed,
      ]}
    >
      <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function EventFormDialog({ event, categories, isOpen, busy, error, onClose, onSubmit }) {
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
      : BLANK,
  );
  const [localError, setLocalError] = useState(null);

  const set = (name, value) => setForm(v => ({ ...v, [name]: value }));

  // An existing category the option list does not know about must not vanish
  // from the dropdown, or opening and saving would silently blank it.
  const categoryOptions = (
    form.category && !CATEGORY_OPTIONS.includes(form.category)
      ? [form.category, ...CATEGORY_OPTIONS]
      : CATEGORY_OPTIONS
  ).map(c => ({ value: c, label: c }));

  const allSelected = form.user_category.length === 0;

  /**
   * An event is something being scheduled, so its date is today or later.
   * The exception is an event that ALREADY has a past date: it happened, and
   * its record still has to be editable, so the calendar opens down to the
   * date it was saved with, and no earlier.
   */
  const savedDate = editing ? String(event.date ?? '').trim() : '';
  const earliest = savedDate && savedDate < todayISO() ? savedDate : todayISO();

  /** `null` when the chosen date is allowed. */
  const dateError = () => {
    if (!form.date) return null;
    if (form.date === savedDate) return null;
    return RULES.notPast(form.date);
  };

  const toggleCategory = id => {
    setForm(v => {
      const next = v.user_category.includes(id)
        ? v.user_category.filter(c => c !== id)
        : [...v.user_category, id];
      return { ...v, user_category: next };
    });
  };

  const toggleFlag = key => {
    setForm(v => {
      const next = v.target_flags.includes(key)
        ? v.target_flags.filter(f => f !== key)
        : [...v.target_flags, key];
      return { ...v, target_flags: next };
    });
  };

  const submit = () => {
    const title = form.title.trim();
    if (!title) { setLocalError('Title is required.'); return; }

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
      <FormField label="Title" required>
        <Input
          value={form.title}
          onChangeText={next => set('title', next)}
          placeholder="e.g. Annual Youth Convention"
          autoFocus
        />
      </FormField>

      <FormField label="Category">
        <Select
          value={form.category}
          options={categoryOptions}
          placeholder="Select category"
          onChange={next => set('category', next)}
        />
      </FormField>

      <FormField label="Location">
        <Input
          value={form.location}
          onChangeText={next => set('location', next)}
          placeholder="e.g. Main Hall, Mumbai"
        />
      </FormField>

      <FormField
        label="Date"
        error={dateError()}
        hint={dateError() ? undefined : 'Today or later.'}
      >
        <DatePicker
          value={form.date}
          min={earliest}
          placeholder="Select date"
          onChange={next => set('date', next)}
        />
      </FormField>

      <FormField label="Time" hint="24-hour, e.g. 21:00">
        <Input
          value={form.time}
          onChangeText={next => set('time', maskTime(next))}
          placeholder="HH:MM"
          inputMode="numeric"
          maxLength={5}
        />
      </FormField>

      <FormField label="Description">
        <Textarea
          value={form.description}
          onChangeText={next => set('description', next)}
          placeholder="Short description of the event…"
        />
      </FormField>

      <EventImageField
        value={form.image}
        onChange={url => set('image', url)}
        disabled={busy}
      />

      <View>
        <Text style={styles.sectionLabel}>Target Categories</Text>
        <View style={styles.pills}>
          {/* "All" is the ABSENCE of a selection, not a category id — the API
              treats an empty `user_category` as "everyone". */}
          <TargetPill label="All" on={allSelected} onPress={() => set('user_category', [])} disabled={busy} />
          {(categories ?? []).map(c => (
            <TargetPill
              key={c.id}
              label={c.name}
              on={form.user_category.includes(c.id)}
              onPress={() => toggleCategory(c.id)}
              disabled={busy}
            />
          ))}
        </View>
        <Text style={styles.sectionHint}>Level 1. Empty = every category.</Text>
      </View>

      <View>
        <Text style={styles.sectionLabel}>Target Membership</Text>
        <View style={styles.pills}>
          {TARGET_FLAGS.map(f => (
            <TargetPill
              key={f.key}
              label={f.label}
              on={form.target_flags.includes(f.key)}
              onPress={() => toggleFlag(f.key)}
              disabled={busy}
            />
          ))}
        </View>
        <Text style={styles.sectionHint}>
          Level 2. Empty = no flag restriction. Otherwise a member must match the
          category and at least one flag.
        </Text>
      </View>

      {/* Once an event has registrations, the backend blocks edits that would
          orphan answers. Say so up front so a blocked save is not a surprise. */}
      {editing && (event.overall_registered_count > 0 || event.total_registered_count > 0) ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            This event already has registrations. You can add fields or options and
            rename labels, but removing a field/option that has answers — or changing
            a field's type — will be blocked to protect collected data.
          </Text>
        </View>
      ) : null}

      <EventCustomFieldsBuilder
        value={form.custom_fields}
        onChange={next => set('custom_fields', next)}
        disabled={busy}
      />

      <View style={styles.activeRow}>
        <View style={styles.flex1}>
          <Text style={styles.activeTitle}>Active</Text>
          <Text style={styles.activeHint}>Inactive events are hidden from registration.</Text>
        </View>
        <Toggle
          checked={form.status}
          onChange={() => set('status', !form.status)}
          disabled={busy}
          tone="accent"
          label="Event is active"
        />
      </View>
    </FormDialog>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginBottom: space(1.5), fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  sectionHint: { marginTop: space(1.5), fontSize: TEXT.xs, color: COLORS.textMuted },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  pill: {
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
  pillOn: { borderColor: COLORS.accent, backgroundColor: 'rgba(255,134,42,0.1)' },
  pillPressed: { opacity: 0.7 },
  pillText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  pillTextOn: { color: COLORS.accent },
  warningBox: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: 'rgba(255,134,42,0.3)',
    backgroundColor: 'rgba(255,134,42,0.1)',
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },
  warningText: { fontSize: TEXT.xs, lineHeight: TEXT.xs * 1.4, color: COLORS.accent },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  flex1: { flex: 1 },
  activeTitle: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  activeHint: { fontSize: TEXT.xs, color: COLORS.textMuted },
});
