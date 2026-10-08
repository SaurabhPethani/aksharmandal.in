import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { RULES } from '../../utils/validation';
import FormDialog from '../FormDialog';
import { Text } from '../Typography';
import { FormField, Input, Select } from '../form';
import { absoluteUrl } from '../../api/client';
import { GENDER_OPTIONS } from '../../utils/userFormSchema';
import { eventsService } from '../../services/eventsService';
import EventAnswerFields, { pruneAnswers, validateAnswers } from './EventAnswerFields';
import { COLORS, RADII, SHADOWS, TEXT, WEIGHT, space } from '../../constants/theme';

/**
 * One event's popup — opened by tapping its card, and the only way into
 * `POST /register-for-events`.
 *
 * The two ways to register are the two TABS. Both post to the same endpoint,
 * which takes an ARRAY and registers atomically: Self sends a single entry, the
 * member form sends as many rows as were filled in. Neither posts per member in
 * a loop — a partial success would leave the caller with no way to tell which
 * rows landed.
 */
const GENDERS = GENDER_OPTIONS;

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
  { key: 'self', label: 'Self Register', hint: 'Register yourself', icon: 'account-plus-outline' },
  { key: 'members', label: 'Member Register', hint: 'Register other members', icon: 'account-group-outline' },
];

function EventSummary({ event }) {
  const when = whenLabel(event.date, event.time);
  const active = event.status !== false;
  const src = absoluteUrl(event.image);

  return (
    <View style={styles.summary}>
      <View style={styles.summaryThumb}>
        {src ? (
          <Image source={{ uri: src }} style={styles.summaryImage} resizeMode="contain" />
        ) : (
          <View style={styles.summaryPlaceholder}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={space(6)} color={COLORS.lineStrong} />
          </View>
        )}
      </View>

      <View style={styles.summaryBody}>
        <View style={styles.summaryHead}>
          <View style={styles.flex1}>
            <Text style={styles.summaryTitle}>{event.title}</Text>
            {event.category ? <Text style={styles.summaryCategory}>{event.category}</Text> : null}
          </View>
          <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}>
            <View style={[styles.badgeDot, { backgroundColor: active ? COLORS.successFg : COLORS.dangerFg }]} />
            <Text style={[styles.badgeText, { color: active ? COLORS.successFg : COLORS.dangerFg }]}>
              {active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        {when || event.location ? (
          <View style={styles.summaryMetaRow}>
            {when ? (
              <View style={styles.line}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={space(3.5)} color={COLORS.textMuted} />
                <Text style={styles.meta}>{when}</Text>
              </View>
            ) : null}
            {event.location ? (
              <View style={styles.line}>
                <MaterialCommunityIcons name="map-marker-outline" size={space(3.5)} color={COLORS.textMuted} />
                <Text style={styles.meta}>{event.location}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {event.description ? <Text style={styles.summaryDescription}>{event.description}</Text> : null}
      </View>
    </View>
  );
}

/**
 * The two registration types, as a segmented control rather than a text tab
 * strip: the point of the popup is that there ARE two, and a row of quiet
 * labels does not say so.
 */
function RegisterTabs({ value, onChange, disabled }) {
  return (
    <View>
      <Text style={styles.eyebrow}>How do you want to register?</Text>
      <View style={styles.tabsGrid}>
        {TABS.map(t => {
          const selected = t.key === value;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              disabled={disabled}
              onPress={() => onChange(t.key)}
              style={({ pressed }) => [
                styles.tabCard,
                selected && styles.tabCardSelected,
                pressed && !disabled && styles.tabCardPressed,
                disabled && styles.disabled,
              ]}
            >
              <View style={[styles.tabIcon, selected && styles.tabIconSelected]}>
                <MaterialCommunityIcons
                  name={t.icon}
                  size={space(4)}
                  color={selected ? COLORS.white : COLORS.textMuted}
                />
              </View>
              <View style={styles.flex1}>
                <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]} numberOfLines={1}>
                  {t.label}
                </Text>
                <Text style={styles.tabHint} numberOfLines={1}>{t.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
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
   * down the rows.
   */
  const [memberErrors, setMemberErrors] = useState([]);

  /**
   * Per-row result of the live mobile probe (`GET /register-for-events/lookup`):
   * `{ loading, registered, autofilled }`, index-aligned with `members`.
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
    setLookups(rows => rows.map((r, idx) => (idx === i ? { ...r, loading: true } : r)));
    try {
      const res = await eventsService.lookupRegistration(event.id, mobile);
      if (lookupSeq.current[i] !== seq) return; // superseded by a newer edit
      const registered = Boolean(res?.registered);
      const u = registered ? null : res?.user || null;
      setLookups(rows =>
        rows.map((r, idx) =>
          idx === i
            ? {
                loading: false,
                registered,
                autofilled: Boolean(u),
                registeredFor: res?.registered_for || null,
                registeredBy: res?.registered_by || null,
              }
            : r,
        ),
      );
      if (u) {
        setMembers(rows =>
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
        setMemberErrors(rows => (rows[i] ? rows.map((r, idx) => (idx === i ? {} : r)) : rows));
      }
    } catch {
      if (lookupSeq.current[i] !== seq) return;
      // A probe failure must never block registering — fall back to manual entry.
      setLookups(rows => rows.map((r, idx) => (idx === i ? { loading: false } : r)));
    }
  };

  const onMobileChange = (i, raw) => {
    const mobile = raw.replace(/\D/g, '').slice(0, 10);
    const wasAutofilled = lookups[i]?.autofilled;
    setMembers(rows =>
      rows.map((r, idx) =>
        idx === i
          ? {
              ...r,
              mobile_number: mobile,
              ...(wasAutofilled
                ? { first_name: '', middle_name: '', last_name: '', gender: '', age: '' }
                : {}),
            }
          : r,
      ),
    );
    setMemberErrors(rows => {
      if (!rows[i]?.mobile_number) return rows;
      const next = [...rows];
      next[i] = { ...next[i], mobile_number: undefined };
      return next;
    });
    setLookups(rows => rows.map((r, idx) => (idx === i ? {} : r)));
    clearTimeout(lookupTimers.current[i]);
    if (mobile.length === 10) {
      lookupTimers.current[i] = setTimeout(() => runLookup(i, mobile), 350);
    }
  };

  // An inactive event has no registration.
  const open = event.status !== false;
  const registerable = canRegister && open;

  const age = ageFromDob(me?.dob);
  const summary = [me?.mobile_number, me?.gender, age == null ? null : `${age} yrs`]
    .filter(Boolean)
    .join(' · ');

  const switchTab = key => {
    if (key === tab) return;
    setTab(key);
    setLocalError(null);
    setMemberErrors([]);
    setLookups(members.map(() => ({})));
    setSelfAnswerErrors({});
    onResetError?.();
  };

  const setMemberAnswers = (i, answers) => {
    setMembers(rows => rows.map((r, idx) => (idx === i ? { ...r, custom_answers: answers } : r)));
    setMemberErrors(rows => {
      if (!rows[i]?.custom) return rows;
      const next = [...rows];
      next[i] = { ...next[i], custom: undefined };
      return next;
    });
  };

  const setMember = (i, name, value) => {
    setMembers(rows => rows.map((r, idx) => (idx === i ? { ...r, [name]: value } : r)));
    setMemberErrors(rows => {
      if (!rows[i]?.[name]) return rows;
      const next = [...rows];
      next[i] = { ...next[i], [name]: undefined };
      return next;
    });
  };

  const addMember = () => {
    setMembers(rows => [...rows, { ...BLANK_MEMBER }]);
    setLookups(rows => [...rows, {}]);
  };
  const removeMember = i => {
    setMembers(rows => rows.filter((_, idx) => idx !== i));
    setMemberErrors(rows => rows.filter((_, idx) => idx !== i));
    setLookups(rows => rows.filter((_, idx) => idx !== i));
  };

  const submitSelf = () => {
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
     * Every row and every field, in one pass — so three blank rows are all
     * reported at once rather than one submit at a time.
     */
    const found = members.map((m, i) => {
      const row = {};
      if (lookups[i]?.registered) {
        row.mobile_number = 'This mobile is already registered for this event.';
        return row;
      }
      for (const f of ['first_name', 'middle_name', 'last_name']) {
        if (!String(m[f] ?? '').trim()) row[f] = 'This field is required.';
        else {
          const bad = RULES.personName(m[f]);
          if (bad) row[f] = bad;
        }
      }
      const mobile = String(m.mobile_number ?? '').trim();
      if (!mobile) row.mobile_number = 'This field is required.';
      else if (!/^\d{10}$/.test(mobile)) row.mobile_number = 'Enter exactly 10 digits.';

      const answerErrs = validateAnswers(customFields, m.custom_answers);
      if (Object.keys(answerErrs).length) row.custom = answerErrs;
      return row;
    });

    if (found.some(row => Object.keys(row).length)) {
      setMemberErrors(found);
      setLocalError(null);
      return;
    }
    setMemberErrors([]);
    setLocalError(null);

    onSubmit(
      members.map(m => {
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
      }),
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

      {!canRegister ? (
        <Text style={styles.plainNote}>
          Your role does not grant the <Text style={styles.strong}>Events · Register</Text> action,
          so this event can only be viewed.
        </Text>
      ) : null}

      {canRegister && !open ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>This event is inactive, so registration is closed.</Text>
        </View>
      ) : null}

      {registerable ? (
        <>
          <RegisterTabs value={tab} onChange={switchTab} disabled={busy} />

          {isSelf ? (
            <>
              <View style={styles.selfBox}>
                <Text style={styles.eyebrow}>Registering yourself</Text>
                <Text style={styles.selfName}>
                  {[me?.first_name, me?.middle_name, me?.last_name].filter(Boolean).join(' ') || '—'}
                </Text>
                {summary ? <Text style={styles.meta}>{summary}</Text> : null}
              </View>
              {customFields.length > 0 ? (
                <View style={styles.answersBox}>
                  <EventAnswerFields
                    fields={customFields}
                    value={selfAnswers}
                    onChange={setSelfAnswers}
                    errors={selfAnswerErrors}
                    disabled={busy}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <>
              {members.map((m, i) => {
                const lk = lookups[i] || {};
                const locked = Boolean(lk.autofilled) && !lk.registered;
                const mobileError = lk.registered
                  ? `Already registered${lk.registeredFor ? ` for ${lk.registeredFor}` : ''}` +
                    `${lk.registeredBy ? ` by ${lk.registeredBy}` : ''}.`
                  : memberErrors[i]?.mobile_number;
                return (
                  <View key={i} style={styles.memberCard}>
                    <View style={styles.memberHead}>
                      <Text style={styles.eyebrow}>Member {i + 1}</Text>
                      {members.length > 1 ? (
                        <Pressable onPress={() => removeMember(i)} disabled={busy}>
                          <View style={styles.removeRow}>
                            <MaterialCommunityIcons name="trash-can-outline" size={space(3.5)} color={COLORS.dangerFg} />
                            <Text style={styles.removeText}>Remove</Text>
                          </View>
                        </Pressable>
                      ) : null}
                    </View>

                    <View style={styles.memberFields}>
                      <FormField label="Mobile Number" required compact error={mobileError}>
                        <Input
                          value={m.mobile_number}
                          error={mobileError}
                          onChangeText={next => onMobileChange(i, next)}
                          placeholder="10 digits"
                          inputMode="numeric"
                        />
                        {lk.loading ? (
                          <View style={styles.probeRow}>
                            <ActivityIndicator size="small" color={COLORS.textMuted} />
                            <Text style={styles.probeText}>Checking…</Text>
                          </View>
                        ) : null}
                        {locked ? (
                          <View style={styles.probeRow}>
                            <MaterialCommunityIcons name="check-circle" size={space(3.5)} color={COLORS.successFg} />
                            <Text style={[styles.probeText, { color: COLORS.successFg }]}>
                              Member found — details filled in below.
                            </Text>
                          </View>
                        ) : null}
                      </FormField>

                      <View style={styles.nameGrid}>
                        {[
                          ['first_name', 'First Name'],
                          ['middle_name', 'Middle Name'],
                          ['last_name', 'Last Name'],
                        ].map(([f, label]) => (
                          <FormField key={f} label={label} required compact error={memberErrors[i]?.[f]}>
                            <Input
                              value={m[f]}
                              error={memberErrors[i]?.[f]}
                              onChangeText={next => setMember(i, f, next)}
                              editable={!locked}
                            />
                          </FormField>
                        ))}
                      </View>

                      <View style={styles.pairGrid}>
                        <View style={styles.flex1}>
                          <FormField label="Gender" compact>
                            <Select
                              value={m.gender}
                              placeholder="Select"
                              options={GENDERS}
                              onChange={next => setMember(i, 'gender', next)}
                              disabled={locked}
                            />
                          </FormField>
                        </View>
                        <View style={styles.flex1}>
                          <FormField label="Age" compact>
                            <Input
                              value={m.age}
                              onChangeText={next => setMember(i, 'age', next.replace(/\D/g, '').slice(0, 3))}
                              inputMode="numeric"
                              editable={!locked}
                            />
                          </FormField>
                        </View>
                      </View>

                      {customFields.length > 0 ? (
                        <View style={styles.memberAnswers}>
                          <EventAnswerFields
                            fields={customFields}
                            value={m.custom_answers}
                            onChange={next => setMemberAnswers(i, next)}
                            errors={memberErrors[i]?.custom}
                            disabled={busy}
                          />
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}

              <Pressable
                onPress={addMember}
                disabled={busy}
                style={({ pressed }) => [
                  styles.addMember,
                  pressed && !busy && styles.addMemberPressed,
                  busy && styles.disabled,
                ]}
              >
                <Text style={styles.addMemberText}>+ Add another member</Text>
              </Pressable>
            </>
          )}
        </>
      ) : null}
    </FormDialog>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  disabled: { opacity: 0.5 },
  summary: {
    flexDirection: 'row',
    gap: space(3),
    borderRadius: RADII.control,
    backgroundColor: COLORS.bg,
    padding: space(3),
  },
  summaryThumb: {
    width: space(16),
    height: space(16),
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
  },
  summaryImage: { width: '100%', height: '100%' },
  summaryPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summaryBody: { flex: 1, minWidth: 0, gap: space(1.5) },
  summaryHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2) },
  summaryTitle: { fontSize: TEXT.base, fontWeight: WEIGHT.bold, color: COLORS.primary },
  summaryCategory: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.accent },
  summaryMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  summaryDescription: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.3, color: COLORS.textFaint },
  line: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  meta: { fontSize: TEXT.sm, color: COLORS.textMuted },
  badge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    borderRadius: RADII.full,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  badgeActive: { backgroundColor: COLORS.successBg },
  badgeInactive: { backgroundColor: COLORS.dangerBg },
  badgeDot: { width: space(1.5), height: space(1.5), borderRadius: RADII.full },
  badgeText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },
  plainNote: { fontSize: TEXT.sm, color: COLORS.textMuted },
  strong: { fontWeight: WEIGHT.semibold, color: COLORS.primary },
  infoBox: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  infoText: { fontSize: TEXT.sm, color: COLORS.textMuted },
  eyebrow: {
    marginBottom: space(2),
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: COLORS.textMuted,
  },
  tabsGrid: { gap: space(2) },
  tabCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    borderRadius: RADII.control,
    borderWidth: 2,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    padding: space(3),
  },
  tabCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary50, ...SHADOWS.card },
  tabCardPressed: { opacity: 0.85 },
  tabIcon: {
    width: space(9),
    height: space(9),
    flexShrink: 0,
    borderRadius: RADII.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  tabIconSelected: { backgroundColor: COLORS.primary },
  tabLabel: { fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.textMuted },
  tabLabelSelected: { color: COLORS.primary },
  tabHint: { fontSize: TEXT.xs, color: COLORS.textFaint },
  selfBox: {
    borderRadius: RADII.control,
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  selfName: { fontSize: TEXT.base, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  answersBox: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  memberCard: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    padding: space(4),
    gap: space(3),
  },
  memberHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  removeRow: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  removeText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.dangerFg },
  memberFields: { gap: space(3) },
  probeRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), marginTop: space(1) },
  probeText: { fontSize: TEXT.xs, color: COLORS.textMuted },
  nameGrid: { gap: space(3) },
  pairGrid: { flexDirection: 'row', gap: space(3) },
  memberAnswers: { borderTopWidth: 1, borderTopColor: COLORS.lineSoft, paddingTop: space(3) },
  addMember: {
    borderRadius: RADII.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.lineStrong,
    paddingVertical: space(3),
    alignItems: 'center',
  },
  addMemberPressed: { backgroundColor: COLORS.primary50 },
  addMemberText: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
});
