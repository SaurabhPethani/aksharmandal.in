import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { COLORS, RADII, SHADOWS, TEXT, WEIGHT, space } from '../../constants/theme';

/**
 * Registrations grouped by the event they belong to — the mobile port of the
 * web's RegistrationsByEvent.jsx (its own phone-card layout, ported directly;
 * the web's wide-screen table has no place on a phone).
 *
 * Groups are collapsible, and the confirmed / denied split is counted per group
 * because that is the number someone actually chases.
 */

/** One registrant's answer to one field, as display text ('—' when unanswered). */
function answerText(answers, field) {
  const v = (answers ?? {})[field.id];
  if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return '—';
  return Array.isArray(v) ? v.join(', ') : String(v);
}

/** Group rows by event, keeping the order the API returned them in. */
function groupByEvent(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.event_id ?? row.event_title ?? 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: row.event_title || (row.event_id ? `Event #${row.event_id}` : 'Unknown event'),
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}

function StatusPill({ confirmed }) {
  return (
    <View style={[styles.statusPill, confirmed ? styles.statusOk : styles.statusBad]}>
      <Text style={[styles.statusText, { color: confirmed ? COLORS.successFg : COLORS.dangerFg }]}>
        {confirmed ? 'Confirmed' : 'Denied'}
      </Text>
    </View>
  );
}

function RegistrationRow({ row, canEdit, busy, onEdit, onCancel, onRestore, fields }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowName} numberOfLines={2}>{row.user_name}</Text>
        <StatusPill confirmed={Boolean(row.status)} />
      </View>

      <Text style={styles.rowMeta} numberOfLines={1}>
        {[row.mobile_number, row.gender, row.age != null ? `${row.age} yrs` : null]
          .filter(Boolean)
          .join('  ·  ') || 'No details on record'}
      </Text>

      {fields.length > 0 ? (
        <View style={styles.answers}>
          {fields.map(f => (
            <Text key={f.id} style={styles.answerText}>
              <Text style={styles.answerLabel}>{f.label}: </Text>
              {answerText(row.custom_answers, f)}
            </Text>
          ))}
        </View>
      ) : null}

      {canEdit ? (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onEdit(row)}
            disabled={busy}
            style={({ pressed }) => [styles.actionBtn, pressed && !busy && styles.actionBtnPressed, busy && styles.disabled]}
          >
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
          {/* A DENIED row gets the opposite action. Cancelling is a status flip
              rather than a delete, and the register endpoint refuses an
              existing (event, mobile) pair whatever its status — so without
              this the row is a dead end and the member can never rejoin. */}
          {!row.status ? (
            <Pressable
              onPress={() => onRestore(row)}
              disabled={busy}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.successBtn,
                pressed && !busy && styles.successBtnPressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.successText}>Register again</Text>
            </Pressable>
          ) : null}
          {row.status ? (
            <Pressable
              onPress={() => onCancel(row)}
              disabled={busy}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.dangerBtn,
                pressed && !busy && styles.dangerBtnPressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.dangerText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function EventGroup({ group, canEdit, busy, onEdit, onCancel, onRestore }) {
  const [open, setOpen] = useState(true);

  const confirmed = group.rows.filter(r => r.status).length;
  const denied = group.rows.length - confirmed;
  const fields = group.rows.find(r => r.event_custom_fields?.length)?.event_custom_fields ?? [];

  return (
    <View style={styles.group}>
      <Pressable
        onPress={() => setOpen(v => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.header}
      >
        <MaterialCommunityIcons
          name={open ? 'chevron-down' : 'chevron-right'}
          size={space(4.5)}
          color={COLORS.textMuted}
        />
        <MaterialCommunityIcons name="calendar-blank-outline" size={space(4)} color={COLORS.primary} />
        <Text style={styles.headerTitle} numberOfLines={1}>{group.title}</Text>
        <View style={styles.headerBadges}>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{group.rows.length} registered</Text>
          </View>
          {confirmed > 0 ? (
            <View style={[styles.countBadge, styles.confirmedBadge]}>
              <Text style={[styles.countBadgeText, { color: COLORS.successFg }]}>{confirmed} confirmed</Text>
            </View>
          ) : null}
          {denied > 0 ? (
            <View style={[styles.countBadge, styles.deniedBadge]}>
              <Text style={[styles.countBadgeText, { color: COLORS.dangerFg }]}>{denied} denied</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      {open ? (
        <View style={styles.rows}>
          {group.rows.map(r => (
            <RegistrationRow
              key={r.id}
              row={r}
              fields={fields}
              canEdit={canEdit}
              busy={busy}
              onEdit={onEdit}
              onCancel={onCancel}
              onRestore={onRestore}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function RegistrationsByEvent({ rows, canEdit, busy, onEdit, onCancel, onRestore }) {
  const groups = useMemo(() => groupByEvent(rows), [rows]);

  return (
    <View style={styles.stack}>
      {groups.map(group => (
        <EventGroup
          key={group.key}
          group={group}
          canEdit={canEdit}
          busy={busy}
          onEdit={onEdit}
          onCancel={onCancel}
          onRestore={onRestore}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(4) },
  group: {
    overflow: 'hidden',
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lineSoft,
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  headerTitle: { flex: 1, minWidth: space(20), fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  headerBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  countBadge: { borderRadius: RADII.full, backgroundColor: COLORS.surface, paddingHorizontal: space(2), paddingVertical: space(0.5) },
  countBadgeText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  confirmedBadge: { backgroundColor: COLORS.successBg },
  deniedBadge: { backgroundColor: COLORS.dangerBg },
  rows: { padding: space(3), gap: space(2) },
  row: {
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: 'rgba(235,240,246,0.5)',
    padding: space(3),
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space(2) },
  rowName: { flex: 1, fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  statusPill: { flexShrink: 0, borderRadius: RADII.full, paddingHorizontal: space(2), paddingVertical: space(0.5) },
  statusOk: { backgroundColor: COLORS.successBg },
  statusBad: { backgroundColor: COLORS.dangerBg },
  statusText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },
  rowMeta: { marginTop: space(1), fontSize: TEXT.xs, color: COLORS.textMuted },
  answers: { marginTop: space(1.5), gap: space(0.5) },
  answerText: { fontSize: TEXT.xs, color: COLORS.textMuted },
  answerLabel: { fontWeight: WEIGHT.semibold, color: COLORS.primary },
  actions: { flexDirection: 'row', gap: space(2), marginTop: space(2.5) },
  actionBtn: {
    flex: 1,
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    backgroundColor: COLORS.surface,
    paddingVertical: space(2),
    alignItems: 'center',
  },
  actionBtnPressed: { backgroundColor: COLORS.primary50 },
  actionText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  successBtn: { borderColor: 'rgba(21,128,61,0.3)' },
  successBtnPressed: { backgroundColor: COLORS.successBg },
  successText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.successFg },
  dangerBtn: { borderColor: 'rgba(185,28,28,0.3)' },
  dangerBtnPressed: { backgroundColor: COLORS.dangerBg },
  dangerText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.dangerFg },
  disabled: { opacity: 0.5 },
});
