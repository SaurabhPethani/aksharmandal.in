import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { useQueries } from '@tanstack/react-query';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Card } from '../ui';
import { attendanceService } from '../../services/attendanceService';
import { assemblySlots } from '../../utils/assemblyBroadcast';
import { formatNumber } from '../../utils/format';
import { COLORS, RADII, TEXT, TNUM, WEIGHT, space } from '../../constants/theme';

// The whole assembly at a glance — Present across every slot (9:30 · … · Final),
// a stacked bar per slot (Nimit Sevak bottom + Yuvak top) by default, with a
// toggle to the table. The RN port of the web's AttendanceProgressionTable, drawn
// with react-native-svg; the bar maths and the per-slot fetch strategy match.

const NS_COLOR = '#D96A0A';
const YUVAK_COLOR = '#3389C9';

const TABLE_ROWS = [
  { key: 'total', label: 'Total', get: (d) => d.own_total },
  { key: 'ns', label: 'Nimit Sevak', get: (d) => d.ns_present },
  { key: 'yuvak', label: 'Yuvak', get: (d) => d.yuvak_present },
  { key: 'present', label: 'Present', get: (d) => d.own_present, strong: true },
  { key: 'absent', label: 'Absent', get: (d) => d.own_total - d.own_present },
];

const PAD = { top: 24, right: 14, left: 40, bottom: 64 };
const GRID = [0, 0.25, 0.5, 0.75, 1];
const HEIGHT = 300;

function ProgressionChart({ points, maxScale }) {
  const [width, setWidth] = useState(0);
  const W = Math.max(300, width || 320);

  const innerW = W - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const n = points.length || 1;
  const step = innerW / n;
  const barW = Math.min(64, step * 0.6);
  const cx = (i) => PAD.left + step * i + step / 2;
  const y = (v) => PAD.top + innerH - (v / maxScale) * innerH;
  const bottom = PAD.top + innerH;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${W} ${HEIGHT}`}>
          {GRID.map((f) => {
            const v = maxScale * f;
            return (
              <G key={f}>
                <Line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#E2EAF4" strokeWidth="1" />
                <SvgText x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#9BB5CB">
                  {Math.round(v)}
                </SvgText>
              </G>
            );
          })}

          {points.map((p, i) => {
            const hasData = p.present != null;
            const nsH = hasData ? bottom - y(p.ns) : 0;
            const yuvakH = hasData ? bottom - y(p.yuvak) : 0;
            const x = cx(i) - barW / 2;
            return (
              <G key={p.label}>
                {hasData ? (
                  <>
                    <Rect x={x} y={bottom - nsH} width={barW} height={nsH} fill={NS_COLOR} />
                    <Rect x={x} y={bottom - nsH - yuvakH} width={barW} height={yuvakH} fill={YUVAK_COLOR} />
                    {nsH >= 16 ? (
                      <SvgText x={cx(i)} y={bottom - nsH / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#FFFFFF">
                        {p.ns}
                      </SvgText>
                    ) : null}
                    {yuvakH >= 16 ? (
                      <SvgText x={cx(i)} y={bottom - nsH - yuvakH / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#FFFFFF">
                        {p.yuvak}
                      </SvgText>
                    ) : null}
                    <SvgText x={cx(i)} y={bottom - nsH - yuvakH - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill={COLORS.primary}>
                      {p.present}
                    </SvgText>
                  </>
                ) : (
                  <SvgText x={cx(i)} y={bottom - 6} textAnchor="middle" fontSize="11" fill="#9BB5CB">…</SvgText>
                )}
                {/* Vertical time labels beneath the axis — six slots would overlap
                    horizontally on a phone. */}
                <SvgText
                  x={cx(i)}
                  y={bottom + 12}
                  textAnchor="end"
                  fontSize="11"
                  fill="#6B7FA3"
                  transform={`rotate(-90 ${cx(i)} ${bottom + 12})`}
                >
                  {p.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: YUVAK_COLOR }]} />
          <Text style={styles.legendText}>Yuvak</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: NS_COLOR }]} />
          <Text style={styles.legendText}>Nimit Sevak</Text>
        </View>
      </View>
    </View>
  );
}

export default function AttendanceProgressionTable({ sabhaDetailId, live }) {
  const slots = useMemo(
    () => assemblySlots({ time: live?.sabha_time, date: live?.date }),
    [live?.sabha_time, live?.date],
  );
  const [showTable, setShowTable] = useState(false);

  const results = useQueries({
    queries: slots.map((s) => ({
      queryKey: ['assembly-broadcast', sabhaDetailId ?? null, s.asOf],
      queryFn: () => attendanceService.broadcast(sabhaDetailId, { asOf: s.asOf }),
      enabled: Boolean(sabhaDetailId),
      retry: false,
    })),
  });

  const columns = useMemo(
    () => [
      ...slots.map((s, i) => ({ label: s.label, data: results[i]?.data, loading: results[i]?.isLoading })),
      { label: 'Final', data: live, loading: false },
    ],
    [slots, results, live],
  );

  const points = columns.map((c) => ({
    label: c.label,
    present: c.data ? c.data.own_present : null,
    ns: c.data ? c.data.ns_present : null,
    yuvak: c.data ? c.data.yuvak_present : null,
  }));

  const peak = Math.max(0, ...points.map((p) => p.present ?? 0));
  const maxScale = Math.max(10, Math.ceil(peak / 10) * 10);

  return (
    <Card clip>
      <View style={styles.head}>
        <View style={styles.headCopy}>
          <Text style={styles.title}>Attendance progression</Text>
          <Text style={styles.subtitle}>Present through the assembly, split by Nimit Sevak / Yuvak.</Text>
        </View>
        <Pressable onPress={() => setShowTable((v) => !v)} style={styles.toggle}>
          <MaterialCommunityIcons name={showTable ? 'chart-bar' : 'table'} size={space(3.5)} color={COLORS.textMuted} />
          <Text style={styles.toggleText}>{showTable ? 'Show chart' : 'Show table'}</Text>
        </Pressable>
      </View>

      {showTable ? (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={styles.tHeadRow}>
              <Text style={[styles.tTh, styles.metricCol]}>Metric</Text>
              {columns.map((c) => (
                <Text key={c.label} style={[styles.tTh, styles.tNumCol]}>{c.label}</Text>
              ))}
            </View>
            {TABLE_ROWS.map((r) => (
              <View key={r.key} style={styles.tRow}>
                <Text style={[styles.metricCol, styles.tMetric]}>{r.label}</Text>
                {columns.map((c) => (
                  <Text
                    key={c.label}
                    style={[styles.tNumCol, styles.tCell, r.strong ? styles.tCellStrong : styles.tCellMuted]}
                  >
                    {c.data ? formatNumber(r.get(c.data)) : c.loading ? '…' : '—'}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.chartWrap}>
          <ProgressionChart points={points} maxScale={maxScale} />
        </View>
      )}
    </Card>
  );
}

const CELL_W = space(18);

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(2),
    paddingHorizontal: space(5),
    paddingVertical: space(3),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lineSoft,
  },
  headCopy: { flex: 1 },
  title: { fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  subtitle: { marginTop: space(0.5), fontSize: TEXT.xs, color: COLORS.textMuted },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  toggleText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  chartWrap: { padding: space(4) },
  legend: {
    marginTop: space(2),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(5),
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  legendSwatch: { width: space(2.5), height: space(2.5), borderRadius: 2 },
  legendText: { fontSize: TEXT.xs, fontWeight: WEIGHT.medium, color: COLORS.textMuted },
  tHeadRow: { flexDirection: 'row', paddingHorizontal: space(4), paddingVertical: space(3.5) },
  tTh: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted, textTransform: 'uppercase' },
  tRow: {
    flexDirection: 'row',
    paddingHorizontal: space(4),
    paddingVertical: space(3.5),
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
  },
  metricCol: { width: space(28) },
  tNumCol: { width: CELL_W, textAlign: 'right' },
  tMetric: { fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  tCell: { ...TNUM, fontSize: TEXT.sm },
  tCellStrong: { fontWeight: WEIGHT.bold, color: COLORS.primary },
  tCellMuted: { fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
});
