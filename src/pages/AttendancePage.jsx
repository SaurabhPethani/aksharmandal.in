import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import AppHeader from '../components/AppHeader';
import ScrollViewWithTop from '../components/ScrollToTop';
import SiteFooter from '../components/SiteFooter';
import { Text } from '../components/Typography';
import { Modal } from '../components/Overlays';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { Tabs } from '../components/Navigation';
import AttendanceRecordDialog from '../components/attendance/AttendanceRecordDialog';
import {
  SabhaCard,
  ScheduleCard,
  RecurringSabhaCard,
  SectionHeading,
} from '../components/attendance/AttendanceCards';
import MarkView from '../components/attendance/MarkView';
import ScanView from '../components/attendance/ScanView';
import HistoryView from '../components/attendance/HistoryView';
import OpenView from '../components/attendance/OpenView';
import ReportView from '../components/attendance/ReportView';
import { useToast } from '../hooks/core';
import { useMyPermissions } from '../hooks/useMyPermissions';
import { useCategories } from '../hooks/useLookups';
import {
  useSabhaDetails,
  useSabhaSchedules,
  useSpecialSchedules,
} from '../hooks/useAttendance';
import { ACTIONS, MODULES } from '../constants/permissions';
import {
  SABHA_SESSION_FORM,
  SCHEDULE_FORM,
  SPECIAL_SABHA_FORM,
  SPECIAL_RECURRING_FORM,
} from '../utils/attendanceFormSchema';
import { daysBetween, readDate, todayKey } from '../utils/dates';
import { pickRows } from '../utils/options';
import { COLORS, TEXT, WEIGHT, space } from '../constants/theme';

// Attendance landing — three tabs (Regular, Special, Schedules), each a list of
// sitting cards. Marking starts from a sitting's own Mark button, which opens the
// marker against that sitting — no dropdown to get wrong. The scanner, track
// history and open-attendance tools open as internal views under one route (the
// app's navigator carries no params, so the feature keeps its own view stack).

const SPECIAL_ONEOFF_HIDE_DAYS = 7;

function groupByWhen(rows) {
  const today = todayKey();
  const buckets = { ongoing: [], past: [] };
  for (const row of rows) {
    const date = readDate(row?.date);
    if (!date) {
      buckets.past.push(row);
      continue;
    }
    if (daysBetween(date.key, today) >= 0) buckets.ongoing.push(row);
    else buckets.past.push(row);
  }
  const dateKey = row => readDate(row?.date)?.key ?? '';
  buckets.ongoing.sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
  buckets.past.sort((a, b) => {
    const [ka, kb] = [dateKey(a), dateKey(b)];
    if (!ka || !kb) return ka ? -1 : kb ? 1 : 0;
    return kb.localeCompare(ka);
  });
  return [
    { key: 'ongoing', label: 'Ongoing', rows: buckets.ongoing },
    { key: 'past', label: 'Past', rows: buckets.past },
  ].filter(s => s.rows.length > 0);
}

function collapseRecurringSpecials(rows) {
  const groups = new Map();
  for (const row of rows) {
    const name = row?.special_sabha_name;
    const key = name ? `${row?.mandal_name ?? ''}::${name}` : `__id_${row?.id ?? Math.random()}`;
    const dk = readDate(row?.date)?.key ?? '';
    const cur = groups.get(key);
    if (!cur) {
      groups.set(key, { row, count: 1, dk });
      continue;
    }
    cur.count += 1;
    if (dk.localeCompare(cur.dk) > 0) {
      cur.row = row;
      cur.dk = dk;
    }
  }
  return Array.from(groups.values()).map(({ row, count }) =>
    count > 1 ? { ...row, occurrence_count: count } : row,
  );
}

export default function AttendancePage({
  onBack,
  onMenu,
  onHelp,
  onNotifications,
  onOpenPrivacy,
  onOpenTerms,
  onOpenDeleteAccount,
  onProfile,
}) {
  const permissionsQ = useMyPermissions();
  const permissions = permissionsQ.data;
  const toast = useToast();

  const [view, setView] = useState('landing'); // landing | mark | scan | history | open | report
  const [activeSabha, setActiveSabha] = useState(null);
  const [tab, setTab] = useState('regular');
  const [editing, setEditing] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  const goLanding = () => {
    setView('landing');
    setActiveSabha(null);
  };

  // Android hardware back: pop an internal view first, else leave the feature.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view !== 'landing') {
        goLanding();
        return true;
      }
      onBack?.();
      return true;
    });
    return () => sub.remove();
  }, [view, onBack]);

  const allowed = (m, a) => Boolean(permissions?.can(m, a));
  const superAdmin =
    permissions?.roleName === 'SuperAdmin' || Number(permissions?.roleId) === 1;

  const hasReadAction = Boolean(permissions?.byName?.[MODULES.ATTENDANCE]?.actions?.READ);
  const canRead = hasReadAction ? allowed(MODULES.ATTENDANCE, ACTIONS.READ) : true;
  const canCreate = allowed(MODULES.ATTENDANCE, ACTIONS.CREATE);
  const canUpdate = allowed(MODULES.ATTENDANCE, ACTIONS.UPDATE);
  const canAttendanceReport = allowed(MODULES.ATTENDANCE, ACTIONS.REPORT);
  const canSpecialCreate = allowed(MODULES.SPECIAL_SABHA, ACTIONS.CREATE);
  const canSpecialMark = allowed(MODULES.SPECIAL_SABHA, ACTIONS.MARK);
  const canSpecialReport = allowed(MODULES.SPECIAL_SABHA, ACTIONS.REPORT);
  const canManageSpecial = canSpecialCreate || canUpdate;
  const canHistory = allowed(MODULES.ATTENDANCE_HISTORY, ACTIONS.VIEW) || superAdmin;
  const canScan = canCreate || canSpecialMark;

  const hasAnyAccess =
    Boolean(permissions?.byName?.[MODULES.ATTENDANCE]) ||
    canCreate ||
    canUpdate ||
    canAttendanceReport ||
    canManageSpecial ||
    canHistory ||
    superAdmin;

  const regularQ = useSabhaDetails({ type: 'regular' }, canRead && view === 'landing');
  const specialQ = useSabhaDetails({ type: 'special' }, canRead && view === 'landing');
  const scheduleQ = useSabhaSchedules(canRead && view === 'landing');
  const specialScheduleQ = useSpecialSchedules(canManageSpecial && view === 'landing');
  const categoriesQ = useCategories(canManageSpecial && view === 'landing');

  const specialRules = useMemo(
    () => (canManageSpecial ? pickRows(specialScheduleQ.data) : []),
    [canManageSpecial, specialScheduleQ.data],
  );
  const categoryNameById = useMemo(() => {
    const map = {};
    for (const c of pickRows(categoriesQ.data)) map[c.id] = c.name;
    return map;
  }, [categoriesQ.data]);

  const specialVisible = useMemo(() => {
    const collapsed = collapseRecurringSpecials(pickRows(specialQ.data));
    const recurringKeys = new Set(
      specialRules
        .filter(r => r?.special_sabha_name)
        .map(r => `${r?.mandal_name ?? ''}::${r.special_sabha_name}`),
    );
    const today = todayKey();
    return collapsed.filter(row => {
      const isRecurring =
        (row?.occurrence_count ?? 1) > 1 ||
        (row?.special_sabha_name &&
          recurringKeys.has(`${row?.mandal_name ?? ''}::${row.special_sabha_name}`));
      if (isRecurring) return true;
      const key = readDate(row?.date)?.key;
      if (!key) return true;
      return daysBetween(today, key) <= SPECIAL_ONEOFF_HIDE_DAYS;
    });
  }, [specialQ.data, specialRules]);

  const query = { regular: regularQ, special: specialQ, schedule: scheduleQ }[tab];
  const rows = useMemo(
    () => (tab === 'special' ? specialVisible : pickRows(query?.data)),
    [tab, specialVisible, query?.data],
  );
  const sections = tab === 'schedule' ? [] : groupByWhen(rows);

  const TAB_LIST = [
    { value: 'regular', label: 'Regular', count: pickRows(regularQ.data).length },
    { value: 'special', label: 'Special', count: specialVisible.length },
    { value: 'schedule', label: 'Schedules', count: pickRows(scheduleQ.data).length },
  ];

  const startMarking = row => {
    const vakta = String(row?.vakta ?? '').trim();
    const topic = String(row?.topic ?? '').trim();
    if (!vakta || !topic) {
      const missing = !vakta && !topic ? 'Vakta and Topic' : !vakta ? 'Vakta' : 'Topic';
      toast.info(`Please fill ${missing} before marking attendance.`);
      setEditing({ form: SABHA_SESSION_FORM, record: row });
      return;
    }
    setActiveSabha(row);
    setView('mark');
  };

  const openReport = row => {
    setActiveSabha(row);
    setView('report');
  };

  const header = (
    <AppHeader
      onMenu={onMenu}
      onHelp={onHelp}
      onNotifications={onNotifications}
      onProfile={onProfile}
      onBack={view === 'landing' ? onBack : goLanding}
    />
  );

  // Permissions still loading / errored.
  if (!permissions) {
    return (
      <View style={styles.safe}>
        {header}
        <View style={styles.state}>
          {permissionsQ.error ? (
            <ErrorState
              error={permissionsQ.error}
              onRetry={permissionsQ.refetch}
              title="Could not load your access"
            />
          ) : (
            <Skeleton style={styles.tabSkeleton} />
          )}
        </View>
      </View>
    );
  }

  if (!hasAnyAccess) {
    return (
      <View style={styles.safe}>
        {header}
        <View style={styles.state}>
          <EmptyState title="No access" hint="Attendance is not enabled for your role." />
        </View>
      </View>
    );
  }

  const tools = [
    canScan ? { key: 'scan', icon: 'qrcode-scan', label: 'Attendance Scanner' } : null,
    canHistory ? { key: 'history', icon: 'history', label: 'Track History' } : null,
    superAdmin ? { key: 'open', icon: 'lock-open-variant-outline', label: 'Open Attendance' } : null,
  ].filter(Boolean);

  let content;
  if (view === 'mark') {
    content = (
      <MarkView
        sabha={activeSabha}
        canUpdate={canUpdate}
        onBack={goLanding}
        onReport={canAttendanceReport || canSpecialReport ? openReport : null}
      />
    );
  } else if (view === 'report') {
    content = <ReportView sabha={activeSabha} onBack={goLanding} />;
  } else if (view === 'scan') {
    content = <ScanView onBack={goLanding} />;
  } else if (view === 'history') {
    content = <HistoryView onBack={goLanding} />;
  } else if (view === 'open') {
    content = <OpenView onBack={goLanding} />;
  } else {
    content = (
      <View style={styles.landing}>
        <PageHeader
          title="Attendance"
          actions={
            tools.length ? (
              <Button variant="ghost" onPress={() => setToolsOpen(true)}>
                <MaterialCommunityIcons name="dots-vertical" size={space(5)} color={COLORS.primary} />
              </Button>
            ) : null
          }
        />

        <Tabs
          tabs={TAB_LIST.map(t => ({ value: t.value, label: t.label, count: t.count }))}
          value={tab}
          onChange={setTab}
          variant="solid"
        />

        {!canRead ? (
          <Card>
            <Text style={styles.muted}>Viewing attendance requires the Attendance · Read permission.</Text>
          </Card>
        ) : query?.isLoading ? (
          <View style={styles.cardStack}>
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} style={styles.cardSkeleton} />
            ))}
          </View>
        ) : query?.error ? (
          <Card>
            <ErrorState error={query.error} onRetry={query.refetch} title="Could not load this list" />
          </Card>
        ) : rows.length === 0 && !(tab === 'schedule' && specialRules.length > 0) ? (
          <Card>
            <EmptyState icon="calendar-check" title="Nothing here yet" hint="Nothing in your scope for this tab." />
          </Card>
        ) : tab === 'schedule' ? (
          <View style={styles.sectionStack}>
            {(canUpdate || canSpecialCreate) ? (
              <View style={styles.createRow}>
                {canUpdate ? (
                  <Button variant="accent" onPress={() => setEditing({ form: SCHEDULE_FORM, record: null })}>
                    <MaterialCommunityIcons name="plus" size={space(4)} />
                    New Schedule
                  </Button>
                ) : null}
                <Button variant="accent" onPress={() => setEditing({ form: SPECIAL_SABHA_FORM, record: null })}>
                  <MaterialCommunityIcons name="plus" size={space(4)} />
                  New Special Sabha
                </Button>
              </View>
            ) : null}

            {specialRules.length > 0 ? (
              <View style={styles.group}>
                <SectionHeading label="Recurring Special Sabhas" />
                {specialRules.map((row, i) => (
                  <RecurringSabhaCard
                    key={row.id ?? i}
                    row={row}
                    categoryNameById={categoryNameById}
                    canEdit={canManageSpecial}
                    onEdit={r => setEditing({ form: SPECIAL_RECURRING_FORM, record: r })}
                    onReport={null}
                  />
                ))}
              </View>
            ) : null}

            {rows.length > 0 ? (
              <View style={styles.group}>
                {specialRules.length > 0 ? <SectionHeading label="Weekly Schedules" /> : null}
                {rows.map((row, i) => (
                  <ScheduleCard
                    key={row.id ?? i}
                    row={row}
                    canEdit={canUpdate}
                    onEdit={r => setEditing({ form: SCHEDULE_FORM, record: r })}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.sectionStack}>
            {sections.map(section => (
              <View key={section.key} style={styles.group}>
                <SectionHeading label={section.label} />
                {section.rows.map((row, i) => {
                  const isSpecialRow = row?.type === 'special' || row?.sabha_id == null;
                  const mayMark = isSpecialRow ? canCreate || canSpecialMark : canCreate;
                  const mayReport = isSpecialRow
                    ? canAttendanceReport || canSpecialReport
                    : canAttendanceReport;
                  return (
                    <SabhaCard
                      key={row.id ?? i}
                      row={row}
                      canEdit={canUpdate || (isSpecialRow && canSpecialCreate)}
                      canMarkAttendance={mayMark}
                      onEdit={r => setEditing({ form: SABHA_SESSION_FORM, record: r })}
                      onMark={startMarking}
                      onReport={mayReport ? openReport : null}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      {header}
      <ScrollViewWithTop style={styles.flex} contentContainerStyle={styles.content}>
        {content}
        <View style={styles.footerBleed}>
          <SiteFooter onPrivacy={onOpenPrivacy} onTerms={onOpenTerms} onDeleteAccount={onOpenDeleteAccount} />
        </View>
      </ScrollViewWithTop>

      <AttendanceRecordDialog
        form={editing?.form ?? SCHEDULE_FORM}
        record={editing?.record ?? null}
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
      />

      <Modal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} title="Attendance tools" size="sm">
        <View style={styles.toolList}>
          {tools.map(t => (
            <Pressable
              key={t.key}
              onPress={() => {
                setToolsOpen(false);
                setView(t.key);
              }}
              style={({ pressed }) => [styles.toolRow, pressed && styles.toolRowPressed]}
            >
              <MaterialCommunityIcons name={t.icon} size={space(5)} color={COLORS.primary} />
              <Text style={styles.toolLabel}>{t.label}</Text>
              <MaterialCommunityIcons name="chevron-right" size={space(4.5)} color={COLORS.textFaint} />
            </Pressable>
          ))}
          {tools.length === 0 ? <Text style={styles.muted}>No tools available for your role.</Text> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: space(4.5), paddingBottom: 0, gap: space(5) },
  state: { flex: 1, padding: space(4.5) },
  tabSkeleton: { height: space(10), width: '100%' },
  landing: { gap: space(5) },
  muted: { fontSize: TEXT.sm, color: COLORS.textMuted },
  cardStack: { gap: space(4) },
  cardSkeleton: { height: space(36), width: '100%' },
  sectionStack: { gap: space(6) },
  group: { gap: space(3) },
  createRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  footerBleed: { marginTop: 'auto', marginHorizontal: -space(4.5), paddingTop: space(3.5) },
  toolList: { gap: space(1) },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    borderRadius: 12,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
  },
  toolRowPressed: { backgroundColor: COLORS.primary50 },
  toolLabel: { flex: 1, fontSize: TEXT.base, fontWeight: WEIGHT.semibold, color: COLORS.primary },
});
