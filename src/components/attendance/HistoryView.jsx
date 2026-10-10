import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text, TextInput } from '../Typography';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '../ui';
import { Breadcrumbs } from '../Navigation';
import { DatePicker, FormField, Select } from '../form';
import { attendanceService } from '../../services/attendanceService';
import { searchMatches } from '../../utils/options';
import { COLORS, RADII, TEXT, TNUM, WEIGHT, space } from '../../constants/theme';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const todayIstIso = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

const initials = name =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

const epoch = iso => new Date(String(iso).replace(/(\.\d{3})\d+/, '$1')).getTime();

const clock = (hms, sec = true) => {
  const [h, m, s] = String(hms || '').split(':').map(Number);
  if (Number.isNaN(h)) return hms || '';
  const suffix = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')}${sec ? `:${String(s ?? 0).padStart(2, '0')}` : ''} ${suffix}`;
};

const shortDate = iso => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return String(iso).slice(0, 10);
  }
};

const stampOf = (ev, sittingDate, sec = true) =>
  `${String(ev.at).slice(0, 10) !== sittingDate ? `${shortDate(ev.at)} ` : ''}${clock(ev.time, sec)}`;

const sittingClock = hhmm => (hhmm ? clock(`${hhmm}:00`, false) : '');

const FIVE_MIN = 5 * 60 * 1000;
const PX_PER_TICK = 40;
const MARKER_OFFSETS_MIN = [15, 30, 45, 60, 75, 90, 105, 120];
const H = 240;
const PAD = { top: 30, right: 20, bottom: 34, left: 34 };

function MarkChip({ ev, sittingDate }) {
  const present = Number(ev.status) === 1;
  const by = ev.marked_by_name ? ` by ${ev.marked_by_name}` : '';
  if (ev.kind === 'repeat') {
    return (
      <View style={[styles.chip, styles.chipRepeat]}>
        <Text style={styles.chipRepeatText}>{`repeat ${stampOf(ev, sittingDate)}${by}`}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.chip, present ? styles.chipPresent : styles.chipAbsent]}>
      <Text style={[styles.chipText, present ? styles.chipPresentText : styles.chipAbsentText]}>
        {`${present ? 'Present' : 'Absent'} ${stampOf(ev, sittingDate)}${by}`}
      </Text>
    </View>
  );
}

function ArrivalCurve({ sitting, curve }) {
  const [containerW, setContainerW] = useState(320);

  const dayPts = useMemo(
    () => curve.filter(p => String(p.at).slice(0, 10) === sitting.date && Number.isFinite(epoch(p.at))),
    [curve, sitting.date],
  );
  const laterPts = curve.length - dayPts.length;

  const geo = useMemo(() => {
    const times = dayPts.map(p => epoch(p.at));
    if (!times.length) return null;
    const startMs = /^\d{1,2}:\d{2}/.test(String(sitting.time || ''))
      ? epoch(`${sitting.date}T${String(sitting.time).slice(0, 5)}:00+05:30`)
      : NaN;
    const markers = Number.isFinite(startMs)
      ? MARKER_OFFSETS_MIN.map(off => {
          const ms = startMs + off * 60 * 1000;
          let present = 0;
          for (let i = 0; i < times.length && times[i] <= ms; i += 1) present = dayPts[i].present;
          const d = new Date(ms + IST_OFFSET_MS);
          const h = d.getUTCHours();
          const m = d.getUTCMinutes();
          return { ms, present, label: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}` };
        })
      : [];
    const firstMs = times[0];
    const lo = Math.min(firstMs, Number.isFinite(startMs) ? startMs : firstMs);
    const hi = Math.max(times[times.length - 1], ...markers.map(mk => mk.ms));
    const t0 = Math.floor(lo / FIVE_MIN) * FIVE_MIN;
    const t1 = Math.ceil(hi / FIVE_MIN) * FIVE_MIN;
    const nTicks = Math.round((t1 - t0) / FIVE_MIN) + 1;
    const width = Math.max(containerW, PAD.left + PAD.right + (nTicks - 1) * PX_PER_TICK);
    const maxY = Math.max(1, ...dayPts.map(p => p.present));
    const x = ms => PAD.left + ((ms - t0) / Math.max(1, t1 - t0)) * (width - PAD.left - PAD.right);
    const y = v => PAD.top + (1 - v / maxY) * (H - PAD.top - PAD.bottom);
    const step = maxY > 80 ? 40 : maxY > 30 ? 20 : maxY > 10 ? 10 : 5;
    const yTicks = [];
    for (let v = 0; v <= maxY; v += step) yTicks.push(v);
    const xTicks = [];
    for (let ms = t0; ms <= t1; ms += FIVE_MIN) {
      const d = new Date(ms + IST_OFFSET_MS);
      const h = d.getUTCHours();
      const m = d.getUTCMinutes();
      xTicks.push({ ms, label: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`, hour: m === 0 });
    }
    let d = `M ${x(times[0]).toFixed(1)} ${y(0).toFixed(1)}`;
    times.forEach((ms, i) => {
      const px = x(ms).toFixed(1);
      d += ` L ${px} ${y(i ? dayPts[i - 1].present : 0).toFixed(1)} L ${px} ${y(dayPts[i].present).toFixed(1)}`;
    });
    const last = dayPts[dayPts.length - 1];
    return {
      width, x, y, yTicks, xTicks, markers, path: d, startMs, firstMs,
      endX: x(times[times.length - 1]), endY: y(last.present), firstEv: dayPts[0],
    };
  }, [dayPts, containerW, sitting.date, sitting.time]);

  const onLayout = e => setContainerW(Math.max(280, e.nativeEvent.layout.width));

  if (!geo) {
    return (
      <View onLayout={onLayout}>
        <Text style={styles.muted}>No marks on the sitting day.</Text>
      </View>
    );
  }
  const { width, x, y, yTicks, xTicks, markers, path, startMs, firstMs, endX, endY, firstEv } = geo;
  const plotBottom = H - PAD.bottom;

  return (
    <View onLayout={onLayout}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={width} height={H}>
          {yTicks.map(v => (
            <G key={`y${v}`}>
              <Line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="#DDE9F3" strokeWidth="1" />
              <SvgText x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fill="#9BB5CB" fontSize="10">
                {String(v)}
              </SvgText>
            </G>
          ))}
          {xTicks.map(tk => (
            <G key={`x${tk.ms}`}>
              <Line
                x1={x(tk.ms)}
                x2={x(tk.ms)}
                y1={plotBottom}
                y2={plotBottom + (tk.hour ? 6 : 4)}
                stroke={tk.hour ? '#5C7A96' : '#C5D8E8'}
                strokeWidth="1"
              />
              <SvgText
                x={x(tk.ms)}
                y={plotBottom + 17}
                textAnchor="middle"
                fill={tk.hour ? '#003158' : '#5C7A96'}
                fontSize="10"
                fontWeight={tk.hour ? '600' : '400'}
              >
                {tk.label}
              </SvgText>
            </G>
          ))}
          <Line x1={PAD.left} x2={width - PAD.right} y1={plotBottom} y2={plotBottom} stroke="#C5D8E8" strokeWidth="1" />
          {Number.isFinite(startMs) ? (
            <G>
              <Line x1={x(startMs)} x2={x(startMs)} y1={PAD.top - 2} y2={plotBottom} stroke="#5C7A96" strokeWidth="1" />
              <SvgText x={x(startMs) + 3} y={PAD.top - 16} fill="#5C7A96" fontSize="10">
                {`Sabha ${sittingClock(sitting.time)}`}
              </SvgText>
            </G>
          ) : null}
          <G>
            <Line x1={x(firstMs)} x2={x(firstMs)} y1={PAD.top - 2} y2={plotBottom} stroke="#15803D" strokeWidth="1" />
            <SvgText x={x(firstMs) + 3} y={PAD.top - 5} fill="#15803D" fontSize="10" fontWeight="600">
              {`first ${clock(firstEv.time, false)}`}
            </SvgText>
          </G>
          {markers.map(mk => {
            const sx = x(mk.ms);
            if (sx < PAD.left || sx > width - PAD.right) return null;
            return (
              <G key={mk.ms}>
                <Line x1={sx} x2={sx} y1={PAD.top - 2} y2={plotBottom} stroke="#C5D8E8" strokeWidth="1" strokeDasharray="3 3" />
                <SvgText x={sx} y={PAD.top - 5} textAnchor="middle" fill="#003158" fontSize="10" fontWeight="600">
                  {String(mk.present)}
                </SvgText>
              </G>
            );
          })}
          <Path d={path} fill="none" stroke="#FF862A" strokeWidth="2" strokeLinejoin="round" />
          <Circle cx={endX} cy={endY} r="3.5" fill="#FF862A" />
        </Svg>
      </ScrollView>
      <Text style={styles.caption}>
        Present count after each real mark, five-minute axis from the Sabha start (times are PM). Grey line = Sabha
        start, green = first mark, dashed = every 15 minutes with the present count at that instant.
        {laterPts > 0 ? ` ${laterPts} mark${laterPts === 1 ? '' : 's'} made on a later day not plotted.` : ''}
      </Text>
    </View>
  );
}

function Avatar({ name }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials(name)}</Text>
    </View>
  );
}

function FilterChip({ label, count, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.fchip, active && styles.fchipActive]}>
      <Text style={[styles.fchipText, active && styles.fchipTextActive]}>{label}</Text>
      <View style={styles.fchipCount}>
        <Text style={styles.fchipCountText}>{count}</Text>
      </View>
    </Pressable>
  );
}

export default function HistoryView({ onBack }) {
  const TODAY = todayIstIso();
  const [forDate, setForDate] = useState(TODAY);
  const [sittings, setSittings] = useState([]);
  const [sittingsBusy, setSittingsBusy] = useState(false);
  const [sittingId, setSittingId] = useState('');
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('time');
  const [kindFilter, setKindFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    if (!forDate) return undefined;
    setSittingsBusy(true);
    setSittings([]);
    setSittingId('');
    setHistory(null);
    setError(null);
    attendanceService
      .trackHistorySittings(forDate)
      .then(res => {
        if (!alive) return;
        const rows = res?.data ?? res ?? [];
        const list = Array.isArray(rows) ? rows : [];
        setSittings(list);
        const best = [...list].sort((a, b) => b.mark_actions - a.mark_actions)[0];
        if (best) setSittingId(String(best.id));
      })
      .catch(e => alive && setError(e))
      .finally(() => alive && setSittingsBusy(false));
    return () => {
      alive = false;
    };
  }, [forDate]);

  const load = async id => {
    if (!id) return;
    setBusy(true);
    setError(null);
    setQuery('');
    setKindFilter('all');
    try {
      const res = await attendanceService.trackHistory(id);
      setHistory(res?.data ?? res);
    } catch (e) {
      setError(e);
      setHistory(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load(sittingId);
    // `load` is stable enough for this screen; only the chosen sitting drives it.
  }, [sittingId]);

  const sittingOptions = sittings.map(s => ({
    value: String(s.id),
    label: `${s.sabha_name} · ${sittingClock(s.time)}${s.type === 'special' ? ' · Special' : ''} · ${s.mark_actions} mark${
      s.mark_actions === 1 ? '' : 's'
    }`,
  }));

  const rows = useMemo(() => {
    const byMember = new Map();
    [...(history?.events ?? [])].reverse().forEach(e => {
      const r =
        byMember.get(e.member_id) ?? {
          member_id: e.member_id,
          member_name: e.member_name,
          other_sabha: e.other_sabha,
          steps: [],
          markers: [],
        };
      r.steps.push(e);
      if (e.marked_by_name && !r.markers.includes(e.marked_by_name)) r.markers.push(e.marked_by_name);
      byMember.set(e.member_id, r);
    });
    const list = [...byMember.values()];
    if (sortBy === 'name') {
      list.sort((a, b) => a.member_name.localeCompare(b.member_name));
    } else {
      list.sort(
        (a, b) => epoch(a.steps[0].at) - epoch(b.steps[0].at) || a.member_name.localeCompare(b.member_name),
      );
    }
    return list;
  }, [history, sortBy]);

  const hasCorrection = r => r.steps.some(e => e.kind === 'correction');
  const hasRepeat = r => r.steps.some(e => e.kind === 'repeat');
  const kindCounts = useMemo(
    () => ({
      all: rows.length,
      corrections: rows.filter(hasCorrection).length,
      repeats: rows.filter(hasRepeat).length,
    }),
    [rows],
  );
  const filteredRows = useMemo(() => {
    const byKind =
      kindFilter === 'corrections'
        ? rows.filter(hasCorrection)
        : kindFilter === 'repeats'
          ? rows.filter(hasRepeat)
          : rows;
    if (!query.trim()) return byKind;
    return byKind.filter(r =>
      searchMatches(`${r.member_name} ${r.markers.join(' ')} ${r.other_sabha ?? ''}`, query),
    );
  }, [rows, query, kindFilter]);

  const summary = history?.summary;
  const sitting = history?.sitting;
  const firstEv = history?.events?.length ? history.events[history.events.length - 1] : null;
  const lastEv = history?.events?.length ? history.events[0] : null;

  return (
    <View style={styles.stack}>
      <PageHeader
        title="Attendance Track History"
        breadcrumbs={
          <Breadcrumbs items={[{ label: 'Attendance', onPress: onBack }, { label: 'Track History' }]} onHome={onBack} />
        }
      />
      <Text style={styles.muted}>
        Every scan and tap for one sitting, replayed from the activity log — including marks that were later
        undone. The attendance row keeps only the last change; this keeps the whole chain.
      </Text>

      <Card style={styles.pickerCard}>
        <FormField label="Date">
          <DatePicker value={forDate} max={TODAY} placeholder="Select date" onChange={setForDate} />
        </FormField>
        <FormField label="Sabha on that day">
          <Select
            options={sittingOptions}
            placeholder={sittingsBusy ? 'Loading sittings…' : sittings.length ? 'Select a sitting' : 'No sittings that day'}
            value={sittingId}
            disabled={sittingsBusy || !sittings.length}
            onChange={setSittingId}
            label="Sabha on that day"
          />
        </FormField>
        <Button busy={busy} disabled={!sittingId} onPress={() => load(sittingId)}>
          <MaterialCommunityIcons name="refresh" size={space(4)} />
          Refresh
        </Button>
      </Card>

      {error ? <ErrorState error={error} onRetry={() => (sittingId ? load(sittingId) : setForDate(forDate))} /> : null}

      {!error && !history && !busy ? (
        <Card>
          <EmptyState
            icon="history"
            title={sittingsBusy ? 'Loading…' : sittings.length ? 'Pick a sitting' : 'No sittings on this day'}
            hint={sittings.length ? undefined : 'Choose another date. Only sittings in your scope are listed.'}
          />
        </Card>
      ) : null}

      {busy || history ? (
        <>
          <View style={styles.statGrid}>
            <View style={styles.statCell}>
              <StatCard
                label="Mark actions"
                value={summary?.mark_actions ?? 0}
                loading={busy}
                sub={
                  summary && firstEv
                    ? `first ${stampOf(firstEv, sitting.date, false)} · last ${stampOf(lastEv, sitting.date, false)}`
                    : undefined
                }
              />
            </View>
            <View style={styles.statCell}>
              <StatCard
                label="Members marked"
                value={summary?.members_marked ?? 0}
                loading={busy}
                sub={summary ? `${summary.present_now} present now` : undefined}
                icon="account-group"
              />
            </View>
            <View style={styles.statCell}>
              <StatCard label="Corrections" value={summary?.corrections ?? 0} loading={busy} sub="flipped after first mark" icon="alert" />
            </View>
            <View style={styles.statCell}>
              <StatCard label="Double taps" value={summary?.repeats ?? 0} loading={busy} sub="same status again" />
            </View>
            <View style={styles.statCell}>
              <StatCard label="Markers" value={summary?.markers ?? 0} loading={busy} sub="people who marked" />
            </View>
            <View style={styles.statCell}>
              <StatCard label="Present now" value={summary?.present_now ?? 0} loading={busy} sub="attendance rows today" icon="clock-outline" />
            </View>
          </View>

          <Card>
            <View style={styles.curveHead}>
              <Text style={styles.cardTitle}>Present over the evening</Text>
              {sitting ? (
                <Text style={styles.muted}>
                  — {sitting.sabha_name} · {shortDate(sitting.date)} · starts {sittingClock(sitting.time)}
                </Text>
              ) : null}
            </View>
            {busy ? <Skeleton style={styles.curveSkeleton} /> : <ArrivalCurve sitting={sitting} curve={history.curve ?? []} />}
          </Card>

          <Card clip>
            <View style={styles.marksHead}>
              <View style={styles.marksTitleRow}>
                <MaterialCommunityIcons name="clock-outline" size={space(4)} color={COLORS.accent} />
                <Text style={styles.cardTitle}>Marks by member</Text>
                {!busy ? <Badge tone="neutral">{String(filteredRows.length)}</Badge> : null}
              </View>
              <View style={styles.sortRow}>
                {[
                  { key: 'time', label: 'Time', icon: 'clock-outline' },
                  { key: 'name', label: 'Name', icon: 'sort-alphabetical-ascending' },
                ].map(o => (
                  <Pressable key={o.key} onPress={() => setSortBy(o.key)} style={[styles.sortBtn, sortBy === o.key && styles.sortBtnActive]}>
                    <MaterialCommunityIcons
                      name={o.icon}
                      size={space(3.5)}
                      color={sortBy === o.key ? COLORS.white : COLORS.textMuted}
                    />
                    <Text style={[styles.sortText, sortBy === o.key && styles.sortTextActive]}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={space(4)} color={COLORS.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search member name"
                placeholderTextColor={COLORS.textFaint}
                style={styles.searchInput}
              />
            </View>

            <View style={styles.filterRow}>
              <FilterChip label="All" count={busy ? '…' : kindCounts.all} active={kindFilter === 'all'} onPress={() => setKindFilter('all')} />
              <FilterChip label="Corrections" count={busy ? '…' : kindCounts.corrections} active={kindFilter === 'corrections'} onPress={() => setKindFilter('corrections')} />
              <FilterChip label="Double taps" count={busy ? '…' : kindCounts.repeats} active={kindFilter === 'repeats'} onPress={() => setKindFilter('repeats')} />
            </View>

            {busy ? (
              <View style={styles.skeletonStack}>
                {[0, 1, 2, 3].map(i => (
                  <Skeleton key={i} style={styles.rowSkeleton} />
                ))}
              </View>
            ) : filteredRows.length ? (
              <View>
                {filteredRows.map(r => (
                  <View key={String(r.member_id)} style={styles.memberRow}>
                    <View style={styles.memberHead}>
                      <Avatar name={r.member_name} />
                      <View style={styles.flex1}>
                        <Text style={styles.memberName}>{r.member_name}</Text>
                        {r.other_sabha ? <Text style={styles.muted}>{r.other_sabha}</Text> : null}
                      </View>
                    </View>
                    <View style={styles.chipWrap}>
                      {r.steps.map((ev, i) => (
                        <View key={`${ev.at}-${i}`} style={styles.chipItem}>
                          {i > 0 ? <Text style={styles.arrow}>→</Text> : null}
                          <MarkChip ev={ev} sittingDate={sitting.date} />
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.empty}>
                {query ? 'No member matches that search.' : kindFilter !== 'all' ? 'No member in this filter.' : 'No marks were logged for this sitting.'}
              </Text>
            )}
          </Card>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(4) },
  muted: { fontSize: TEXT.xs, color: COLORS.textMuted, lineHeight: TEXT.xs * 1.4 },
  caption: { marginTop: space(1), fontSize: TEXT.xs, color: COLORS.textMuted, lineHeight: TEXT.xs * 1.4 },
  pickerCard: { gap: space(3) },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  statCell: { flexGrow: 1, flexBasis: '45%' },
  curveHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2), marginBottom: space(2) },
  cardTitle: { fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  curveSkeleton: { height: 220, width: '100%' },
  marksHead: { gap: space(2), borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft, padding: space(4) },
  marksTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  sortRow: { flexDirection: 'row', gap: space(1), alignSelf: 'flex-start', borderRadius: RADII.xl, borderWidth: 1, borderColor: COLORS.lineSoft, padding: 2 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: space(1), borderRadius: RADII.lg, paddingHorizontal: space(2.5), paddingVertical: space(1) },
  sortBtnActive: { backgroundColor: COLORS.primary },
  sortText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  sortTextActive: { color: COLORS.white },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    marginHorizontal: space(4),
    marginTop: space(3),
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    paddingHorizontal: space(3),
  },
  searchInput: { flex: 1, paddingVertical: space(2.5), fontSize: TEXT.sm, color: COLORS.primary },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1.5), paddingHorizontal: space(4), paddingTop: space(3) },
  fchip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  fchipActive: { borderColor: 'rgba(255,134,42,0.4)', backgroundColor: 'rgba(255,134,42,0.1)' },
  fchipText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  fchipTextActive: { color: COLORS.accent },
  fchipCount: { borderRadius: RADII.full, backgroundColor: COLORS.bg, paddingHorizontal: space(1.5) },
  fchipCountText: { ...TNUM, fontSize: 11, color: COLORS.textMuted },
  skeletonStack: { gap: space(2), padding: space(4) },
  rowSkeleton: { height: space(10), width: '100%' },
  memberRow: { borderTopWidth: 1, borderTopColor: COLORS.lineSoft, paddingHorizontal: space(4), paddingVertical: space(3), gap: space(2) },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: space(2.5) },
  flex1: { flex: 1 },
  memberName: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  avatar: {
    width: space(8),
    height: space(8),
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 11, fontWeight: WEIGHT.bold, color: COLORS.primary },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(1.5) },
  chipItem: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  arrow: { color: COLORS.textFaint },
  chip: { borderRadius: RADII.full, borderWidth: 1, paddingHorizontal: space(2), paddingVertical: space(0.5) },
  chipRepeat: { borderColor: COLORS.lineSoft, backgroundColor: 'rgba(235,240,246,0.4)' },
  chipRepeatText: { fontSize: TEXT.xs, color: COLORS.textMuted },
  chipPresent: { borderColor: 'rgba(21,128,61,0.3)', backgroundColor: 'rgba(21,128,61,0.1)' },
  chipAbsent: { borderColor: 'rgba(185,28,28,0.3)', backgroundColor: 'rgba(185,28,28,0.1)' },
  chipText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },
  chipPresentText: { color: COLORS.successFg },
  chipAbsentText: { color: COLORS.dangerFg },
  empty: { paddingHorizontal: space(4), paddingVertical: space(6), fontSize: TEXT.sm, color: COLORS.textMuted },
});
