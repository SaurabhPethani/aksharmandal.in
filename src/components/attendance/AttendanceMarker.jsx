import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text, TextInput } from '../Typography';
import { useToast } from '../../hooks/core';
import { useMandalUsers } from '../../hooks/useLookups';
import { useSabhaMembers } from '../../hooks/useUsers';
import {
  useAttendanceSummary,
  useMarkAttendance,
  usePriorWeek,
} from '../../hooks/useAttendance';
import { Badge, EmptyState, ErrorState, Skeleton } from '../ui';
import QrScanner from './QrScanner';
import MemberPager from './MemberPager';
import AssemblyBroadcast from './AssemblyBroadcast';
import { useClientPagination } from '../../hooks/usePagination';
import { pickRows, searchMatches } from '../../utils/options';
import { memberIdFromCode } from '../../utils/qrCode';
import { formatNumber } from '../../utils/format';
import { COLORS, RADII, TEXT, TNUM, WEIGHT, space } from '../../constants/theme';

// MARKING ATTENDANCE FOR ONE SITTING — the scanner, the member list, the
// counters and the writes. The mobile port of the web's AttendanceMarker.
//
// Nothing about a member's status is held locally beyond the optimistic overlay:
// the row renders what the summary endpoint last reported, and marking refetches
// it, so a failed write leaves the row exactly as the backend has it.
//
// Mount this with `key={sabhaDetailId}` so switching sitting resets the camera
// and tally rather than carrying a half-finished session across.

const memberName = m => m?.user_name ?? m?.name ?? '—';

// `/users/list` returns `id`; `/users/get-all-mandal-users` returns `user_id`.
const memberId = m => m?.user_id ?? m?.id ?? null;

// The summary arrives in three shapes — `.attendance`, `.members`, or a bare
// array — so every map builder normalises the same way.
function summaryRows(summary) {
  return pickRows(summary?.attendance).length
    ? pickRows(summary.attendance)
    : pickRows(summary?.members).length
      ? pickRows(summary.members)
      : pickRows(summary);
}

/** userId -> present. `status` is an INTEGER (1 present / 0 absent). */
function presenceMap(summary) {
  const map = new Map();
  for (const row of summaryRows(summary)) {
    const id = row?.user_id ?? row?.id;
    if (id == null) continue;
    const raw = row.is_present ?? row.present ?? row.status;
    map.set(String(id), raw === true || raw === 1 || raw === '1');
  }
  return map;
}

/** userId -> user_sabha_id (home Sabha snapshot at attend time). */
function homeSabhaMap(summary) {
  const map = new Map();
  for (const row of summaryRows(summary)) {
    const id = row?.user_id ?? row?.id;
    if (id == null || row?.user_sabha_id == null) continue;
    map.set(String(id), Number(row.user_sabha_id));
  }
  return map;
}

/** userId -> the date they attended a DIFFERENT sitting in the same week. */
function elsewhereMap(summary) {
  const map = new Map();
  for (const row of summaryRows(summary)) {
    const id = row?.user_id ?? row?.id;
    if (id == null || !row?.elsewhere_date) continue;
    map.set(String(id), row.elsewhere_date);
  }
  return map;
}

/** userId -> home Sabha name (special sittings only). */
function homeSabhaNameMap(summary) {
  const map = new Map();
  for (const row of summaryRows(summary)) {
    const id = row?.user_id ?? row?.id;
    if (id == null || !row?.user_sabha_name) continue;
    map.set(String(id), row.user_sabha_name);
  }
  return map;
}

/** userIds who ALSO attended a Special sabha this week (regular-screen badge). */
function attendedSpecialSet(summary) {
  const set = new Set();
  for (const row of summaryRows(summary)) {
    const id = row?.user_id ?? row?.id;
    if (id != null && row?.attended_special === true) set.add(String(id));
  }
  return set;
}

/** ISO `YYYY-MM-DD` -> `DD-MM-YYYY` for the row label. */
function formatElsewhereDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** One figure in a counter strip — a coloured dot, a one-word label, a number. */
function Tally({ label, value, loading = false, tone = 'neutral', subtitle = null }) {
  return (
    <View style={styles.tally}>
      <View style={styles.tallyLabelRow}>
        <View style={[styles.tallyDot, TALLY_DOT[tone]]} />
        <Text numberOfLines={1} style={styles.tallyLabel}>
          {label}
        </Text>
      </View>
      {loading ? (
        <Skeleton style={styles.tallySkeleton} />
      ) : (
        <View style={styles.tallyValueRow}>
          {typeof value === 'string' || typeof value === 'number' ? (
            <Text style={[styles.tallyValue, TALLY_FIGURE[tone]]}>{value}</Text>
          ) : (
            value
          )}
        </View>
      )}
      {!loading && subtitle ? (
        <Text numberOfLines={1} style={styles.tallySub}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Two-choice pill control — scanner vs list, and this Sabha vs the Mandal. */
function Segmented({ value, onChange, options }) {
  return (
    <View style={styles.segmented}>
      {options.map(o => {
        const active = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text numberOfLines={1} style={[styles.segmentText, active && styles.segmentTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Chip({ label, count, active, gold = false, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        active && (gold ? styles.chipGold : styles.chipActive),
      ]}
    >
      <Text
        style={[
          styles.chipText,
          active && (gold ? styles.chipTextGold : styles.chipTextActive),
        ]}
      >
        {label} ({formatNumber(count)})
      </Text>
    </Pressable>
  );
}

export default function AttendanceMarker({ sabhaDetailId, sabha = null, onScanningChange }) {
  const toast = useToast();
  const mark = useMarkAttendance();

  const [mode, setMode] = useState('scanner'); // scanner | list
  const [listTab, setListTab] = useState('sabha'); // sabha | other
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | present | elsewhere | absent
  const [standing, setStanding] = useState(() => new Set());
  const [inFlight, setInFlight] = useState(() => new Set());
  const [optimistic, setOptimistic] = useState(() => new Map());
  const [scans, setScans] = useState({ total: 0, same: 0, other: 0 });
  const [scanStatus, setScanStatus] = useState('');
  const [scanTone, setScanTone] = useState('');
  const [scanning, setScanning] = useState(false);
  const confirmingRef = useRef(false);

  const showScan = (text, tone = '') => {
    setScanStatus(text);
    setScanTone(tone);
  };

  // Promise-based visitor confirm, native Alert. `confirmingRef` drops codes
  // scanned while the prompt is open so a second face cannot answer the first.
  const confirmVisitor = (name, sabhaLabel) =>
    new Promise(resolve => {
      confirmingRef.current = true;
      Alert.alert(
        'Not in this Special Sabha',
        `${name} isn't in ${sabhaLabel}. Do you still want to mark them present as a visitor?`,
        [
          {
            text: 'Skip',
            style: 'cancel',
            onPress: () => {
              confirmingRef.current = false;
              resolve(false);
            },
          },
          {
            text: 'Mark present',
            onPress: () => {
              confirmingRef.current = false;
              resolve(true);
            },
          },
        ],
        { cancelable: false },
      );
    });

  const setScanningState = active => {
    setScanning(active);
    onScanningChange?.(active);
  };

  const memberSabhaId = sabha?.sabha_id ?? sabha?.id ?? null;
  const isSpecial = String(sabha?.type ?? '').toLowerCase() === 'special';

  const summaryQ = useAttendanceSummary(sabhaDetailId || null);
  const priorQ = usePriorWeek(sabhaDetailId || null);
  const priorWeek = priorQ.data;

  const serverPresence = useMemo(() => presenceMap(summaryQ.data), [summaryQ.data]);
  const presence = useMemo(() => {
    if (!optimistic.size) return serverPresence;
    const merged = new Map(serverPresence);
    for (const [id, value] of optimistic) merged.set(id, value);
    return merged;
  }, [serverPresence, optimistic]);

  // Drop an optimistic entry once the refetch confirms it (but never while that
  // member still has a save in flight).
  useEffect(() => {
    if (!optimistic.size) return;
    setOptimistic(prev => {
      const next = new Map(prev);
      let changed = false;
      for (const [id, value] of prev) {
        if (!inFlight.has(id) && serverPresence.get(id) === value) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [serverPresence, inFlight, optimistic.size]);

  const elsewhere = useMemo(() => elsewhereMap(summaryQ.data), [summaryQ.data]);
  const homeSabha = useMemo(() => homeSabhaMap(summaryQ.data), [summaryQ.data]);
  const homeSabhaName = useMemo(() => homeSabhaNameMap(summaryQ.data), [summaryQ.data]);
  const attendedSpecial = useMemo(() => attendedSpecialSet(summaryQ.data), [summaryQ.data]);

  const specialRows = useMemo(() => {
    if (!isSpecial) return [];
    return summaryRows(summaryQ.data).filter(r => (r?.user_id ?? r?.id) != null);
  }, [summaryQ.data, isSpecial]);
  const isRosterSpecial = isSpecial && specialRows.length > 0;

  const rosterMembers = useMemo(() => specialRows.filter(r => !r?.is_visitor), [specialRows]);
  const visitorRows = useMemo(() => specialRows.filter(r => r?.is_visitor), [specialRows]);

  const activeTab = isRosterSpecial
    ? listTab === 'visitors'
      ? 'visitors'
      : 'roster'
    : isSpecial
      ? 'other'
      : listTab;

  const sabhaUsersQ = useSabhaMembers(memberSabhaId, Boolean(memberSabhaId));
  const mandalUsersQ = useMandalUsers(Boolean(sabhaDetailId) && activeTab === 'other');

  const sabhaUsers = sabhaUsersQ.rows;

  const otherUsers = useMemo(() => {
    const mine = new Set(sabhaUsers.map(m => String(memberId(m))));
    return pickRows(mandalUsersQ.data).filter(m => !mine.has(String(memberId(m))));
  }, [mandalUsersQ.data, sabhaUsers]);

  const activeQ = isRosterSpecial ? summaryQ : activeTab === 'sabha' ? sabhaUsersQ : mandalUsersQ;
  const activeRows = isRosterSpecial
    ? activeTab === 'visitors'
      ? visitorRows
      : rosterMembers
    : activeTab === 'sabha'
      ? sabhaUsers
      : otherUsers;

  const searched = useMemo(() => {
    let rows = activeRows;
    if (search.trim()) {
      rows = rows.filter(m =>
        searchMatches(`${memberName(m)} ${m.mobile_number ?? ''}`, search),
      );
    }
    if (standing.size) {
      rows = rows.filter(
        m =>
          (standing.has('ambrish') && m.is_ambrish) ||
          (standing.has('nimit') && m.is_nimit_sevak),
      );
    }
    return rows;
  }, [activeRows, search, standing]);

  const standingCounts = useMemo(() => {
    const base = search.trim()
      ? activeRows.filter(m =>
          searchMatches(`${memberName(m)} ${m.mobile_number ?? ''}`, search),
        )
      : activeRows;
    let ambrish = 0;
    let nimit = 0;
    for (const m of base) {
      if (m.is_ambrish) ambrish += 1;
      if (m.is_nimit_sevak) nimit += 1;
    }
    return { ambrish, nimit };
  }, [activeRows, search]);

  const counts = useMemo(() => {
    let present = 0;
    let elsewhereCount = 0;
    for (const m of searched) {
      const id = String(memberId(m));
      if (presence.get(id) === true) present += 1;
      else if (elsewhere.get(id)) elsewhereCount += 1;
    }
    return {
      all: searched.length,
      present,
      elsewhere: elsewhereCount,
      absent: searched.length - present - elsewhereCount,
    };
  }, [searched, presence, elsewhere]);

  const visible = useMemo(() => {
    if (statusFilter === 'all') return searched;
    return searched.filter(m => {
      const id = String(memberId(m));
      const isPresent = presence.get(id) === true;
      const isElsewhere = !isPresent && Boolean(elsewhere.get(id));
      if (statusFilter === 'present') return isPresent;
      if (statusFilter === 'elsewhere') return isElsewhere;
      return !isPresent && !isElsewhere;
    });
  }, [searched, statusFilter, presence, elsewhere]);

  // The whole Sabha is held in memory (the scanner must match any code), so the
  // list is paged client-side — the same arrangement the web uses on a desk.
  // The web shows the entire list on a phone; here it pages at the project
  // standard (25) so walking a 240-member Sabha is not one endless scroll.
  // Marking never turns the page: `visible` shrinking under a status filter is
  // clamped by the hook, and only the controls below reset to page 1.
  const { page, setPage, pageCount, total: pageTotal, pageRows } =
    useClientPagination(visible);

  // Back to the first page whenever the list the pager sits under is
  // reconstituted by a control — a new tab, a new search, a new filter — so the
  // reader is never left looking at an out-of-range page from the last list.
  useEffect(() => {
    setPage(1);
  }, [activeTab, search, statusFilter, standing, setPage]);

  const total = isRosterSpecial
    ? rosterMembers.length
    : summaryQ.data?.total_members ?? summaryQ.data?.total_count ?? sabhaUsers.length;
  const ownSabhaId = sabha?.sabha_id ?? null;

  const visitorCount = useMemo(() => {
    let v = 0;
    for (const m of visitorRows) if (presence.get(String(memberId(m))) === true) v += 1;
    return v;
  }, [visitorRows, presence]);

  const { present, guests, elsewhereCount } = useMemo(() => {
    if (isRosterSpecial) {
      let p = 0;
      for (const m of rosterMembers) if (presence.get(String(memberId(m))) === true) p += 1;
      return { present: p, guests: 0, elsewhereCount: 0 };
    }
    let ownPresent = 0;
    let guestsN = 0;
    let elseN = 0;
    for (const [uidStr, isPresent] of presence.entries()) {
      if (isPresent) {
        const home = homeSabha.get(uidStr);
        if (ownSabhaId != null && home === ownSabhaId) ownPresent += 1;
        else guestsN += 1;
      } else if (elsewhere.get(uidStr)) {
        elseN += 1;
      }
    }
    return { present: ownPresent, guests: guestsN, elsewhereCount: elseN };
  }, [presence, elsewhere, homeSabha, ownSabhaId, isRosterSpecial, rosterMembers]);

  const headCount = present + (isRosterSpecial ? visitorCount : guests);

  const presentBaseline =
    priorWeek && priorWeek.last_week_date ? priorWeek.present_same_time_last_week : null;
  const presentDelta = presentBaseline == null ? null : present - presentBaseline;

  const absent = Math.max(0, total - present - elsewhereCount);

  const setStatus = (member, next) => {
    const id = memberId(member);
    if (!sabhaDetailId || id == null) return Promise.resolve(false);
    const key = String(id);
    if (inFlight.has(key)) return Promise.resolve(false);

    setOptimistic(prev => new Map(prev).set(key, next));
    setInFlight(prev => new Set(prev).add(key));

    // `mutateAsync` + this call's own promise — NOT `mutate(vars, callbacks)`:
    // one observer is shared across the hook, so a burst of `mutate` orphans all
    // but the last callback and leaves rows spinning forever. See useAttendance.
    return mark
      .mutateAsync({ sabhaDetailId, userIds: [id], status: next })
      .then(() => true)
      .catch(err => {
        setOptimistic(prev => {
          const rolled = new Map(prev);
          rolled.delete(key);
          return rolled;
        });
        const who = member?.user_name ?? member?.name ?? `Member #${id}`;
        toast.error(
          err?.status === 0
            ? `Network error — ${who} was not marked. Check your connection.`
            : err?.detail || err?.message || `Could not update ${who}.`,
        );
        return false;
      })
      .finally(() => {
        setInFlight(prev => {
          const done = new Set(prev);
          done.delete(key);
          return done;
        });
      });
  };

  const onScan = async raw => {
    if (confirmingRef.current) return;

    const displayId = memberIdFromCode(raw);
    if (displayId == null) {
      showScan('QR Code Is Invalid. Use correct QR code', 'error');
      return;
    }
    const known = [...sabhaUsers, ...otherUsers].find(
      m => String(memberId(m)) === String(displayId),
    );
    if (presence.get(String(displayId))) {
      showScan(`${known ? memberName(known) : `Member #${displayId}`} Already marked present`, 'warn');
      return;
    }

    if (isRosterSpecial) {
      const inRoster = rosterMembers.some(r => String(r?.user_id ?? r?.id) === String(displayId));
      if (!inRoster) {
        const ok = await confirmVisitor(
          known ? memberName(known) : `Member #${displayId}`,
          sabha?.special_sabha_name || sabha?.sabha_name || 'this Special Sabha',
        );
        if (!ok) {
          showScan('Skipped — not in this Special Sabha');
          return;
        }
      }
    }

    let res;
    try {
      res = await mark.mutateAsync({ sabhaDetailId, qrToken: raw, status: true });
    } catch (err) {
      showScan(
        err?.status === 0
          ? 'Network error — nothing was marked. Check your connection.'
          : 'QR Code Is Invalid. Use correct QR code',
        'error',
      );
      return;
    }

    const marked = res?.data ?? null;
    const markedId = marked?.user_id ?? displayId;
    const markedName = marked?.name || (known ? memberName(known) : `Member #${markedId}`);

    if (marked?.is_duplicate) {
      showScan(`${markedName} Already marked present`, 'warn');
      return;
    }

    const isSame = sabhaUsers.some(m => String(memberId(m)) === String(markedId));
    setScans(s => ({
      total: s.total + 1,
      same: s.same + (isSame ? 1 : 0),
      other: s.other + (isSame ? 0 : 1),
    }));
    showScan(`${markedName} marked present`, 'ok');
  };

  const sabhaTabLabel = sabha ? String(sabha.sabha_name ?? 'Sabha Users') : 'Sabha Users';
  const mandalName = sabha?.mandal_name ? String(sabha.mandal_name).trim() : '';
  const otherTabLabel = isSpecial && mandalName
    ? `${mandalName} Members`
    : isSpecial
      ? 'Mandal Members'
      : 'Other Sabha';
  const rosterTabLabel = sabha?.special_sabha_name ? String(sabha.special_sabha_name) : 'Roster';

  const resetListControls = key => {
    setListTab(key);
    setSearch('');
    setStatusFilter('all');
    setStanding(new Set());
  };

  const toggleStanding = key =>
    setStanding(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const showStandingChips =
    !isRosterSpecial &&
    (standingCounts.ambrish > 0 || standingCounts.nimit > 0 || standing.size > 0);

  return (
    <View style={styles.stack}>
      {/* This session's scan tally, above the camera. */}
      {mode === 'scanner' && scanning ? (
        <View style={styles.tallyGrid3}>
          <Tally label="Total" value={scans.total} />
          <Tally label="This Sabha" value={scans.same} tone="ok" />
          <Tally label="Other" value={scans.other} />
        </View>
      ) : null}

      {!scanning ? (
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { key: 'scanner', label: 'Start Scanner' },
            { key: 'list', label: 'Member List' },
          ]}
        />
      ) : null}

      {mode === 'scanner' ? (
        <QrScanner
          onScan={onScan}
          disabled={!sabhaDetailId}
          disabledHint="Select a Sabha to enable the scanner."
          sessionLabel={sabha ? String(sabha.sabha_name ?? '') : null}
          status={scanStatus}
          statusTone={scanTone}
          onActiveChange={setScanningState}
        />
      ) : null}

      {/* The live-assembly WhatsApp broadcast — regular sittings only. */}
      {!scanning && Boolean(sabhaDetailId) && !isSpecial ? (
        <AssemblyBroadcast sabhaDetailId={sabhaDetailId} sabha={sabha} />
      ) : null}

      {Boolean(sabhaDetailId) && mode === 'list' ? (
        <View style={styles.stack}>
          {sabhaUsersQ.truncated ? (
            <View style={styles.truncated}>
              <Text style={styles.truncatedText}>
                Only {formatNumber(sabhaUsers.length)} of {formatNumber(sabhaUsersQ.total)} members
                could be loaded. Scanning will not find the rest — mark them from the member list,
                and report this so the limit can be raised.
              </Text>
            </View>
          ) : null}

          {/* Counter grid. */}
          <View style={styles.tallyGrid2}>
            <Tally label="Total" value={formatNumber(total)} loading={summaryQ.isLoading} />
            <Tally label="Absent" value={formatNumber(absent)} loading={summaryQ.isLoading} tone="bad" />
            <Tally
              label="Present"
              loading={summaryQ.isLoading}
              tone="ok"
              subtitle={
                isRosterSpecial && visitorCount
                  ? `+${formatNumber(visitorCount)} visitors · ${formatNumber(headCount)} in room`
                  : null
              }
              value={
                <View style={styles.presentValueRow}>
                  <Text style={[styles.tallyValue, TALLY_FIGURE.ok]}>{formatNumber(present)}</Text>
                  {presentDelta ? (
                    <View style={styles.deltaRow}>
                      <MaterialCommunityIcons
                        name={presentDelta > 0 ? 'arrow-up' : 'arrow-down'}
                        size={space(3)}
                        color={presentDelta > 0 ? COLORS.successFg : COLORS.dangerFg}
                      />
                      <Text
                        style={[
                          styles.deltaText,
                          { color: presentDelta > 0 ? COLORS.successFg : COLORS.dangerFg },
                        ]}
                      >
                        {formatNumber(Math.abs(presentDelta))}
                      </Text>
                    </View>
                  ) : null}
                </View>
              }
            />
            {isRosterSpecial ? (
              <Tally label="Visitors" value={formatNumber(visitorCount)} loading={summaryQ.isLoading} tone="ok" />
            ) : null}
            {!isSpecial ? (
              <Tally label="Elsewhere" value={formatNumber(elsewhereCount)} loading={summaryQ.isLoading} />
            ) : null}
            {!isSpecial ? (
              <Tally label="Other" value={formatNumber(guests)} loading={summaryQ.isLoading} />
            ) : null}
            {!isSpecial ? (
              <Tally label="Today" value={formatNumber(headCount)} loading={summaryQ.isLoading} tone="ok" />
            ) : null}
            {!isSpecial ? (
              <Tally
                label="Last Wk (same time)"
                loading={priorQ.isLoading}
                value={priorWeek ? formatNumber(priorWeek.present_same_time_last_week) : '—'}
              />
            ) : null}
            {!isSpecial ? (
              <Tally
                label="Last Wk P | A"
                loading={priorQ.isLoading}
                value={
                  priorWeek ? (
                    <View style={styles.presentValueRow}>
                      <Text style={[styles.tallyValue, TALLY_FIGURE.ok]}>
                        {formatNumber(priorWeek.last_week_present)}
                      </Text>
                      <Text style={styles.paPipe}>|</Text>
                      <Text style={[styles.tallyValue, TALLY_FIGURE.bad]}>
                        {formatNumber(priorWeek.last_week_absent)}
                      </Text>
                    </View>
                  ) : (
                    '—'
                  )
                }
              />
            ) : null}
          </View>

          {/* Tab control. */}
          <Segmented
            value={activeTab}
            onChange={resetListControls}
            options={
              isRosterSpecial
                ? [
                    { key: 'roster', label: rosterTabLabel },
                    { key: 'visitors', label: `Visitors (${formatNumber(visitorCount)})` },
                  ]
                : isSpecial
                  ? [{ key: 'other', label: otherTabLabel }]
                  : [
                      { key: 'sabha', label: sabhaTabLabel },
                      { key: 'other', label: otherTabLabel },
                    ]
            }
          />

          {/* Search. */}
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={space(4.5)} color="#6B7FA3" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or mobile"
              placeholderTextColor={COLORS.textFaint}
              autoCorrect={false}
              style={styles.searchInput}
            />
          </View>

          {/* Status + standing chips. */}
          <View style={styles.chipRow}>
            <Chip label="All" count={counts.all} active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
            <Chip label="Present" count={counts.present} active={statusFilter === 'present'} onPress={() => setStatusFilter('present')} />
            {!isSpecial ? (
              <Chip label="Elsewhere" count={counts.elsewhere} active={statusFilter === 'elsewhere'} onPress={() => setStatusFilter('elsewhere')} />
            ) : null}
            <Chip label="Absent" count={counts.absent} active={statusFilter === 'absent'} onPress={() => setStatusFilter('absent')} />
            {showStandingChips ? (
              <>
                <Chip label="Ambrish" count={standingCounts.ambrish} active={standing.has('ambrish')} gold onPress={() => toggleStanding('ambrish')} />
                <Chip label="Nimit Sevak" count={standingCounts.nimit} active={standing.has('nimit')} gold onPress={() => toggleStanding('nimit')} />
              </>
            ) : null}
          </View>

          {/* The list. */}
          {activeQ?.isLoading ? (
            <View style={styles.skeletonStack}>
              {[0, 1, 2, 3, 4].map(i => (
                <Skeleton key={i} style={styles.rowSkeleton} />
              ))}
            </View>
          ) : activeQ?.error ? (
            <ErrorState error={activeQ.error} onRetry={activeQ.refetch} title="Could not load members" />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="account-group-outline"
              title={
                search || statusFilter !== 'all'
                  ? 'No matches'
                  : activeTab === 'visitors'
                    ? 'No visitors yet'
                    : 'No members'
              }
              hint={
                search
                  ? 'No member matches that search.'
                  : statusFilter === 'present'
                    ? 'Nobody on this list is marked present yet.'
                    : statusFilter === 'elsewhere'
                      ? 'Nobody on this list was marked present at another Sabha this week.'
                      : statusFilter === 'absent'
                        ? 'Everyone on this list has attended somewhere this week.'
                        : activeTab === 'visitors'
                          ? 'Anyone scanned in who is not on this Special Sabha’s roster will appear here.'
                          : 'Nothing to show for this list.'
              }
            />
          ) : (
            <View style={styles.list}>
              {pageRows.map(m => {
                const id = memberId(m);
                const isPresent = presence.get(String(id)) === true;
                const writing = inFlight.has(String(id));
                const elsewhereISO = !isPresent ? elsewhere.get(String(id)) : null;
                const elsewhereLabel = elsewhereISO ? formatElsewhereDate(elsewhereISO) : null;
                const homeName = isRosterSpecial
                  ? m.user_sabha_name ?? homeSabhaName.get(String(id))
                  : null;
                const didSpecial = !isSpecial && attendedSpecial.has(String(id));
                const secondLine = [
                  activeTab === 'other' && m.sabha_name ? m.sabha_name : null,
                  elsewhereLabel,
                  homeName,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Pressable
                    key={String(id)}
                    disabled={writing}
                    onPress={() => setStatus(m, !isPresent)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isPresent, disabled: writing }}
                    accessibilityLabel={`Mark ${memberName(m)} present`}
                    style={({ pressed }) => [styles.row, pressed && !writing && styles.rowPressed]}
                  >
                    <View style={styles.rowCopy}>
                      <View style={styles.rowNameLine}>
                        <Text numberOfLines={1} style={styles.rowName}>
                          {memberName(m)}
                        </Text>
                        {m.is_family_member ? (
                          <View style={styles.familyPill}>
                            <Text style={styles.familyPillText}>Family</Text>
                          </View>
                        ) : null}
                        {didSpecial ? <Text style={styles.star}>★</Text> : null}
                      </View>
                      {secondLine ? (
                        <Text numberOfLines={1} style={styles.rowMeta}>
                          {secondLine}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.rowActions}>
                      <Badge tone={isPresent ? 'ok' : 'neutral'}>{isPresent ? 'P' : 'A'}</Badge>
                      {writing ? (
                        <ActivityIndicator size="small" color={COLORS.textFaint} />
                      ) : (
                        <View style={[styles.checkbox, isPresent && styles.checkboxOn]}>
                          {isPresent ? (
                            <MaterialCommunityIcons name="check" size={space(3.5)} color={COLORS.white} />
                          ) : null}
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
              {pageCount > 1 ? (
                <MemberPager page={page} pageCount={pageCount} total={pageTotal} onChange={setPage} />
              ) : (
                <Text style={styles.allShown}>All {formatNumber(visible.length)} shown</Text>
              )}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const TALLY_DOT = StyleSheet.create({
  neutral: { backgroundColor: 'rgba(0,49,88,0.4)' },
  ok: { backgroundColor: COLORS.successFg },
  bad: { backgroundColor: COLORS.dangerFg },
});
const TALLY_FIGURE = StyleSheet.create({
  neutral: { color: COLORS.primary },
  ok: { color: COLORS.successFg },
  bad: { color: COLORS.dangerFg },
});

const styles = StyleSheet.create({
  stack: { gap: space(5) },
  tallyGrid3: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2.5) },
  tallyGrid2: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2.5) },
  tally: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: space(22),
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    alignItems: 'center',
  },
  tallyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  tallyDot: { width: 6, height: 6, borderRadius: 3 },
  tallyLabel: {
    fontSize: 11,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
  tallySkeleton: { marginTop: space(1.5), height: space(6), width: space(12) },
  tallyValueRow: { marginTop: space(1), flexDirection: 'row', alignItems: 'baseline' },
  tallyValue: { ...TNUM, fontSize: TEXT['2xl'], fontWeight: WEIGHT.bold },
  tallySub: { marginTop: space(1), fontSize: 10, fontWeight: WEIGHT.medium, color: COLORS.textMuted },
  presentValueRow: { marginTop: space(1), flexDirection: 'row', alignItems: 'baseline', gap: space(1) },
  deltaRow: { flexDirection: 'row', alignItems: 'center' },
  deltaText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },
  paPipe: { paddingHorizontal: space(1), color: COLORS.textFaint },

  segmented: {
    flexDirection: 'row',
    gap: space(1),
    borderRadius: RADII['2xl'],
    backgroundColor: '#F0F4F8',
    padding: space(1),
  },
  segment: {
    flex: 1,
    borderRadius: RADII.xl,
    paddingHorizontal: space(4),
    paddingVertical: space(2.5),
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: COLORS.white,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  segmentTextActive: { color: COLORS.primary },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2) },
  chip: {
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  chipGold: { borderColor: '#F5A623', backgroundColor: '#FDF0D8' },
  chipText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  chipTextActive: { color: COLORS.white },
  chipTextGold: { color: '#B4790F' },

  truncated: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: 'rgba(255,134,42,0.4)',
    backgroundColor: 'rgba(255,134,42,0.1)',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  truncatedText: { fontSize: TEXT.sm, color: COLORS.primary },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: '#E0EAF4',
    backgroundColor: COLORS.white,
    paddingHorizontal: space(3),
  },
  searchInput: { flex: 1, paddingVertical: space(2.5), fontSize: TEXT.sm, color: COLORS.primary },

  skeletonStack: { gap: space(2) },
  rowSkeleton: { height: space(14), width: '100%' },

  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F9',
    paddingVertical: space(3),
    paddingHorizontal: space(1),
  },
  rowPressed: { backgroundColor: 'rgba(229,238,245,0.4)' },
  rowCopy: { flex: 1 },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  rowName: { flexShrink: 1, fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  rowMeta: { marginTop: 2, fontSize: TEXT.xs, color: COLORS.textMuted },
  familyPill: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(1.5),
    paddingVertical: 1,
  },
  familyPillText: { fontSize: 10, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  star: { fontSize: TEXT.base, color: '#F5A623' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: space(2.5) },
  checkbox: {
    width: space(5),
    height: space(5),
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.lineInput,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: COLORS.successFg, backgroundColor: COLORS.successFg },
  allShown: {
    ...TNUM,
    paddingVertical: space(2),
    textAlign: 'center',
    fontSize: TEXT.xs,
    color: COLORS.textMuted,
  },
});
