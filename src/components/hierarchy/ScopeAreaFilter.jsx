import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import MultiSelectFilter from '../form/MultiSelectFilter';
import {
  AREA_LEVELS,
  EMPTY_AREA_SELECTION,
  availableAt,
  pruneSelection,
} from '../../utils/scopeArea';
import { space } from '../../constants/theme';

/** One multi-select per area level the caller's scope offers. */
export default function ScopeAreaFilter({
  filters,
  value,
  onChange,
  /** Open each list under its own button; `openKey` keeps one open at a time. */
  inline = false,
  openKey,
  onOpenKey,
}) {
  const selection = { ...EMPTY_AREA_SELECTION, ...(value || {}) };

  // A selection restored from before may name options no longer offered.
  useEffect(() => {
    if (!filters) return;
    const cleaned = pruneSelection(selection, filters);
    const changed = AREA_LEVELS.some(
      level => cleaned[level.key].length !== selection[level.key].length,
    );
    if (changed) onChange(cleaned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  if (!filters) return null;

  const controls = AREA_LEVELS.map((level, index) => {
    if (!filters[level.show]) return null;
    const options = availableAt(index, selection, filters);
    if (!options.length) return null;
    return (
      <MultiSelectFilter
        key={level.key}
        label={`Filter by ${level.label}`}
        allLabel={level.all}
        options={options}
        value={selection[level.key]}
        inline={inline}
        open={inline && onOpenKey ? openKey === level.key : undefined}
        onOpenChange={
          onOpenKey ? isOpen => onOpenKey(isOpen ? level.key : null) : undefined
        }
        onChange={ids =>
          onChange(pruneSelection({ ...selection, [level.key]: ids }, filters))
        }
      />
    );
  }).filter(Boolean);

  return controls.length ? <View style={styles.stack}>{controls}</View> : null;
}

const styles = StyleSheet.create({
  stack: { gap: space(2) },
});
