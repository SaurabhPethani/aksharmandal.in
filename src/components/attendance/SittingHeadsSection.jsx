import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Card, ErrorState, Skeleton } from '../ui';
import { useSittingReportHeads } from '../../hooks/useReports';
import { useMe } from '../../hooks/useLookups';
import { useToast } from '../../hooks/core';
import { readPersonRow, weekLabel, isPresent, presentCount } from '../../utils/reportFilters';
import { buildFullMessage, buildAbsentMessage, openSabhaWhatsApp } from '../../utils/sabhaWhatsapp';
import { COLORS, RADII, TEXT, TNUM, WEIGHT, space } from '../../constants/theme';

// Per follow-up head, with their members' present/absent across the last 4
// SITTINGS (this sitting live + the prior three), and the two WhatsApp buttons.
// Reads live attendance, so a mark made right now is reflected. The RN port of
// the web's SittingHeadsSection — the wide table becomes a stack of head blocks
// with a horizontally-scrollable P/A strip, which reads on a phone.

const WA_META = {
  periodLabel: 'Sitting of',
  trendLabel: 'Last 4 sittings',
  liveSuffix: ' (live)',
  presentThis: 'this sitting',
};

function WhatsAppBtn({ label, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.waBtn}>
      <MaterialCommunityIcons name="whatsapp" size={space(3.5)} color="#128C7E" />
      <Text style={styles.waText}>{label}</Text>
    </Pressable>
  );
}

function ColChip({ label, children, tone }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={[styles.chipValue, tone === 'present' && styles.present, tone === 'absent' && styles.absent]}>
        {children}
      </Text>
    </View>
  );
}

function HeadBlock({ raw, columns, sabhaName, senderName }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const person = readPersonRow(raw);
  const members = (raw.members ?? []).map(readPersonRow).filter(Boolean);

  const send = async (kind) => {
    const meta = { sabhaName, columns, senderName, ...WA_META };
    const msg = kind === 'absent' ? buildAbsentMessage(person, members, meta) : buildFullMessage(person, members, meta);
    const ok = await openSabhaWhatsApp(person.whatsapp || person.mobile, msg);
    if (!ok) toast.info(`No number on file for ${person.name} — pick the contact in WhatsApp.`);
  };

  return (
    <View style={styles.head}>
      <Pressable onPress={() => members.length && setOpen((v) => !v)} style={styles.headRow}>
        {members.length > 0 ? (
          <MaterialCommunityIcons
            name={open ? 'chevron-down' : 'chevron-right'}
            size={space(5)}
            color={COLORS.primary}
          />
        ) : (
          <View style={{ width: space(5) }} />
        )}
        <Text style={styles.headName} numberOfLines={1}>{person.name}</Text>
        <Text style={styles.memberCount}>
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </Text>
      </Pressable>

      {members.length > 0 ? (
        <View style={styles.waRow}>
          <WhatsAppBtn label="Absent" onPress={() => send('absent')} />
          <WhatsAppBtn label="Full" onPress={() => send('full')} />
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colStrip}>
        {columns.map((c, i) => (
          <ColChip key={c} label={`${weekLabel(c)}${i === 0 ? ' •' : ''}`}>
            {presentCount(members, c)}
          </ColChip>
        ))}
      </ScrollView>

      {open ? (
        <View style={styles.members}>
          {members.length === 0 ? (
            <Text style={styles.muted}>No members assigned.</Text>
          ) : (
            members.map((m) => (
              <View key={m.userId} style={styles.memberRow}>
                <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.memberRatio}>{m.present}/{m.total || columns.length}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paStrip}>
                  {columns.map((c) => (
                    <Text
                      key={c}
                      style={[styles.pa, isPresent(m, c) ? styles.present : styles.absent]}
                    >
                      {isPresent(m, c) ? 'P' : 'A'}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function SittingHeadsSection({ sabhaDetailId }) {
  const q = useSittingReportHeads(sabhaDetailId);
  const meQ = useMe();
  const senderName = meQ.data
    ? (meQ.data.user_name || [meQ.data.first_name, meQ.data.last_name].filter(Boolean).join(' ') || '').trim()
    : '';

  const d = q.data;
  // Special / Mandal sittings have no single follow-up-head roster — render nothing.
  if (!q.isLoading && (!d || d.sabha_id == null)) return null;

  const columns = d?.columns ?? [];
  const heads = (d?.users ?? []).filter((u) => Array.isArray(u.members));

  return (
    <Card clip>
      <View style={styles.cardHead}>
        <View style={styles.cardHeadCopy}>
          <Text style={styles.cardTitle}>Follow-up heads · last {columns.length || 4} sittings</Text>
          <Text style={styles.cardSubtitle}>
            Live — this sitting plus the previous ones. Send each head their list on WhatsApp.
          </Text>
        </View>
        <View style={styles.liveBadge}>
          <Text style={styles.liveText}>● LIVE</Text>
        </View>
      </View>

      {q.isLoading ? (
        <View style={styles.pad}><Skeleton style={{ height: space(24), width: '100%' }} /></View>
      ) : q.error ? (
        <View style={styles.pad}>
          <ErrorState error={q.error} onRetry={q.refetch} title="Could not load heads" />
        </View>
      ) : heads.length === 0 ? (
        <Text style={styles.emptyLine}>No follow-up heads for this Sabha.</Text>
      ) : (
        <View>
          {heads.map((raw) => (
            <HeadBlock
              key={raw.user_id}
              raw={raw}
              columns={columns}
              sabhaName={d.sabha_name}
              senderName={senderName}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space(2),
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lineSoft,
  },
  cardHeadCopy: { flex: 1 },
  cardTitle: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  cardSubtitle: { marginTop: space(0.5), fontSize: TEXT.xs, color: COLORS.textMuted },
  liveBadge: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.successBg,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  liveText: { fontSize: TEXT.xs, fontWeight: WEIGHT.bold, color: COLORS.successFg },
  pad: { padding: space(4) },
  emptyLine: { paddingHorizontal: space(4), paddingVertical: space(6), fontSize: TEXT.sm, color: COLORS.textMuted },
  head: {
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
    gap: space(2),
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  headName: { flex: 1, fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  memberCount: { fontSize: TEXT.xs, color: COLORS.textMuted },
  waRow: { flexDirection: 'row', gap: space(2), paddingLeft: space(7) },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: '#25D366',
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  waText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: '#128C7E' },
  colStrip: { flexDirection: 'row', gap: space(2), paddingLeft: space(7) },
  chip: {
    alignItems: 'center',
    borderRadius: RADII.lg,
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    minWidth: space(13),
  },
  chipLabel: { fontSize: 10, color: COLORS.textMuted },
  chipValue: { ...TNUM, fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  members: { paddingLeft: space(7), gap: space(1.5), marginTop: space(1) },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
    paddingTop: space(1.5),
  },
  memberName: { flex: 1, fontSize: TEXT.sm, color: COLORS.primary },
  memberRatio: { ...TNUM, fontSize: TEXT.xs, color: COLORS.textMuted, minWidth: space(10), textAlign: 'right' },
  paStrip: { flexDirection: 'row', gap: space(1.5) },
  pa: { ...TNUM, width: space(5), textAlign: 'center', fontSize: TEXT.sm, fontWeight: WEIGHT.bold },
  present: { color: COLORS.successFg },
  absent: { color: COLORS.dangerFg },
  muted: { fontSize: TEXT.sm, color: COLORS.textMuted },
});
