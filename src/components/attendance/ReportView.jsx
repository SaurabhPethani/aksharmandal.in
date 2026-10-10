import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Button, Card, EmptyState, ErrorState, PageHeader, PageLoader, Skeleton } from '../ui';
import { Breadcrumbs } from '../Navigation';
import MemberPager from './MemberPager';
import AttendanceMetricsTable from './AttendanceMetricsTable';
import AttendanceProgressionTable from './AttendanceProgressionTable';
import SittingHeadsSection from './SittingHeadsSection';
import { useMyPermissions } from '../../hooks/useMyPermissions';
import { useToast } from '../../hooks/core';
import { useClientPagination } from '../../hooks/usePagination';
import { useAssemblyBroadcast, useAttendanceSummary } from '../../hooks/useAttendance';
import {
  useSabhaReport,
  useSabhaReportExport,
  useSpecialSabhaRules,
  useSpecialSabhaHistory,
} from '../../hooks/useReports';
import { pickRows } from '../../utils/options';
import { openSabhaWhatsApp } from '../../utils/sabhaWhatsapp';
import { EMOJI } from '../../utils/emoji';
import { ACTIONS, MODULES } from '../../constants/permissions';
import { FONT_DISPLAY } from '../../constants/typography';
import { COLORS, RADII, SHADOWS, TEXT, TNUM, WEIGHT, space } from '../../constants/theme';

// One sitting's attendance report — GET /api/v1/sabha-report?sabha_detail_id={id}.
// The RN port of the web's SpecialSabhaReportPage.
//
//   the page itself       REPORTS:READ
//   a Special sitting      + REPORT_SPECIAL:VIEW
//   Download Attendance    REPORTS:DOWNLOAD (GET /sabha-report/export — Present only)
//
// A REGULAR sitting shows the slot-metrics table + progression chart (a
// marking-team tool, gated on ATTENDANCE:CREATE) and the per-follow-up-head
// section. A SPECIAL (Mandal-level) sitting — detected by the broadcast endpoint
// 400-ing — shows its roster's Present/Absent by home Sabha, walk-in visitors,
// and (for a recurring Special) the cross-sitting history.

const isPresentRow = (r) => r?.status === 1 || r?.status === true || r?.status === '1';

/** "2026-09-24" -> "24 September 2026", without a timezone shifting the day. */
function longDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

/** "2026-09-08" -> the Monday of that week, "2026-09-07" (UTC math, no TZ drift). */
function weekMondayISO(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return d.toISOString().slice(0, 10);
}

/** "2026-09-08" -> "08-09-2026" (for the WhatsApp header). */
function formatDMY(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(value ?? '');
}

// Continuous-absence colour bands (up to ~8 sittings): 1-2 yellow, 3-4 orange,
// 5-6 red, 7-8 dark red.
function streakStyle(streak) {
  if (streak >= 7) return { dot: '#7f1d1d', emoji: EMOJI.brownCircle };
  if (streak >= 5) return { dot: '#dc2626', emoji: EMOJI.redCircle };
  if (streak >= 3) return { dot: '#ea580c', emoji: EMOJI.orangeCircle };
  return { dot: '#eab308', emoji: EMOJI.yellowCircle };
}

export default function ReportView({ sabha, onBack }) {
  const permissionsQ = useMyPermissions();
  const permissions = permissionsQ.data;
  const sabhaDetailId = sabha?.id ?? null;

  const { data, isLoading, error, refetch } = useSabhaReport(sabhaDetailId);
  const exportReport = useSabhaReportExport();
  const toast = useToast();

  // A REGULAR sitting gets the slot metrics. The broadcast endpoint 400s on a
  // SPECIAL (Mandal-level) sitting — that error is how we tell the two apart.
  const live = useAssemblyBroadcast(sabhaDetailId, { final: true });
  const isRegular = live.isSuccess && Boolean(live.data);
  const isSpecial = !live.isLoading && !isRegular;

  // A special sitting's report is counted against its OWN roster (clamped
  // server-side to the caller's Sabha for Sabha-level roles).
  const rosterQ = useAttendanceSummary(isSpecial ? sabhaDetailId : null, { reportScope: true });

  const meta = data?.special_sabha ?? data?.sabha ?? data?.sabha_detail ?? sabha ?? null;

  // The history grid needs the recurring RULE this sitting belongs to.
  const rulesQ = useSpecialSabhaRules(isSpecial);
  const scheduleId = useMemo(() => {
    const list = rulesQ.data?.data ?? [];
    const name = meta?.special_sabha_name;
    if (!name) return null;
    const hit = list.find(
      (r) => r.special_sabha_name === name && (!meta?.mandal_name || r.mandal_name === meta.mandal_name),
    );
    return hit?.id ?? null;
  }, [rulesQ.data, meta?.special_sabha_name, meta?.mandal_name]);

  const histParams = scheduleId
    ? { schedule_id: scheduleId, weeks: 8, week_date: weekMondayISO(meta?.sabha_date ?? meta?.date) }
    : null;
  const historyQ = useSpecialSabhaHistory(histParams, isSpecial && Boolean(scheduleId));

  // Narrow the KPI + by-Sabha view to the members the scoped history returns.
  // A Set of allowed user_ids; null = no scoping; undefined = still resolving.
  const scopedUserIds = useMemo(() => {
    if (!scheduleId) return null;
    if (historyQ.isSuccess) return new Set((historyQ.data?.data?.members ?? []).map((m) => m.user_id));
    if (historyQ.isError) return null;
    return undefined;
  }, [scheduleId, historyQ.isSuccess, historyQ.isError, historyQ.data]);

  const rows = Array.isArray(data?.data) ? data.data : [];
  const totals = data?.total ?? null;

  const specialRows = Array.isArray(rosterQ.data) ? rosterQ.data : pickRows(rosterQ.data);
  const specialEmpty = !isRegular && rosterQ.isSuccess && specialRows.length === 0;

  const allowed = (m, a) => Boolean(permissions?.can(m, a));
  const canDownload = allowed(MODULES.REPORTS, ACTIONS.DOWNLOAD);
  const canMark = allowed(MODULES.ATTENDANCE, ACTIONS.CREATE);
  const hasReport = rows.length > 0 || Boolean(totals);

  const title = meta?.special_sabha_name || meta?.sabha_name || 'Attendance Report';
  const subtitle = [meta?.special_sabha_name ?? meta?.sabha_name, meta?.mandal_name, longDate(meta?.sabha_date ?? meta?.date)]
    .filter(Boolean)
    .join(' · ');

  const download = async () => {
    try {
      const ok = await exportReport.mutateAsync({
        sabhaDetailId,
        filename: `${meta?.special_sabha_name ?? meta?.sabha_name ?? 'sabha'} - ${meta?.sabha_date ?? sabhaDetailId}.xlsx`,
      });
      if (ok) toast.success('Attendance downloaded.');
    } catch (err) {
      toast.error(err?.message || 'Could not download the file.');
    }
  };

  // PageHeader carries its own `marginBottom: space(6)`; inside the gap-based
  // stack below (gap: space(5)) that stacked up to ~space(11) before the first
  // card — much more than the space(5) between the cards themselves. Cancelling
  // the header's own margin here leaves a single, uniform space(5) everywhere.
  const header = (
    <View style={styles.headerFlush}>
      <PageHeader
        title="Attendance Report"
        subtitle={subtitle || title}
        breadcrumbs={
          <Breadcrumbs items={[{ label: 'Attendance', onPress: onBack }, { label: 'Report' }]} onHome={onBack} />
        }
        actions={
          canDownload && hasReport ? (
            <Button variant="accent" busy={exportReport.isPending} onPress={download}>
              <MaterialCommunityIcons name="download" size={space(4)} />
              Download
            </Button>
          ) : null
        }
      />
    </View>
  );

  if (!permissions || isLoading || live.isLoading) {
    return (
      <View style={styles.stack}>
        {header}
        <PageLoader label="Loading report" />
      </View>
    );
  }

  // Page gate: REPORTS:READ.
  if (!allowed(MODULES.REPORTS, ACTIONS.READ)) {
    return (
      <View style={styles.stack}>
        {header}
        <Card>
          <EmptyState title="No access" hint="Viewing this report requires the Reports · Read permission." />
        </Card>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.stack}>
        {header}
        <Card><ErrorState error={error} onRetry={refetch} title="Could not load this report" /></Card>
      </View>
    );
  }

  // Special report access is pure RBAC: REPORT_SPECIAL:VIEW.
  if (isSpecial && !allowed(MODULES.REPORT_SPECIAL, ACTIONS.VIEW)) {
    return (
      <View style={styles.stack}>
        {header}
        <Card>
          <EmptyState
            title="No access"
            hint="Viewing a Special Sabha report requires the Special Sabha Report permission."
          />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {header}

      {/* Regular sitting + marking rights: the slot metrics + progression chart. */}
      {isRegular && canMark ? (
        <>
          <AttendanceMetricsTable sabhaDetailId={sabhaDetailId} live={live.data} />
          <AttendanceProgressionTable sabhaDetailId={sabhaDetailId} live={live.data} />
        </>
      ) : null}

      {/* Special sitting with an empty scoped roster → one clean message. */}
      {specialEmpty ? (
        <Card>
          <EmptyState
            icon="clipboard-check-outline"
            title="Nothing to show here"
            hint="You have no follow-up members on this sitting's roster."
          />
        </Card>
      ) : null}

      {!isRegular && !specialEmpty ? <SpecialKpis rosterQ={rosterQ} allowedUserIds={scopedUserIds} /> : null}
      {!isRegular && !specialEmpty ? <SpecialRosterTable rosterQ={rosterQ} allowedUserIds={scopedUserIds} /> : null}
      {!isRegular && !specialEmpty ? <SpecialVisitorsTable rosterQ={rosterQ} /> : null}

      {!isRegular && !specialEmpty ? (
        rulesQ.isLoading ? (
          <Card><Skeleton style={{ height: space(40), width: '100%' }} /></Card>
        ) : scheduleId ? (
          <SpecialHistorySection
            historyQ={historyQ}
            currentSittingId={Number(sabhaDetailId)}
            dateLabel={meta?.sabha_date ?? meta?.date}
          />
        ) : null
      ) : null}

      {/* Regular sittings: per-follow-up-head live report. */}
      {isRegular ? <SittingHeadsSection sabhaDetailId={sabhaDetailId} /> : null}
    </View>
  );
}

// Three headline KPIs for one Special sitting: roster total + Present / Absent +
// walk-in Visitors.
function SpecialKpis({ rosterQ, allowedUserIds }) {
  const base = Array.isArray(rosterQ.data) ? rosterQ.data : pickRows(rosterQ.data);
  const rows = allowedUserIds ? base.filter((r) => allowedUserIds.has(r.user_id)) : base;

  if (rosterQ.isLoading || allowedUserIds === undefined) {
    return (
      <View style={styles.kpiRow}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} style={styles.kpiSkeleton} />)}
      </View>
    );
  }
  if (!rows.length) return null;

  const roster = rows.filter((r) => !r?.is_visitor);
  const total = roster.length;
  const present = roster.reduce((n, r) => n + (isPresentRow(r) ? 1 : 0), 0);
  const absent = total - present;
  const visitors = base.reduce((n, r) => n + (r?.is_visitor && isPresentRow(r) ? 1 : 0), 0);

  const tiles = [
    { value: total, label: 'Total Members', tone: COLORS.primary },
    { value: present, label: 'Present Today', tone: COLORS.successFg },
    { value: absent, label: 'Absent Today', tone: COLORS.dangerFg },
    { value: visitors, label: 'Visitors', tone: COLORS.successFg },
  ];

  return (
    <View style={styles.kpiRow}>
      {tiles.map((t) => (
        <View key={t.label} style={styles.kpiTile}>
          <Text style={[styles.kpiValue, { color: t.tone }]}>{t.value}</Text>
          <Text style={styles.kpiLabel}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

// The roster's Present/Absent grouped by each member's home Sabha.
function SpecialRosterTable({ rosterQ, allowedUserIds }) {
  const base = Array.isArray(rosterQ.data) ? rosterQ.data : pickRows(rosterQ.data);
  const rows = (allowedUserIds ? base.filter((r) => allowedUserIds.has(r.user_id)) : base).filter((r) => !r?.is_visitor);

  if (rosterQ.isLoading || allowedUserIds === undefined) {
    return <Card><Skeleton style={{ height: space(40), width: '100%' }} /></Card>;
  }
  if (!rows.length) {
    return (
      <Card>
        <EmptyState icon="clipboard-check-outline" title="No roster yet" hint="This Special Sabha has no seeded members for this sitting." />
      </Card>
    );
  }

  const byS = new Map();
  let present = 0;
  for (const r of rows) {
    const p = isPresentRow(r);
    if (p) present += 1;
    const key = r?.user_sabha_name || '—';
    const g = byS.get(key) || { present: 0, absent: 0 };
    if (p) g.present += 1; else g.absent += 1;
    byS.set(key, g);
  }
  const total = rows.length;
  const groups = [...byS.entries()]
    .map(([sabha, g]) => ({ sabha, ...g, rate: g.present + g.absent ? Math.round((g.present / (g.present + g.absent)) * 100) : 0 }))
    .sort((a, b) => b.present - a.present || (a.sabha || '').localeCompare(b.sabha || ''));
  const rate = total ? Math.round((present / total) * 100) : 0;

  return (
    <Card style={styles.tableCard}>
      <View style={styles.tableHead}>
        <Text style={styles.sectionTitle}>Attendance by Sabha</Text>
        <Text style={styles.tableMeta}>
          <Text style={styles.presentNum}>{present}</Text> present ·{' '}
          <Text style={styles.absentNum}>{total - present}</Text> absent · roster {total}
        </Text>
      </View>
      <View style={styles.gridHeadRow}>
        <Text style={[styles.gcHead, styles.sabhaCol]}>Sabha</Text>
        <Text style={[styles.gcHead, styles.gNum]}>Total</Text>
        <Text style={[styles.gcHead, styles.gNum]}>Pres</Text>
        <Text style={[styles.gcHead, styles.gNum]}>Abs</Text>
        <Text style={[styles.gcHead, styles.gNum]}>Rate</Text>
      </View>
      {groups.map((g) => (
        <View key={g.sabha} style={styles.gridRow}>
          <Text style={[styles.sabhaCol, styles.sabhaName]} numberOfLines={1}>{g.sabha}</Text>
          <Text style={[styles.gNum, styles.gNumStrong]}>{g.present + g.absent}</Text>
          <Text style={[styles.gNum, styles.present]}>{g.present}</Text>
          <Text style={[styles.gNum, styles.absent]}>{g.absent}</Text>
          <Text style={[styles.gNum, styles.gMuted]}>{g.rate}%</Text>
        </View>
      ))}
      <View style={styles.gridFootRow}>
        <Text style={[styles.sabhaCol, styles.footText]}>Total</Text>
        <Text style={[styles.gNum, styles.footText]}>{total}</Text>
        <Text style={[styles.gNum, styles.present, styles.footText]}>{present}</Text>
        <Text style={[styles.gNum, styles.absent, styles.footText]}>{total - present}</Text>
        <Text style={[styles.gNum, styles.footText]}>{rate}%</Text>
      </View>
    </Card>
  );
}

// Walk-in VISITORS — present attendees not on the seeded roster, by home Sabha.
function SpecialVisitorsTable({ rosterQ }) {
  const base = Array.isArray(rosterQ.data) ? rosterQ.data : pickRows(rosterQ.data);
  const rows = base.filter((r) => r?.is_visitor && isPresentRow(r));

  if (rosterQ.isLoading || !rows.length) return null;

  const byS = new Map();
  for (const r of rows) {
    const key = r?.user_sabha_name || '—';
    const g = byS.get(key) || [];
    g.push(r?.user_name || `Member #${r?.user_id}`);
    byS.set(key, g);
  }
  const groups = [...byS.entries()]
    .map(([sabha, names]) => ({ sabha, names: names.sort((a, b) => a.localeCompare(b)), count: names.length }))
    .sort((a, b) => b.count - a.count || (a.sabha || '').localeCompare(b.sabha || ''));

  return (
    <Card style={styles.tableCard}>
      <View style={styles.tableHead}>
        <Text style={styles.sectionTitle}>Visitors</Text>
        <Text style={styles.tableMeta}>
          <Text style={styles.presentNum}>{rows.length}</Text> walk-in{rows.length === 1 ? '' : 's'} — not on the roster
        </Text>
      </View>
      {groups.map((g) => (
        <View key={g.sabha} style={styles.visitorRow}>
          <View style={styles.visitorHead}>
            <Text style={styles.sabhaName} numberOfLines={1}>{g.sabha}</Text>
            <Text style={[styles.present, styles.visitorCount]}>{g.count}</Text>
          </View>
          <Text style={styles.visitorNames}>{g.names.join(', ')}</Text>
        </View>
      ))}
    </Card>
  );
}

// The cross-sitting section: a Sabha + Present/Absent filter, an 8-sitting present
// trend, the last-5 P/A grid (paginated), and the NS-absent list with WhatsApp.
function SpecialHistorySection({ historyQ, currentSittingId, dateLabel }) {
  const [sabha, setSabha] = useState('');
  const [pa, setPa] = useState('all');

  const payload = historyQ.data?.data ?? null;
  const weeks = useMemo(() => payload?.weeks ?? [], [payload]);
  const members = useMemo(() => payload?.members ?? [], [payload]);

  const currentIdx = useMemo(() => {
    const i = weeks.findIndex((w) => Number(w.sitting_id) === Number(currentSittingId));
    return i >= 0 ? i : weeks.length - 1;
  }, [weeks, currentSittingId]);

  const sabhaOptions = useMemo(
    () => [...new Set(members.map((m) => m.home_sabha_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [members],
  );
  const bySabha = useMemo(
    () => (sabha ? members.filter((m) => m.home_sabha_name === sabha) : members),
    [members, sabha],
  );
  const gridMembers = useMemo(
    () => bySabha.filter((m) => pa === 'all' || (pa === 'present') === (m?.history?.[currentIdx] === 'P')),
    [bySabha, pa, currentIdx],
  );

  if (historyQ.isLoading) return <Card><Skeleton style={{ height: space(56), width: '100%' }} /></Card>;
  if (historyQ.error) {
    return <Card><ErrorState error={historyQ.error} onRetry={historyQ.refetch} title="Could not load historical data" /></Card>;
  }
  if (!weeks.length || !members.length) return null;

  const chartPoints = weeks.map((w, i) => ({
    label: w.label,
    count: bySabha.reduce((n, m) => n + (m.history?.[i] === 'P' ? 1 : 0), 0),
    isCurrent: i === currentIdx,
  }));
  const yMax = bySabha.length + 10;

  const gridFrom = Math.max(0, weeks.length - 5);
  const gridWeeks = weeks.slice(gridFrom);
  const gridRows = gridMembers.map((m) => ({ ...m, history: (m.history ?? []).slice(gridFrom) }));

  return (
    <>
      <Card style={styles.filterCard}>
        {sabhaOptions.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sabhaFilter}>
            <FilterChip label="All Sabhas" active={sabha === ''} onPress={() => setSabha('')} />
            {sabhaOptions.map((s) => (
              <FilterChip key={s} label={s} active={sabha === s} onPress={() => setSabha(s)} />
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.paToggle}>
          {[['all', 'All'], ['present', 'Present'], ['absent', 'Absent']].map(([v, lbl]) => (
            <Pressable key={v} onPress={() => setPa(v)} style={[styles.paSeg, pa === v && styles.paSegActive]}>
              <Text style={[styles.paSegText, pa === v && styles.paSegTextActive]}>{lbl}</Text>
            </Pressable>
          ))}
          <Text style={styles.shown}>{gridMembers.length} shown</Text>
        </View>
      </Card>

      <SpecialTrendChart points={chartPoints} yMax={yMax} />

      <SpecialHistoryGrid
        weeks={gridWeeks}
        members={gridRows}
        currentIdx={currentIdx - gridFrom}
        latestLabel={weeks[currentIdx]?.label}
      />

      <NsAbsentCard members={bySabha} currentIdx={currentIdx} dateLabel={dateLabel} />
    </>
  );
}

function FilterChip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.fChip, active && styles.fChipActive]}>
      <Text style={[styles.fChipText, active && styles.fChipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// Present count across the last N sittings, as a bar chart (react-native-svg).
function SpecialTrendChart({ points, yMax }) {
  const [width, setWidth] = useState(0);
  if (!points.length) return null;
  const H = 150, padL = 30, padR = 10, padT = 16, padB = 30;
  const W = Math.max(300, width || 320);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = points.length;
  const step = innerW / n;
  const bw = Math.min(28, step * 0.62);
  const top = Math.max(1, yMax);
  const y = (v) => padT + innerH - (v / top) * innerH;
  const ticks = 4;

  return (
    <Card style={styles.chartCard}>
      <Text style={styles.sectionTitle}>Present — last {n} sittings</Text>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
            {Array.from({ length: ticks + 1 }).map((_, i) => {
              const v = Math.round((top / ticks) * i);
              const yy = y(v);
              return (
                <G key={i}>
                  <Line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="#e5e7eb" strokeWidth="1" />
                  <SvgText x={padL - 4} y={yy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{v}</SvgText>
                </G>
              );
            })}
            {points.map((p, i) => {
              const cx = padL + step * i + step / 2;
              const yy = y(p.count);
              const bh = Math.max(0, padT + innerH - yy);
              return (
                <G key={i}>
                  <Rect x={cx - bw / 2} y={yy} width={bw} height={bh} rx="2" fill={p.isCurrent ? '#F5A623' : '#22c55e'} />
                  <SvgText x={cx} y={yy - 3} textAnchor="middle" fontSize="9" fontWeight="700" fill={p.isCurrent ? '#b45309' : '#334155'}>
                    {p.count}
                  </SvgText>
                  <SvgText x={cx} y={H - padB + 12} textAnchor="middle" fontSize="8" fill="#64748b">{p.label}</SvgText>
                </G>
              );
            })}
          </Svg>
        ) : (
          <View style={{ height: H }} />
        )}
      </View>
    </Card>
  );
}

// Compact P/A grid: one row per member — name + home Sabha, with the P/A run on
// the right. Paginated (25/page) so a long roster never scrolls inside the page.
function SpecialHistoryGrid({ weeks, members, currentIdx, latestLabel }) {
  const { page, setPage, pageCount, total, pageRows } = useClientPagination(members);
  if (!weeks.length) return null;

  return (
    <Card style={styles.tableCard}>
      <View style={styles.tableHead}>
        <Text style={styles.sectionTitle}>Historical data</Text>
        <Text style={styles.tableMeta}>
          last {weeks.length} sittings → <Text style={styles.presentNum}>{latestLabel}</Text>
        </Text>
      </View>
      {!members.length ? (
        <Text style={styles.muted}>No members match this filter.</Text>
      ) : (
        <>
          {pageRows.map((m) => (
            <View key={m.user_id} style={styles.histRow}>
              <View style={styles.histWho}>
                <View style={styles.histNameRow}>
                  <Text style={styles.histName}>{m.user_name}</Text>
                  {(m.absent_streak ?? 0) >= 1 ? (
                    <View style={[styles.streakDot, { backgroundColor: streakStyle(m.absent_streak).dot }]} />
                  ) : null}
                </View>
                {m.home_sabha_name ? <Text style={styles.histSabha}>{m.home_sabha_name}</Text> : null}
              </View>
              <View style={styles.histRun}>
                {(m.history ?? []).map((h, i) => {
                  const isCurrent = i === currentIdx;
                  return (
                    <Text
                      key={i}
                      style={[
                        h === 'P' ? styles.present : styles.absent,
                        isCurrent ? styles.paCurrent : styles.paPast,
                      ]}
                    >
                      {h === 'P' ? 'P' : 'A'}
                    </Text>
                  );
                })}
              </View>
            </View>
          ))}
          <MemberPager page={page} pageCount={pageCount} total={total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

// NS absent list — Nimit Sevaks not yet present, with per-home-Sabha WhatsApp.
function NsAbsentCard({ members, currentIdx, dateLabel }) {
  const absentNs = members.filter(
    (m) => m.is_nimit_sevak && m.history?.[currentIdx] === 'A' && (m.absent_streak ?? 0) >= 1,
  );
  const prettyDate = formatDMY(dateLabel);

  const streakGroups = useMemo(() => {
    const byStreak = new Map();
    for (const m of absentNs) {
      const k = m.absent_streak ?? 1;
      (byStreak.get(k) || byStreak.set(k, []).get(k)).push(m);
    }
    return [...byStreak.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([streak, list]) => ({ streak, list: list.sort((a, b) => (a.user_name || '').localeCompare(b.user_name || '')) }));
  }, [absentNs]);

  const sabhaGroups = useMemo(() => {
    const byS = new Map();
    for (const m of absentNs) {
      const s = m.home_sabha_name || '—';
      (byS.get(s) || byS.set(s, []).get(s)).push(m);
    }
    return [...byS.entries()]
      .map(([sabha, list]) => ({ sabha, count: list.length }))
      .sort((a, b) => b.count - a.count || a.sabha.localeCompare(b.sabha));
  }, [absentNs]);

  const buildMessage = (sabhaName) => {
    const list = sabhaName ? absentNs.filter((m) => m.home_sabha_name === sabhaName) : absentNs;
    const byStreak = new Map();
    for (const m of list) {
      const k = m.absent_streak ?? 1;
      (byStreak.get(k) || byStreak.set(k, []).get(k)).push(m);
    }
    const groups = [...byStreak.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([streak, l]) => ({ streak, l: l.sort((a, b) => (a.user_name || '').localeCompare(b.user_name || '')) }));
    const lines = [`Ns Absent on ${prettyDate}`];
    if (sabhaName) lines.push(sabhaName);
    lines.push('');
    for (const g of groups) {
      for (const m of g.l) lines.push(`${m.user_name} (${g.streak})`);
      lines.push('');
    }
    return lines.join('\n').replace(/\n+$/, '');
  };
  const send = (sabhaName) => openSabhaWhatsApp(null, buildMessage(sabhaName));

  return (
    <Card style={styles.tableCard}>
      <View style={styles.nsHead}>
        <MaterialCommunityIcons name="account-off-outline" size={space(4)} color={COLORS.accent} />
        <Text style={styles.nsTitle}>NS absent list</Text>
        <Text style={styles.tableMeta}>— Nimit Sevaks not yet present</Text>
      </View>

      {!absentNs.length ? (
        <Text style={styles.muted}>All Nimit Sevaks present 🎉</Text>
      ) : (
        <>
          <View style={styles.sendRow}>
            {sabhaGroups.map((g) => (
              <Pressable key={g.sabha} onPress={() => send(g.sabha)} style={styles.sendBtn}>
                <MaterialCommunityIcons name="send" size={space(3.5)} color={COLORS.accent} />
                <Text style={styles.sendText}>{g.sabha} ({g.count})</Text>
              </Pressable>
            ))}
            {sabhaGroups.length > 1 ? (
              <Pressable onPress={() => send(null)} style={[styles.sendBtn, styles.sendBtnDark]}>
                <MaterialCommunityIcons name="send" size={space(3.5)} color={COLORS.white} />
                <Text style={[styles.sendText, styles.sendTextDark]}>All Sabhas ({absentNs.length})</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.nsHint}>
            Tapping opens WhatsApp with that Sabha's NS-absent list ready — pick the group and send.
          </Text>

          <View style={styles.streakList}>
            {streakGroups.map((g) => (
              <View key={g.streak} style={styles.streakGroup}>
                <Text style={styles.streakHead}>
                  Absent {g.streak} sitting{g.streak > 1 ? 's' : ''} ({g.list.length})
                </Text>
                {g.list.map((m) => (
                  <View key={m.user_id} style={styles.nsMemberRow}>
                    <Text style={styles.nsMemberName} numberOfLines={1}>{m.user_name}</Text>
                    <Text style={styles.nsStreak}>{g.streak}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(5) },
  // Cancels PageHeader's built-in marginBottom so the header-to-first-card gap
  // equals the space(5) gap between the cards (see the `header` comment above).
  headerFlush: { marginBottom: -space(6) },

  // KPIs
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  kpiTile: {
    flexGrow: 1,
    flexBasis: '47%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    paddingVertical: space(4),
    ...SHADOWS.card,
  },
  kpiValue: { fontFamily: FONT_DISPLAY, ...TNUM, fontSize: TEXT['2xl'], fontWeight: WEIGHT.bold },
  kpiLabel: { marginTop: space(1.5), fontSize: TEXT.xs, color: COLORS.textMuted },
  kpiSkeleton: { flexGrow: 1, flexBasis: '47%', height: space(20) },

  // Tables / cards
  tableCard: { padding: space(4) },
  tableHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(2),
    marginBottom: space(3),
  },
  sectionTitle: { fontFamily: FONT_DISPLAY, fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  tableMeta: { fontSize: TEXT.xs, color: COLORS.textMuted },
  presentNum: { fontWeight: WEIGHT.semibold, color: COLORS.successFg },
  absentNum: { fontWeight: WEIGHT.semibold, color: COLORS.dangerFg },

  gridHeadRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(2) },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(2),
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
  },
  gridFootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(2),
    borderTopWidth: 2,
    borderTopColor: COLORS.line,
  },
  gcHead: { fontSize: 11, color: COLORS.textMuted },
  sabhaCol: { flex: 1.6 },
  sabhaName: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  gNum: { flex: 1, textAlign: 'center', ...TNUM, fontSize: TEXT.sm },
  gNumStrong: { fontWeight: WEIGHT.semibold, color: COLORS.primary },
  gMuted: { color: COLORS.textMuted },
  present: { color: COLORS.successFg },
  absent: { color: COLORS.dangerFg },
  footText: { fontWeight: WEIGHT.bold, color: COLORS.primary },

  // Visitors
  visitorRow: { paddingVertical: space(2), borderTopWidth: 1, borderTopColor: COLORS.lineSoft },
  visitorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  visitorCount: { ...TNUM, fontWeight: WEIGHT.semibold },
  visitorNames: { marginTop: space(0.5), fontSize: TEXT.xs, color: COLORS.textMuted },

  // History filters
  filterCard: { padding: space(3), gap: space(2.5) },
  sabhaFilter: { flexDirection: 'row', gap: space(1.5), paddingRight: space(2) },
  fChip: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    maxWidth: space(40),
  },
  fChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  fChipText: { fontSize: TEXT.sm, color: COLORS.textMuted },
  fChipTextActive: { color: COLORS.white, fontWeight: WEIGHT.semibold },
  paToggle: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  paSeg: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
  paSegActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  paSegText: { fontSize: TEXT.sm, color: COLORS.textMuted },
  paSegTextActive: { color: COLORS.white, fontWeight: WEIGHT.semibold },
  shown: { marginLeft: 'auto', fontSize: TEXT.xs, color: COLORS.textMuted },

  chartCard: { padding: space(4) },

  // History grid rows
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    paddingVertical: space(2),
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
  },
  histWho: { flex: 1, minWidth: 0 },
  histNameRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  histName: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary, flexShrink: 1 },
  streakDot: { width: space(2.5), height: space(2.5), borderRadius: RADII.full },
  histSabha: { fontSize: 11, color: COLORS.textMuted },
  histRun: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  paCurrent: {
    minWidth: space(6),
    textAlign: 'center',
    borderRadius: RADII.lg,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(1),
    fontSize: TEXT.lg,
    fontWeight: WEIGHT.bold,
    ...TNUM,
  },
  paPast: { width: space(4), textAlign: 'center', fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, opacity: 0.7, ...TNUM },

  // NS absent
  nsHead: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(3) },
  nsTitle: { fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  sendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: 'rgba(255,134,42,0.4)',
    backgroundColor: 'rgba(255,134,42,0.06)',
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },
  sendBtnDark: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  sendText: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.accent },
  sendTextDark: { color: COLORS.white },
  nsHint: { marginTop: space(2.5), fontSize: TEXT.xs, color: COLORS.textMuted },
  streakList: { marginTop: space(4), gap: space(4), borderTopWidth: 1, borderTopColor: COLORS.lineSoft, paddingTop: space(4) },
  streakGroup: { gap: space(1) },
  streakHead: { fontSize: 11, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  nsMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(2),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lineSoft,
    paddingVertical: space(1),
  },
  nsMemberName: { flex: 1, fontSize: TEXT.sm, color: COLORS.primary },
  nsStreak: { ...TNUM, fontSize: TEXT.xs, fontWeight: WEIGHT.bold, color: COLORS.dangerFg },

  muted: { fontSize: TEXT.sm, color: COLORS.textMuted },
});
