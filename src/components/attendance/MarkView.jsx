import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Button, Card, EmptyState, PageHeader } from '../ui';
import { Breadcrumbs } from '../Navigation';
import AttendanceMarker from './AttendanceMarker';
import AttendanceRecordDialog from './AttendanceRecordDialog';
import { SABHA_SESSION_FORM, SPECIAL_SABHA_FORM } from '../../utils/attendanceFormSchema';
import { readDate, readClock } from '../../utils/dates';
import { COLORS, TEXT, TNUM, WEIGHT, space } from '../../constants/theme';

// Marking attendance for ONE sitting — the summary strip and the marker, on the
// sitting whose Mark link was followed. The sitting is handed in by the landing
// (no "select Sabha" step: asking again is how attendance lands on the wrong
// Sabha). The Vakta/Topic gate is enforced here too, so it holds however the
// screen is reached.

function Fact({ icon, label, value, tnum = false }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <MaterialCommunityIcons name={icon} size={space(4)} color={COLORS.accent} />
      <View style={styles.factCopy}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text numberOfLines={1} style={[styles.factValue, tnum && TNUM]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function MarkView({ sabha, canUpdate, onBack, onReport }) {
  const [editing, setEditing] = useState(false);

  const when = readDate(sabha?.date);
  const time = readClock(sabha?.time);
  const title = sabha?.special_sabha_name || sabha?.sabha_name || 'Mark Attendance';

  const header = (
    <PageHeader
      title="Mark Attendance"
      subtitle={sabha ? title : undefined}
      breadcrumbs={
        <Breadcrumbs items={[{ label: 'Attendance', onPress: onBack }, { label: 'Mark' }]} onHome={onBack} />
      }
      actions={
        onReport ? (
          <Button variant="outline" onPress={() => onReport(sabha)}>
            <MaterialCommunityIcons name="chart-bar" size={space(4)} />
            View Report
          </Button>
        ) : null
      }
    />
  );

  const gateVakta = String(sabha?.vakta ?? '').trim();
  const gateTopic = String(sabha?.topic ?? '').trim();
  if (!gateVakta || !gateTopic) {
    const missing = !gateVakta && !gateTopic ? 'Vakta and Topic' : !gateVakta ? 'Vakta' : 'Topic';
    return (
      <View style={styles.stack}>
        {header}
        <Card style={styles.gateCard}>
          <EmptyState
            icon="microphone"
            title={`Add ${missing} before marking`}
            hint={
              canUpdate
                ? `This sitting has no ${missing}. Add it to start marking — the report stays available either way.`
                : `This sitting has no ${missing}. Attendance cannot be taken until a Sabha manager fills it in.`
            }
          />
          <View style={styles.gateActions}>
            {canUpdate ? (
              <Button variant="accent" onPress={() => setEditing(true)}>
                <MaterialCommunityIcons name="microphone" size={space(4)} />
                Add {missing}
              </Button>
            ) : null}
            {onReport ? (
              <Button variant="outline" onPress={() => onReport(sabha)}>
                <MaterialCommunityIcons name="chart-bar" size={space(4)} />
                View Report
              </Button>
            ) : null}
          </View>
        </Card>
        <AttendanceRecordDialog
          form={sabha?.special_sabha_name ? SPECIAL_SABHA_FORM : SABHA_SESSION_FORM}
          record={sabha}
          isOpen={editing}
          onClose={() => setEditing(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {header}
      <Card>
        <Text style={styles.summaryTitle}>{title}</Text>
        <View style={styles.factGrid}>
          <Fact icon="calendar-blank-outline" label="Date" value={when?.date} tnum />
          <Fact icon="calendar-blank-outline" label="Day" value={when?.day} />
          <Fact icon="clock-outline" label="Time" value={time} tnum />
          <Fact icon="microphone" label="Vakta" value={sabha?.vakta || null} />
        </View>
      </Card>
      <Card>
        <AttendanceMarker sabhaDetailId={sabha.id} sabha={sabha} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(5) },
  gateCard: { gap: space(4) },
  gateActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space(2) },
  summaryTitle: { fontSize: TEXT.base, fontWeight: WEIGHT.bold, color: COLORS.primary },
  factGrid: { marginTop: space(3), flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  fact: { flexDirection: 'row', alignItems: 'center', gap: space(2), flexGrow: 1, flexBasis: '40%' },
  factCopy: { flexShrink: 1 },
  factLabel: {
    fontSize: 10,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: COLORS.textFaint,
  },
  factValue: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
});
