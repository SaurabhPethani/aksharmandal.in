import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../Typography';
import { Card, ErrorState, PageHeader, Skeleton, Toggle } from '../ui';
import { Breadcrumbs } from '../Navigation';
import { DatePicker, FormField } from '../form';
import { useToast } from '../../hooks/core';
import { useSittingsByDate, useToggleAttendanceOpen } from '../../hooks/useAttendance';
import { todayISO } from '../../utils/validation';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

// SuperAdmin-only: open/close a PAST Sabha sitting for attendance. The admin only
// flips availability here — the Sabha DB Manager / Head does the actual marking
// through the normal attendance screen once it is open.

function SittingRow({ s, toggle }) {
  const toast = useToast();
  const [open, setOpen] = useState(s.is_open);
  const [busy, setBusy] = useState(false);

  const flip = async () => {
    if (s.is_current_week || busy) return;
    const next = !open;
    setBusy(true);
    try {
      const res = await toggle.mutateAsync({ sabhaDetailId: s.sabha_detail_id, open: next });
      setOpen(next);
      toast.success(res?.detail || (next ? 'Opened for attendance.' : 'Closed.'));
    } catch (e) {
      toast.error(e?.message || 'Could not update.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowName}>
          {s.name}
          {s.type && s.type !== 'regular' ? <Text style={styles.rowType}> {s.type}</Text> : null}
        </Text>
        {s.mandal_name ? <Text style={styles.rowSub}>{s.mandal_name}</Text> : null}
        {s.pradesh_name ? <Text style={styles.rowSub}>{s.pradesh_name}</Text> : null}
        <Text style={styles.rowPresent}>{s.present_count} present</Text>
      </View>
      {s.is_current_week ? (
        <View style={styles.weekPill}>
          <Text style={styles.weekPillText}>This week</Text>
        </View>
      ) : (
        <View style={styles.toggleWrap}>
          <Text style={[styles.toggleLabel, open ? styles.openLabel : null]}>
            {open ? 'Open' : 'Closed'}
          </Text>
          <Toggle checked={open} onChange={flip} disabled={busy} label={`Toggle attendance for ${s.name}`} />
        </View>
      )}
    </View>
  );
}

export default function OpenView({ onBack }) {
  const [date, setDate] = useState(todayISO());
  const query = useSittingsByDate(date, true);
  const toggle = useToggleAttendanceOpen(date);
  const sittings = query.data ?? [];

  return (
    <View style={styles.stack}>
      <PageHeader
        title="Open Attendance"
        breadcrumbs={
          <Breadcrumbs items={[{ label: 'Attendance', onPress: onBack }, { label: 'Open Attendance' }]} onHome={onBack} />
        }
      />
      <Text style={styles.intro}>
        Attendance closes automatically each day. Pick a date, then switch a past Sabha on so its Sabha
        DB Manager / Head can mark it on the normal screen — switch it off again when done. This week’s
        sabhas are marked through the normal flow and can’t be toggled here.
      </Text>

      <Card>
        <FormField label="Date">
          <DatePicker value={date} max={todayISO()} placeholder="Select date" onChange={setDate} />
        </FormField>
      </Card>

      <Card style={styles.listCard}>
        <View style={styles.listHead}>
          <Text style={styles.listHeadText}>Sabhas on this date</Text>
        </View>
        {query.isLoading ? (
          <View style={styles.pad}>
            <Skeleton style={styles.skeleton} />
          </View>
        ) : query.error ? (
          <View style={styles.pad}>
            <ErrorState error={query.error} onRetry={query.refetch} title="Could not load sittings" />
          </View>
        ) : sittings.length === 0 ? (
          <Text style={styles.empty}>No Sabhas held on this date.</Text>
        ) : (
          <View>
            {sittings.map(s => (
              <SittingRow key={s.sabha_detail_id} s={s} toggle={toggle} />
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(5) },
  intro: { fontSize: TEXT.sm, color: COLORS.textMuted, lineHeight: TEXT.sm * 1.4 },
  listCard: { padding: 0, overflow: 'hidden' },
  listHead: { borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft, paddingHorizontal: space(4), paddingVertical: space(3) },
  listHeadText: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  pad: { padding: space(4) },
  skeleton: { height: space(16), width: '100%' },
  empty: { paddingHorizontal: space(4), paddingVertical: space(6), fontSize: TEXT.sm, color: COLORS.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(3),
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  rowCopy: { flex: 1 },
  rowName: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  rowType: { fontSize: TEXT.xs, fontWeight: WEIGHT.medium, textTransform: 'capitalize', color: COLORS.accent },
  rowSub: { fontSize: TEXT.xs, color: COLORS.textMuted },
  rowPresent: { marginTop: 2, fontSize: TEXT.xs, color: COLORS.textMuted },
  weekPill: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  weekPillText: { fontSize: 11, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  toggleWrap: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  toggleLabel: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  openLabel: { color: COLORS.successFg },
});
