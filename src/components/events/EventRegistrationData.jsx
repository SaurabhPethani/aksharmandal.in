import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '../ui';
import { FormField, Select } from '../form';
import {
  useEventDataExport,
  useEventRegistrationData,
  useRegistrationDataEvents,
} from '../../hooks/useEvents';
import { useToast } from '../../hooks/core';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

/**
 * Registered Data — the event creator's (or a higher rank's) view of EVERY
 * member registered for one of their events, with the poll answers, and Excel
 * export. Distinct from the Registered tab, which is the caller's OWN
 * registrations; here the backend gates access per event (creator-or-higher).
 *
 * One event at a time, chosen from the dropdown. "Download (Excel)" saves the
 * selected event's export to the phone's Downloads folder.
 */
function answerText(answers, field) {
  const v = (answers ?? {})[field.id];
  if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return '—';
  return Array.isArray(v) ? v.join(', ') : String(v);
}

function StatusPill({ confirmed }) {
  return (
    <View style={[styles.statusPill, confirmed ? styles.statusOk : styles.statusBad]}>
      <Text style={[styles.statusText, { color: confirmed ? COLORS.successFg : COLORS.dangerFg }]}>
        {confirmed ? 'Confirmed' : 'Denied'}
      </Text>
    </View>
  );
}

function RegistrationRow({ row, fields }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowName} numberOfLines={2}>{row.user_name}</Text>
        <StatusPill confirmed={Boolean(row.status)} />
      </View>
      <Text style={styles.rowMeta}>
        {[row.mobile_number, row.gender ?? '—', row.age != null ? `${row.age} yrs` : '—'].join('  ·  ')}
      </Text>
      {fields.length > 0 ? (
        <View style={styles.answers}>
          {fields.map(f => (
            <Text key={f.id} style={styles.answerText}>
              <Text style={styles.answerLabel}>{f.label}: </Text>
              {answerText(row.custom_answers, f)}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.rowFoot}>
        Registered by {row.register_by_name ?? '—'}
        {row.register_by_sabha ? ` · ${row.register_by_sabha}` : ''}
      </Text>
    </View>
  );
}

export default function EventRegistrationData({ enabled }) {
  const toast = useToast();
  const eventsQ = useRegistrationDataEvents(enabled);
  const events = useMemo(() => (Array.isArray(eventsQ.data) ? eventsQ.data : []), [eventsQ.data]);

  const [selectedId, setSelectedId] = useState('');
  // Land on the first event once the list arrives (or when it changes and the
  // current pick is gone).
  useEffect(() => {
    if (!events.length) { setSelectedId(''); return; }
    if (!events.some(e => String(e.id) === String(selectedId))) {
      setSelectedId(String(events[0].id));
    }
  }, [events, selectedId]);

  const dataQ = useEventRegistrationData(selectedId, enabled && Boolean(selectedId));
  const rows = Array.isArray(dataQ.data) ? dataQ.data : [];
  const fields = rows.find(r => r.event_custom_fields?.length)?.event_custom_fields ?? [];

  const exportM = useEventDataExport();
  const selectedEvent = events.find(e => String(e.id) === String(selectedId));

  const downloadOne = async () => {
    if (!selectedId) return;
    // Filename = "<Event title>_<ddmmyyyy>.xlsx" — the day the file is saved.
    const title =
      (selectedEvent?.title || `event-${selectedId}`)
        .replace(/[\\/:*?"<>|]+/g, '')
        .replace(/\s+/g, ' ')
        .trim() || `event-${selectedId}`;
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const datePart = `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}`;
    try {
      const result = await exportM.mutateAsync({
        eventId: selectedId,
        filename: `${title}_${datePart}.xlsx`,
      });
      if (result?.mode === 'download') {
        toast.success('Saved to your Downloads folder.');
      }
    } catch (err) {
      toast.error(err?.message || 'Could not download the file.');
    }
  };

  if (eventsQ.isLoading) return <Skeleton style={styles.skeleton} />;
  if (eventsQ.error) {
    return <ErrorState error={eventsQ.error} onRetry={eventsQ.refetch} title="Could not load events" />;
  }
  if (!events.length) {
    return (
      <Card>
        <EmptyState
          title="No event data available"
          hint="You can see registration data for events you created, or whose creator you outrank."
        />
      </Card>
    );
  }

  const eventOptions = events.map(e => ({
    value: String(e.id),
    label: `${e.title}${e.date ? ` · ${e.date}` : ''} (${e.total_registered})`,
  }));

  return (
    <View style={styles.stack}>
      <View style={styles.toolbar}>
        <FormField label="Event" compact>
          <Select
            value={selectedId}
            options={eventOptions}
            placeholder="Select event"
            onChange={setSelectedId}
          />
        </FormField>
        <Button
          variant="primary"
          onPress={downloadOne}
          disabled={!selectedId || exportM.isPending}
          busy={exportM.isPending}
        >
          <MaterialCommunityIcons name="microsoft-excel" size={space(5.5)} />
          Download (Excel)
        </Button>
      </View>

      {dataQ.isLoading ? (
        <Skeleton style={styles.skeleton} />
      ) : dataQ.error ? (
        <ErrorState error={dataQ.error} onRetry={dataQ.refetch} title="Could not load registrations" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title="No registrations yet" hint="Nobody has registered for this event." />
        </Card>
      ) : (
        <View style={styles.results}>
          <View style={styles.resultsHead}>
            <Text style={styles.resultsTitle} numberOfLines={1}>{selectedEvent?.title}</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{rows.length} registered</Text>
            </View>
          </View>
          <View style={styles.rows}>
            {rows.map(r => (
              <RegistrationRow key={r.id} row={r} fields={fields} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(4) },
  toolbar: { gap: space(3) },
  skeleton: { height: space(40), width: '100%' },
  results: {
    overflow: 'hidden',
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
  },
  resultsHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lineSoft,
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  resultsTitle: { flex: 1, minWidth: space(20), fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  countBadge: { borderRadius: RADII.full, backgroundColor: COLORS.surface, paddingHorizontal: space(2), paddingVertical: space(0.5) },
  countBadgeText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },
  rows: { padding: space(3), gap: space(2) },
  row: {
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: 'rgba(235,240,246,0.5)',
    padding: space(3),
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space(2) },
  rowName: { flex: 1, fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  statusPill: { flexShrink: 0, borderRadius: RADII.full, paddingHorizontal: space(2), paddingVertical: space(0.5) },
  statusOk: { backgroundColor: COLORS.successBg },
  statusBad: { backgroundColor: COLORS.dangerBg },
  statusText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },
  rowMeta: { marginTop: space(1), fontSize: TEXT.xs, color: COLORS.textMuted },
  answers: { marginTop: space(1.5), gap: space(0.5) },
  answerText: { fontSize: TEXT.xs, color: COLORS.textMuted },
  answerLabel: { fontWeight: WEIGHT.semibold, color: COLORS.primary },
  rowFoot: { marginTop: space(1.5), fontSize: TEXT.xs, color: COLORS.textFaint },
});
