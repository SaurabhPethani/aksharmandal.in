import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../Typography';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../ui';
import { Breadcrumbs } from '../Navigation';
import { useAssemblyBroadcast } from '../../hooks/useAttendance';
import { readDate } from '../../utils/dates';
import { formatNumber } from '../../utils/format';
import { COLORS, RADII, TEXT, TNUM, WEIGHT, space } from '../../constants/theme';

// A sitting's attendance report — the live / final broadcast metrics for a
// regular sitting, read-only. The web report also carries per-slot progression
// and per-head WhatsApp tables (Reports module); on mobile this shows the core
// counts the assembly broadcast endpoint returns, which needs no separate
// reports service. A Special sitting's broadcast 400s, so it shows a plain
// "not available" state rather than an error.

function MetricRow({ label, present, total }) {
  const pct = total > 0 ? Math.round((present / total) * 100) : null;
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValue}>
        <Text style={styles.metricNum}>
          {formatNumber(present)}
          {total != null ? <Text style={styles.metricTotal}> / {formatNumber(total)}</Text> : null}
        </Text>
        {pct != null ? <Text style={styles.metricPct}>{pct}%</Text> : null}
      </View>
    </View>
  );
}

export default function ReportView({ sabha, onBack }) {
  const [tab, setTab] = useState('live'); // live | final
  const id = sabha?.id ?? null;
  const q = useAssemblyBroadcast(id, { final: tab === 'final' });
  const d = q.data ?? null;

  const when = readDate(sabha?.date);
  const title = sabha?.special_sabha_name || sabha?.sabha_name || 'Attendance Report';

  return (
    <View style={styles.stack}>
      <PageHeader
        title="Attendance Report"
        subtitle={title}
        breadcrumbs={
          <Breadcrumbs items={[{ label: 'Attendance', onPress: onBack }, { label: 'Report' }]} onHome={onBack} />
        }
      />

      <View style={styles.segmented}>
        {[
          { key: 'live', label: 'Live' },
          { key: 'final', label: 'Final' },
        ].map(o => (
          <Pressable
            key={o.key}
            onPress={() => setTab(o.key)}
            style={[styles.segment, tab === o.key && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, tab === o.key && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      <Card>
        {q.isLoading ? (
          <Skeleton style={styles.skeleton} />
        ) : q.error ? (
          <EmptyState
            icon="chart-bar"
            title="Report not available"
            hint="Live metrics are produced for regular sittings. A special sitting has no assembly report."
          />
        ) : !d ? (
          <ErrorState onRetry={q.refetch} title="Could not load the report" />
        ) : (
          <View style={styles.report}>
            <Text style={styles.reportTitle}>{title}</Text>
            {when ? <Text style={styles.reportDate}>{when.date} · {when.day}</Text> : null}
            <View style={styles.metrics}>
              <MetricRow label="Yuvak" present={d.yuvak_present} total={d.yuvak_total} />
              <MetricRow label="Nimit Sevak" present={d.ns_present} total={d.ns_total} />
              <MetricRow label="This Sabha" present={d.own_present} total={d.own_total} />
              <MetricRow label="Other Sabha" present={d.other_present} total={null} />
              <View style={styles.totalRow}>
                <MetricRow label="Total present" present={d.total_present} total={null} />
              </View>
              {d.focus_total != null ? (
                <MetricRow label="Focus 36 present" present={d.focus_present ?? 0} total={d.focus_total} />
              ) : null}
            </View>
            {tab === 'final' && d.last_closed != null ? (
              <Text style={styles.compare}>
                vs last Sabha: {formatNumber(d.today_closed)} / {formatNumber(d.last_closed)}
              </Text>
            ) : null}
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(5) },
  segmented: {
    flexDirection: 'row',
    gap: space(1),
    alignSelf: 'flex-start',
    borderRadius: RADII['2xl'],
    backgroundColor: 'rgba(229,238,245,0.7)',
    padding: space(1),
  },
  segment: { borderRadius: RADII.xl, paddingHorizontal: space(5), paddingVertical: space(2) },
  segmentActive: { backgroundColor: COLORS.surface },
  segmentText: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  segmentTextActive: { color: COLORS.primary },
  skeleton: { height: space(40), width: '100%' },
  report: { gap: space(2) },
  reportTitle: { fontSize: TEXT.base, fontWeight: WEIGHT.bold, color: COLORS.primary },
  reportDate: { fontSize: TEXT.sm, color: COLORS.textMuted },
  metrics: { marginTop: space(2), gap: space(1) },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space(2),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lineSoft,
  },
  metricLabel: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  metricValue: { flexDirection: 'row', alignItems: 'baseline', gap: space(2) },
  metricNum: { ...TNUM, fontSize: TEXT.base, fontWeight: WEIGHT.bold, color: COLORS.primary },
  metricTotal: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  metricPct: {
    ...TNUM,
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
    backgroundColor: COLORS.primary50,
    borderRadius: RADII.full,
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  totalRow: { backgroundColor: 'rgba(229,238,245,0.5)', borderRadius: RADII.control, paddingHorizontal: space(2) },
  compare: { marginTop: space(3), fontSize: TEXT.sm, color: COLORS.textMuted },
});
