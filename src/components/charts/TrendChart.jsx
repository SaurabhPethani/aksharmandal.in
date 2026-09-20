import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { Text } from '../Typography';
import {
  COLORS,
  RADII,
  SHADOWS,
  TEXT,
  TNUM,
  WEIGHT,
  space,
} from '../../constants/theme';

export const SERIES = [
  { key: 'present', label: 'Present %', color: '#3389C9' },
];

const PAD = { top: 16, right: 16, left: 36 };
/** Keep each week readable; narrow phones can scroll across the full plot. */
const MIN_POINT_WIDTH = 88;
const GRID = [0, 25, 50, 75, 100];
const AXIS_COLOUR = '#9BB5CB';
const GRID_COLOUR = '#E2EAF4';

/** Roughly how wide a label renders at the 10px axis size — an estimate, erring wide. */
const labelWidth = label => String(label ?? '').length * 5.6;

export default function TrendChart({
  points = [],
  series = SERIES,
  height = 260,
  pointLabel = null,
  tooltipExtras = null,
  formatSeriesValue = null,
  hideYAxis = false,
  showTable = false,
  extraColumns = null,
}) {
  /** The week the reader is holding, if any. */
  const [picked, setPicked] = useState(null);
  /** The card's real width, so a touch can be mapped back into viewBox units. */
  const [width, setWidth] = useState(0);
  const chartWidth = Math.max(width, points.length * MIN_POINT_WIDTH, 360);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const innerW = chartWidth - PAD.left - PAD.right;

    // THE LABELS ARE ALWAYS VERTICAL, so a turned label is as tall as it was
    // wide: the space under the plot is the longest label's own length plus a
    // gap rather than a fixed figure.
    const gap = points.length > 1 ? innerW / (points.length - 1) : innerW;
    const widest = Math.max(...points.map(p => labelWidth(p.label)));
    const padBottom = Math.ceil(widest) + 22;
    const innerH = height - PAD.top - padBottom;

    const x = i =>
      PAD.left +
      (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    // Percentages always plot against a fixed 0–100 axis so charts stay comparable.
    const y = v =>
      PAD.top + innerH - (Math.max(0, Math.min(100, v ?? 0)) / 100) * innerH;

    // A null value is "not scored yet" (an upcoming week), NOT zero: the pen
    // lifts, so the line BREAKS there rather than diving to the baseline and
    // drawing a phantom miss.
    const line = key => {
      let d = '';
      let penDown = false;
      points.forEach((p, i) => {
        const v = p[key];
        if (v == null) {
          penDown = false;
          return;
        }
        d += `${penDown ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
        penDown = true;
      });
      return d.trim();
    };

    // The fill runs under the real values only — first to last scored week.
    const real = points
      .map((p, i) => (p[series[0].key] == null ? null : i))
      .filter(i => i != null);
    const baseline = (PAD.top + innerH).toFixed(2);
    const area = real.length
      ? `${line(series[0].key)} L${x(real[real.length - 1]).toFixed(2)},${baseline} L${x(real[0]).toFixed(2)},${baseline} Z`
      : '';

    // Every label, unless even tilted they will not fit — a year of weeks.
    const tickEvery = Math.max(1, Math.ceil(12 / Math.max(gap, 1)));

    return { innerW, innerH, x, y, line, area, padBottom, tickEvery };
  }, [chartWidth, points, height, series]);

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>
          No attendance recorded for this period.
        </Text>
      </View>
    );
  }

  /**
   * THE TABLE IS THE CHART'S EQUAL, not its fallback — the same numbers, read
   * as rows. Values are right-aligned in tabular figures so a column can be
   * scanned; the week is the muted label that qualifies them. The web's in-cell
   * magnitude bar is left out: it is hidden below `sm` there too, where the
   * column is too narrow to be anything but noise beside the figure.
   */
  if (showTable) {
    return (
      <View style={[styles.table, { maxHeight: height }]}>
        {/* THE COLUMNS FIT THE CARD — no sideways scrolling. The rows share the
            width they are given, so nothing is cut off the edge; only the rows
            scroll, under a heading that stays put. */}
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.weekCell]}>Week</Text>
          {extraColumns?.map(c => (
            <Text key={c.header} style={[styles.th, styles.valueCell]}>
              {c.header}
            </Text>
          ))}
          {series.map(s => (
            <Text key={s.key} style={[styles.th, styles.valueCell]}>
              {s.label}
            </Text>
          ))}
        </View>

        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={styles.tableBody}
        >
          {points.map(p => (
            <View key={p.sortKey ?? p.label} style={styles.tr}>
              <Text
                style={[styles.weekText, styles.weekCell]}
                numberOfLines={1}
              >
                {p.rangeLabel ?? p.label}
              </Text>
              {extraColumns?.map(c => (
                <Text
                  key={c.header}
                  style={[styles.cell, styles.valueCell]}
                  numberOfLines={1}
                >
                  {c.cell(p)}
                </Text>
              ))}
              {series.map(s => {
                const custom = formatSeriesValue?.(p, s);
                const value = p[s.key];
                return (
                  <Text
                    key={s.key}
                    style={[styles.cell, styles.valueCell]}
                    numberOfLines={1}
                  >
                    {custom != null
                      ? custom
                      : value == null
                        ? '—'
                        : `${Number(value).toFixed(1)}%`}
                  </Text>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  const { innerW, innerH, x, y, line, area, padBottom, tickEvery } = geometry;
  /** The point each axis label hangs down from, and is rotated about. */
  const axisY = height - padBottom + 12;

  /** Maps a touch back to the nearest week. */
  const pick = event => {
    if (!width) return;
    const vbX = event.nativeEvent.locationX;
    const at =
      points.length === 1
        ? 0
        : Math.round(((vbX - PAD.left) / innerW) * (points.length - 1));
    setPicked(Math.max(0, Math.min(points.length - 1, at)));
  };

  const active = picked == null ? null : points[picked];
  const extras = active && tooltipExtras ? (tooltipExtras(active) ?? []) : [];
  // Anchored at the week, and flipped to the other side past halfway so it
  // never hangs off the right edge.
  const tooltipLeft = (() => {
    if (picked == null || !width) return 0;
    const at = x(picked);
    const flip = picked > points.length / 2;
    return Math.max(
      4,
      Math.min(chartWidth - TOOLTIP_W - 4, flip ? at - TOOLTIP_W - 8 : at + 8),
    );
  })();

  const handleChartPress = event => {
    const { locationX, locationY } = event.nativeEvent;
    if (
      active &&
      locationX >= tooltipLeft &&
      locationX <= tooltipLeft + TOOLTIP_W &&
      locationY >= space(2)
    ) {
      return;
    }
    if (active) {
      setPicked(null);
      return;
    }
    pick(event);
  };

  return (
    <View
      style={{ height }}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        contentContainerStyle={{ minWidth: chartWidth }}
      >
        <View
          style={{ width: chartWidth, height }}
          onStartShouldSetResponder={() => true}
          onResponderRelease={handleChartPress}
        >
          <Svg
            width={chartWidth}
            height={height}
            viewBox={`0 0 ${chartWidth} ${height}`}
            accessibilityRole="image"
            accessibilityLabel="Weekly attendance trend"
          >
            <Defs>
              <LinearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
                <Stop
                  offset="0"
                  stopColor={series[0].color}
                  stopOpacity="0.18"
                />
                <Stop offset="1" stopColor={series[0].color} stopOpacity="0" />
              </LinearGradient>
            </Defs>

            {/* Recessive gridlines and axis labels. */}
            {!hideYAxis &&
              GRID.map(v => (
                <G key={v}>
                  <Line
                    x1={PAD.left}
                    x2={chartWidth - PAD.right}
                    y1={y(v)}
                    y2={y(v)}
                    stroke={GRID_COLOUR}
                    strokeWidth="1"
                  />
                  <SvgText
                    x={PAD.left - 8}
                    y={y(v) + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill={AXIS_COLOUR}
                  >
                    {String(v)}
                  </SvgText>
                </G>
              ))}

            <Path d={area} fill="url(#trend-area)" />
            {/* Comparison lines first, so the subject is drawn over them. Dashed,
            so the two are told apart by shape as well as by colour. */}
            {series.slice(1).map(s => (
              <Path
                key={s.key}
                d={line(s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
            ))}
            <Path
              d={line(series[0].key)}
              fill="none"
              stroke={series[0].color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* The always-visible label above each point — "4/5" over "80.0%".
            Flipped below when the stack would clip the top of the plot. */}
            {pointLabel &&
              points.map((p, i) => {
                const v = p[series[0].key];
                if (v == null) return null;
                const result = pointLabel(p);
                if (result == null || result === '') return null;
                const lines = (
                  Array.isArray(result) ? result : [result]
                ).filter(l => l != null && l !== '');
                if (!lines.length) return null;
                const lineHeight = 11;
                const pointY = y(v);
                const above = pointY - lines.length * lineHeight - 6 >= PAD.top;
                const firstY = above
                  ? pointY - 6 - (lines.length - 1) * lineHeight
                  : pointY + 14;
                return (
                  <G key={`label-${p.sortKey ?? p.label}`}>
                    {lines.map((text, li) => (
                      <SvgText
                        key={li}
                        x={x(i)}
                        y={firstY + li * lineHeight}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill={series[0].color}
                      >
                        {text}
                      </SvgText>
                    ))}
                  </G>
                );
              })}

            {/* A week whose Sabha has not been held: a hollow dashed ring at
            mid-height, neither present nor absent. */}
            {points.map((p, i) => {
              if (p[series[0].key] != null) return null;
              const result = pointLabel ? pointLabel(p) : null;
              const text = Array.isArray(result)
                ? result.find(l => l != null && l !== '')
                : result;
              return (
                <G key={`pending-${p.sortKey ?? p.label}`}>
                  <Circle
                    cx={x(i)}
                    cy={y(50)}
                    r="4"
                    fill={COLORS.surface}
                    stroke={AXIS_COLOUR}
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  {text ? (
                    <SvgText
                      x={x(i)}
                      y={y(50) - 8}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill={AXIS_COLOUR}
                    >
                      {text}
                    </SvgText>
                  ) : null}
                </G>
              );
            })}

            {points.map((p, i) => (
              <G key={p.sortKey ?? p.label}>
                {i % tickEvery === 0 && (
                  /* Anchored at its END and rotated about its own tick, so the
                 label hangs straight down and reads upwards. */
                  <SvgText
                    x={x(i)}
                    y={axisY}
                    textAnchor="end"
                    fontSize="10"
                    fill={AXIS_COLOUR}
                    transform={`rotate(-90 ${x(i)} ${axisY})`}
                  >
                    {p.label}
                  </SvgText>
                )}
                {picked === i && (
                  <>
                    <Line
                      x1={x(i)}
                      x2={x(i)}
                      y1={PAD.top}
                      y2={PAD.top + innerH}
                      stroke={COLORS.lineStrong}
                      strokeWidth="1"
                    />
                    {series.map(s =>
                      p[s.key] == null ? null : (
                        // A surface ring keeps overlapping markers separable.
                        <Circle
                          key={s.key}
                          cx={x(i)}
                          cy={y(p[s.key])}
                          r="5"
                          fill={s.color}
                          stroke={COLORS.surface}
                          strokeWidth="2"
                        />
                      ),
                    )}
                  </>
                )}
              </G>
            ))}
          </Svg>

          {active ? (
            <View style={[styles.tooltip, { left: tooltipLeft }]}>
              <Text style={styles.tooltipTitle}>
                {active.rangeLabel ?? active.label}
              </Text>
              {series.map(s => {
                const raw = active[s.key];
                const custom = formatSeriesValue?.(active, s);
                const display =
                  custom != null
                    ? custom
                    : raw == null
                      ? '—'
                      : `${Number(raw).toFixed(1)}%`;
                return (
                  <View key={s.key} style={styles.tooltipSeries}>
                    <View style={[styles.dot, { backgroundColor: s.color }]} />
                    <Text style={styles.tooltipLabel}>{s.label}: </Text>
                    <Text style={styles.tooltipValue}>{display}</Text>
                  </View>
                );
              })}

              {/* The counts behind the figure above — no colour dot, because these
              are not plotted. */}
              {extras.length ? (
                <View style={styles.tooltipExtras}>
                  {extras.map(e => (
                    <View key={e.label} style={styles.tooltipRow}>
                      <Text style={styles.tooltipLabel}>{e.label}</Text>
                      <Text style={styles.tooltipValue}>{e.value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const TOOLTIP_W = 180;
/** The heading's height; the rows take whatever is left of the card. */
const HEAD_H = 34;

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.line,
    paddingHorizontal: space(6),
  },
  emptyText: {
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  tooltip: {
    position: 'absolute',
    top: space(2),
    width: TOOLTIP_W,
    zIndex: 2,
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    ...SHADOWS.card,
  },
  tooltipTitle: {
    fontSize: 12.33,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  tooltipSeries: {
    marginTop: space(0.5),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tooltipExtras: {
    marginTop: space(1.5),
    gap: space(0.5),
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
    paddingTop: space(1.5),
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(4),
  },
  tooltipLabel: { flexShrink: 1, fontSize: 12.33, color: COLORS.textMuted },
  tooltipValue: {
    ...TNUM,
    fontSize: 12.33,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },

  table: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    overflow: 'hidden',
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: HEAD_H,
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  // .table-th
  th: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    letterSpacing: TEXT.xs * 0.025,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
  // Shrinks to the room under the heading, so the card keeps its cap.
  tableBody: { flexGrow: 0, flexShrink: 1 },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },
  // Shares of the card's width rather than fixed pixels: the week takes the
  // larger share because a full span is the longest thing in a row.
  weekCell: { flex: 1.3, textAlign: 'left' },
  valueCell: { flex: 1, textAlign: 'right' },
  weekText: { fontSize: TEXT.sm, color: COLORS.textMuted },
  cell: {
    ...TNUM,
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
});
