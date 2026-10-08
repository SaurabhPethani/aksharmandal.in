import React from 'react';
import { StyleSheet, View } from 'react-native';
import FormDialog from '../FormDialog';
import { Text } from '../Typography';
import { EmptyState, ErrorState, Skeleton } from '../ui';
import { useEventFieldResults } from '../../hooks/useEvents';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

/**
 * Poll results for one event — the per-option tallies of its custom fields.
 * Organiser-only (the endpoint is EVENTS:CREATE) and scoped to the caller's
 * hierarchy band, so a Sabha Head sees their sabha's answers.
 *
 * Read-only: no submit button, just Close. The query is `enabled` on `isOpen`
 * so it fires when the dialog opens and refetches after any registration
 * (the mutation invalidates `event-field-results`).
 */
function Bar({ value, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={styles.barRow}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={1}>{value}</Text>
        <Text style={styles.barCount}>
          {count}
          {total > 0 ? <Text style={styles.barPct}> · {pct}%</Text> : null}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

export default function EventResultsDialog({ event, isOpen, onClose }) {
  const { data, isLoading, error, refetch } = useEventFieldResults(event?.id, isOpen);
  const results = Array.isArray(data) ? data : [];

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Responses · ${event?.title ?? 'Event'}`}
      hideSubmit
      cancelLabel="Close"
      size="lg"
    >
      {isLoading ? (
        <Skeleton style={styles.skeleton} />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} title="Could not load responses" />
      ) : results.length === 0 ? (
        <EmptyState
          title="No responses yet"
          hint="This event has no custom fields, or nobody confirmed has answered them."
        />
      ) : (
        <View style={styles.list}>
          {results.map(f => {
            const isChoice = f.type === 'single' || f.type === 'multi';
            return (
              <View key={f.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>{f.label}</Text>
                  <Text style={styles.cardMeta}>
                    {f.total_responses} {f.total_responses === 1 ? 'response' : 'responses'}
                    {!isChoice ? ` · ${f.type}` : ''}
                    {f.type === 'multi' ? ' · multi' : ''}
                  </Text>
                </View>
                {isChoice ? (
                  <View style={styles.bars}>
                    {f.options.map(o => (
                      <Bar key={o.value} value={o.value} count={o.count} total={f.total_responses} />
                    ))}
                  </View>
                ) : (
                  // Value field: each answer is unique, so there is nothing to
                  // chart — the values themselves live in Registered Data / Excel.
                  <Text style={styles.plainHint}>
                    Individual values — open the Registered Data tab or the Excel export to read them.
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </FormDialog>
  );
}

const styles = StyleSheet.create({
  skeleton: { height: space(40), width: '100%' },
  list: { gap: space(5) },
  card: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    padding: space(4),
  },
  cardHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space(2),
    marginBottom: space(2),
  },
  cardTitle: { fontSize: TEXT.base, fontWeight: WEIGHT.bold, color: COLORS.primary },
  cardMeta: { fontSize: TEXT.xs, color: COLORS.textMuted },
  bars: { gap: space(2.5) },
  barRow: {},
  barHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space(2),
    marginBottom: space(0.5),
  },
  barLabel: { flexShrink: 1, fontSize: TEXT.sm, fontWeight: WEIGHT.medium, color: COLORS.primary },
  barCount: { flexShrink: 0, fontSize: TEXT.sm, color: COLORS.textMuted },
  barPct: { fontSize: TEXT.xs, color: COLORS.textFaint },
  track: { height: space(2), borderRadius: RADII.full, overflow: 'hidden', backgroundColor: COLORS.bg },
  fill: { height: '100%', borderRadius: RADII.full, backgroundColor: COLORS.accent },
  plainHint: { fontSize: TEXT.xs, color: COLORS.textFaint },
});
