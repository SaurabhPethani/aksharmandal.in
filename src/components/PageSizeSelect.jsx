import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Select } from './form';
import { Text } from './Typography';
import { PAGE_SIZE_OPTIONS } from '../constants/pagination';
import { COLORS, TEXT, WEIGHT, space } from '../constants/theme';

const OPTIONS = PAGE_SIZE_OPTIONS.map(size => ({
  value: String(size),
  label: String(size),
}));

export default function PageSizeSelect({ value, onChange }) {
  if (!onChange) return null;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>Show</Text>
      <Select
        label="Rows per page"
        value={String(value)}
        options={OPTIONS}
        onChange={next => onChange(Number(next))}
        style={styles.select}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  label: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  select: {
    width: space(22),
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
});
