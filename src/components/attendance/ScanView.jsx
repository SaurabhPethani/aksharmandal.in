import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../ui';
import { Breadcrumbs } from '../Navigation';
import { FormField, Combobox } from '../form';
import AttendanceMarker from './AttendanceMarker';
import { useSabhaDetails } from '../../hooks/useAttendance';
import { pickRows, toOptions } from '../../utils/options';
import { space } from '../../constants/theme';

// Attendance scanner — pick an open sitting, then mark it. The standalone entry
// (the normal path starts from a sitting's Mark link); the dropdown is all it
// adds, and everything under it is the same AttendanceMarker.

export default function ScanView({ onBack }) {
  const [sabhaId, setSabhaId] = useState('');
  const [scanning, setScanning] = useState(false);

  // Regular and special alike, but only sittings open for marking and not
  // cancelled — offering a closed one gives a dropdown whose marks the backend
  // would refuse.
  const sabhasQ = useSabhaDetails({ attendance: 1, status: true }, true);
  const sabhaRows = useMemo(() => pickRows(sabhasQ.data), [sabhasQ.data]);
  const selected = useMemo(
    () => sabhaRows.find(r => String(r.id) === String(sabhaId)) ?? null,
    [sabhaRows, sabhaId],
  );

  return (
    <View style={styles.stack}>
      <PageHeader
        title="Attendance Scanner"
        breadcrumbs={
          <Breadcrumbs items={[{ label: 'Attendance', onPress: onBack }, { label: 'Scanner' }]} onHome={onBack} />
        }
      />
      <Card style={styles.card}>
        {sabhasQ.isLoading ? (
          <Skeleton style={styles.skeleton} />
        ) : sabhasQ.error ? (
          <ErrorState error={sabhasQ.error} onRetry={sabhasQ.refetch} title="Could not load Sabhas" />
        ) : sabhaRows.length === 0 ? (
          <EmptyState
            icon="calendar-check"
            title="No Sabha available"
            hint="There is no active Sabha in your scope to take attendance for."
          />
        ) : (
          <>
            {!scanning ? (
              <FormField label="Select Sabha Instance" required>
                <Combobox
                  value={sabhaId}
                  label="Select Sabha Instance"
                  placeholder="Select sabha"
                  options={toOptions(sabhasQ.data, { labelKey: 'sabha_name' })}
                  onChange={setSabhaId}
                />
              </FormField>
            ) : null}
            <AttendanceMarker
              key={sabhaId || 'none'}
              sabhaDetailId={sabhaId}
              sabha={selected}
              onScanningChange={setScanning}
            />
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(5) },
  card: { gap: space(5) },
  skeleton: { height: space(14), width: '100%' },
});
