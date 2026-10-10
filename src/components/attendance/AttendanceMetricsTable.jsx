import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../Typography';
import { Card } from '../ui';
import { useAssemblyBroadcast } from '../../hooks/useAttendance';
import { assemblySlots } from '../../utils/assemblyBroadcast';
import { formatNumber } from '../../utils/format';
import { COLORS, RADII, TEXT, TNUM, WEIGHT, space } from '../../constants/theme';

// The Attendance Report's metrics table (regular sittings): each metric as a
// row, compared Current vs Last week, driven by a time-slot selector that
// defaults to Live (the closed/final numbers). The RN port of the web's
// AttendanceMetricsTable — the layout is three columns of Views rather than a
// <table>, but the figures and the slot selector match exactly.

// Nimit Sevak / Yuvak are PRESENT counts here (who attended, by category); Total
// is the roster (the denominator), the same across slots.
const ROWS = [
  { key: 'total', label: 'Total' },
  { key: 'ns', label: 'Nimit Sevak', good: true },
  { key: 'yuvak', label: 'Yuvak', good: true },
  { key: 'present', label: 'Present', good: true },
  { key: 'absent', label: 'Absent', good: false, pct: true },
];

const pctOf = (v, total) => (total > 0 ? Math.round((v / total) * 100) : 0);
const deltaText = (d) => (d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${Math.abs(d)}` : '= 0');

/** Green when the change is an improvement, red when it worsens, muted otherwise. */
function deltaColor(d, good) {
  if (!d || good == null) return COLORS.textMuted;
  return (d > 0) === good ? COLORS.successFg : COLORS.dangerFg;
}

export default function AttendanceMetricsTable({ sabhaDetailId, live }) {
  const slots = useMemo(
    () => assemblySlots({ time: live?.sabha_time, date: live?.date }),
    [live?.sabha_time, live?.date],
  );
  const [view, setView] = useState('live'); // 'live' | slot index

  const slot = typeof view === 'number' ? slots[view] : null;
  const slotQ = useAssemblyBroadcast(sabhaDetailId, { asOf: slot?.asOf, enabled: Boolean(slot) });

  // While a slot is loading, keep showing the Live numbers under a dimmed table.
  const data = slot ? (slotQ.data ?? live) : live;
  const busy = Boolean(slot) && slotQ.isLoading;
  const isLive = view === 'live';

  const lastPresent = isLive ? (data?.last_closed ?? 0) : (data?.last_same_time ?? 0);
  const cur = {
    total: data?.own_total ?? 0,
    ns: data?.ns_present ?? 0,
    yuvak: data?.yuvak_present ?? 0,
    present: data?.own_present ?? 0,
    absent: (data?.own_total ?? 0) - (data?.own_present ?? 0),
  };
  const last = {
    total: data?.last_total ?? 0,
    ns: data?.last_ns_present ?? 0,
    yuvak: data?.last_yuvak_present ?? 0,
    present: lastPresent,
    absent: (data?.last_total ?? 0) - lastPresent,
  };

  const options = [...slots.map((s) => ({ key: s.index, label: s.label })), { key: 'live', label: 'Live' }];

  return (
    <Card clip>
      {/* Slot selector — defaults to Live. The report is only opened for a
          sitting whose date has passed, so every slot is selectable. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.slots}
      >
        {options.map((o) => {
          const active = view === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => setView(o.key)}
              style={[styles.slot, active && styles.slotActive]}
            >
              <Text style={[styles.slotText, active && styles.slotTextActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.table, busy && styles.busy]}>
        <View style={styles.headRow}>
          <Text style={[styles.th, styles.metricCol]}>Metric</Text>
          <Text style={[styles.th, styles.numCol]}>Current</Text>
          <Text style={[styles.th, styles.numCol]}>Last week</Text>
        </View>
        {ROWS.map((r) => {
          const c = cur[r.key];
          const l = last[r.key];
          const d = c - l;
          return (
            <View key={r.key} style={styles.row}>
              <Text style={[styles.metricCol, styles.metricLabel]}>{r.label}</Text>
              <View style={styles.numCol}>
                <Text style={styles.curText}>
                  {formatNumber(c)}
                  {r.key !== 'absent' ? (
                    <Text style={[styles.delta, { color: deltaColor(d, r.good) }]}> ({deltaText(d)})</Text>
                  ) : null}
                  {r.pct ? <Text style={styles.pct}> ({pctOf(c, cur.total)}%)</Text> : null}
                </Text>
              </View>
              <View style={styles.numCol}>
                <Text style={styles.lastText}>
                  {formatNumber(l)}
                  {r.pct ? <Text style={styles.pctMuted}> ({pctOf(l, last.total)}%)</Text> : null}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  slots: {
    flexDirection: 'row',
    gap: space(1.5),
    padding: space(3),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lineSoft,
  },
  slot: {
    borderRadius: RADII.control,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
  slotActive: { backgroundColor: COLORS.primary },
  slotText: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  slotTextActive: { color: COLORS.white },
  table: {},
  busy: { opacity: 0.5 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(3),
    paddingVertical: space(3),
  },
  th: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
  },
  metricCol: { flex: 1.3 },
  numCol: { flex: 1, alignItems: 'flex-end' },
  metricLabel: { fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  curText: { ...TNUM, fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary, textAlign: 'right' },
  lastText: { ...TNUM, fontSize: TEXT.sm, color: COLORS.textMuted, textAlign: 'right' },
  delta: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },
  pct: { fontSize: TEXT.xs, color: COLORS.textMuted },
  pctMuted: { fontSize: TEXT.xs, color: COLORS.textMuted },
});
