import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Button, Card } from '../ui';
import { readDate, readClock } from '../../utils/dates';
import { SPECIAL_TAG_OPTIONS } from '../../utils/attendanceFormSchema';
import { COLORS, RADII, TEXT, TNUM, WEIGHT, space } from '../../constants/theme';

// The attendance landing's cards — the mobile port of AttendancePage's SabhaCard
// / ScheduleCard / RecurringSabhaCard. One card shape across all three tabs so
// moving between them changes what is listed, not how it reads.

const titleOf = row => row?.special_sabha_name || row?.sabha_name || `#${row?.id ?? ''}`;

/** A meta line inside a card — an accent icon and one fact. */
export function CardMeta({ icon, children, tnum = false }) {
  return (
    <View style={styles.meta}>
      <MaterialCommunityIcons name={icon} size={space(3.5)} color={COLORS.accent} />
      <Text numberOfLines={1} style={[styles.metaText, tnum && TNUM]}>
        {children}
      </Text>
    </View>
  );
}

/** "ONGOING ────" — a label and a rule running to the edge. */
export function SectionHeading({ label }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.eyebrow}>{label}</Text>
      <View style={styles.rule} />
    </View>
  );
}

function CountDot({ color }) {
  return <View style={[styles.countDot, { backgroundColor: color }]} />;
}

const CARD_ACTION = { flexGrow: 1, flexBasis: '30%', paddingVertical: space(2) };

/** One sitting — regular or special — as a card. */
export function SabhaCard({ row, canEdit, canMarkAttendance, onEdit, onMark, onReport }) {
  const when = readDate(row?.date);
  const time = readClock(row?.time);
  const isOpen = row?.is_available_for_attendance === true || row?.is_available_for_attendance === 1;
  const showMark = canMarkAttendance && isOpen;
  const isSpecial = row?.type === 'special' || row?.sabha_id == null;

  const followupOnly = row?.followup_total != null;
  const room = row?.turnout ?? row?.present_count ?? 0;
  const own = row?.own_present ?? 0;
  const guests = row?.visitor_present ?? Math.max(0, room - own);

  return (
    <Card style={styles.card}>
      <Text numberOfLines={2} style={styles.title}>
        {titleOf(row)}
        {row?.location ? <Text style={styles.titleMuted}> · {row.location}</Text> : null}
      </Text>

      <View style={styles.metaWrap}>
        {when ? <CardMeta icon="calendar-check" tnum>{when.date}</CardMeta> : null}
        {when ? <CardMeta icon="calendar-blank-outline">{when.day}</CardMeta> : null}
        {time ? <CardMeta icon="clock-outline" tnum>{time}</CardMeta> : null}
        {row?.occurrence_count > 1 ? (
          <CardMeta icon="repeat">Weekly · {row.occurrence_count} sittings</CardMeta>
        ) : null}
        {row?.vakta ? <CardMeta icon="microphone">{row.vakta}</CardMeta> : null}
      </View>

      {row?.topic ? (
        <View style={styles.topicRow}>
          <CardMeta icon="book-open-variant">{row.topic}</CardMeta>
        </View>
      ) : null}

      {/* Turnout line. */}
      {followupOnly ? (
        row.followup_total === 0 ? (
          <Text style={styles.noAssigned}>No members assigned to you</Text>
        ) : (
          <View style={styles.countsRow}>
            <View style={styles.countItem}>
              <CountDot color={row.followup_present ? COLORS.successFg : '#C0CDE0'} />
              <Text style={styles.countNum}>{row.followup_present ?? 0}</Text>
              <Text style={styles.countLabel}>present</Text>
            </View>
            <View style={styles.countItem}>
              <CountDot color="#C0CDE0" />
              <Text style={styles.countNum}>{row.followup_total}</Text>
              <Text style={styles.countLabel}>assigned</Text>
            </View>
          </View>
        )
      ) : (
        <View style={styles.countsRow}>
          {!isSpecial ? (
            <>
              <View style={styles.countItem}>
                <CountDot color={own ? COLORS.successFg : '#C0CDE0'} />
                <Text style={styles.countNum}>{own}</Text>
                <Text style={styles.countLabel}>Present</Text>
              </View>
              <View style={styles.countItem}>
                <CountDot color={guests ? COLORS.accent : '#C0CDE0'} />
                <Text style={styles.countNum}>{guests}</Text>
                <Text style={styles.countLabel}>Other</Text>
              </View>
            </>
          ) : null}
          <View style={styles.countItem}>
            <CountDot color={room ? COLORS.successFg : '#C0CDE0'} />
            <Text style={styles.countNum}>{room}</Text>
            <Text style={styles.countLabel}>Today</Text>
          </View>
        </View>
      )}

      {canEdit || showMark || onReport ? (
        <View style={styles.actions}>
          {showMark ? (
            <Button variant="outline" style={CARD_ACTION} textStyle={styles.actionText} onPress={() => onMark(row)}>
              Mark
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" style={CARD_ACTION} textStyle={styles.actionText} onPress={() => onEdit(row)}>
              Vakta
            </Button>
          ) : null}
          {onReport ? (
            <Button variant="outline" style={CARD_ACTION} textStyle={styles.actionText} onPress={() => onReport(row)}>
              Report
            </Button>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** One recurrence: which Sabha, which weekday, what time. */
export function ScheduleCard({ row, canEdit, onEdit }) {
  const time = readClock(row?.time);
  return (
    <Card style={styles.card}>
      <Text numberOfLines={2} style={styles.title}>
        {row?.sabha_name ?? `#${row?.id ?? ''}`}
        {row?.location ? <Text style={styles.titleMuted}> · {row.location}</Text> : null}
      </Text>
      <View style={styles.metaWrap}>
        {row?.day ? <CardMeta icon="calendar-blank-outline">{row.day}</CardMeta> : null}
        {time ? <CardMeta icon="clock-outline" tnum>{time}</CardMeta> : null}
      </View>
      {canEdit ? (
        <View style={styles.actions}>
          <Button variant="outline" style={CARD_ACTION} textStyle={styles.actionText} onPress={() => onEdit(row)}>
            Edit Schedule
          </Button>
        </View>
      ) : null}
    </Card>
  );
}

const TAG_LABEL = Object.fromEntries(SPECIAL_TAG_OPTIONS.map(o => [o.value, o.label]));

/** One recurring Special Sabha rule — a weekly Category + tag audience. */
export function RecurringSabhaCard({ row, categoryNameById, canEdit, onEdit, onReport }) {
  const time = readClock(row?.time);
  const cats = (row?.user_category ?? []).map(id => categoryNameById[id] || `#${id}`);
  const flags = (row?.target_flags ?? []).map(f => TAG_LABEL[f] || f);
  const active = row?.status !== false;

  return (
    <Card style={styles.card}>
      <View style={styles.recurHead}>
        <Text numberOfLines={2} style={[styles.title, styles.flex1]}>
          {row?.special_sabha_name ?? `#${row?.id ?? ''}`}
        </Text>
        <View style={styles.weeklyPill}>
          <MaterialCommunityIcons name="repeat" size={space(3)} color={COLORS.accent} />
          <Text style={styles.weeklyText}>Weekly</Text>
        </View>
      </View>
      <View style={styles.metaWrap}>
        {row?.day ? <CardMeta icon="calendar-blank-outline">{row.day}</CardMeta> : null}
        {time ? <CardMeta icon="clock-outline" tnum>{time}</CardMeta> : null}
        {!active ? <CardMeta icon="calendar-check">Inactive</CardMeta> : null}
      </View>
      <View style={styles.audience}>
        <CardMeta icon="account-group">{cats.length ? cats.join(', ') : 'All categories'}</CardMeta>
        <CardMeta icon="tag-outline">
          {flags.length ? flags.join(' / ') : 'Any member (no tag filter)'}
        </CardMeta>
      </View>
      {canEdit || onReport ? (
        <View style={styles.actions}>
          {canEdit ? (
            <Button variant="outline" style={CARD_ACTION} textStyle={styles.actionText} onPress={() => onEdit(row)}>
              Edit
            </Button>
          ) : null}
          {onReport ? (
            <Button variant="outline" style={CARD_ACTION} textStyle={styles.actionText} onPress={() => onReport(row)}>
              Report
            </Button>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: space(4), gap: space(3) },
  flex1: { flex: 1 },
  title: { fontSize: TEXT.sm, fontWeight: WEIGHT.bold, lineHeight: TEXT.sm * 1.35, color: COLORS.primary },
  titleMuted: { fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  metaWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2) },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), maxWidth: '100%' },
  metaText: { flexShrink: 1, fontSize: 11, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  topicRow: { flexDirection: 'row' },
  noAssigned: { fontSize: TEXT.xs, fontStyle: 'italic', color: COLORS.textMuted },
  countsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(3.5) },
  countItem: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  countDot: { width: 4, height: 4, borderRadius: 2 },
  countNum: { ...TNUM, fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  countLabel: { fontSize: TEXT.xs, color: COLORS.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2) },
  actionText: { fontSize: TEXT.xs },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  eyebrow: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: COLORS.textMuted,
  },
  rule: { flex: 1, height: 1, backgroundColor: COLORS.line },
  recurHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space(2) },
  weeklyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  weeklyText: { fontSize: 10, fontWeight: WEIGHT.bold, textTransform: 'uppercase', color: COLORS.accent },
  audience: { gap: space(1.5) },
});
