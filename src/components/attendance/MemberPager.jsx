import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { COLORS, RADII, TEXT, TNUM, WEIGHT, space } from '../../constants/theme';

// Page navigation for a client-paged list — the RN port of the web's MemberPager.
//
// Previous / numbered pages (collapsed with an ellipsis past seven) / Next, with
// a "Page X of Y" label. There is no page-size dropdown: on a phone the list
// starts at the project-standard size (25) and pages from there, which is all a
// one-handed marking screen needs.
//
// The numbering algorithm matches the web pager exactly so a reader who knows
// one knows the other: up to seven pages are shown in full; beyond that the
// first and last always show, with the current page and its neighbours between
// ellipses.

function pageItems(page, pageCount) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const items = [1];
  if (page > 3) items.push('ellipsis-l');
  for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i += 1) {
    items.push(i);
  }
  if (page < pageCount - 2) items.push('ellipsis-r');
  items.push(pageCount);
  return items;
}

export default function MemberPager({ page, pageCount, total, onChange }) {
  // One page (or none): nothing to navigate. The list renders its own
  // "All N shown" footer in that case.
  if (pageCount <= 1) return null;

  const items = pageItems(page, pageCount);
  const atStart = page <= 1;
  const atEnd = page >= pageCount;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        Page {page} of {pageCount}
        {typeof total === 'number' ? ` · ${total} total` : ''}
      </Text>

      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(page - 1)}
          disabled={atStart}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          accessibilityState={{ disabled: atStart }}
          style={({ pressed }) => [
            styles.edge,
            atStart && styles.edgeDisabled,
            pressed && !atStart && styles.pagePressed,
          ]}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={space(4.5)}
            color={atStart ? COLORS.textFaint : COLORS.primary}
          />
        </Pressable>

        {items.map((item, i) =>
          typeof item === 'string' ? (
            <Text key={item} style={styles.ellipsis}>
              …
            </Text>
          ) : (
            <Pressable
              key={item}
              onPress={() => onChange(item)}
              accessibilityRole="button"
              accessibilityLabel={`Page ${item}`}
              accessibilityState={{ selected: item === page }}
              style={({ pressed }) => [
                styles.page,
                item === page && styles.pageActive,
                pressed && item !== page && styles.pagePressed,
              ]}
            >
              <Text style={[styles.pageText, item === page && styles.pageTextActive]}>
                {item}
              </Text>
            </Pressable>
          ),
        )}

        <Pressable
          onPress={() => onChange(page + 1)}
          disabled={atEnd}
          accessibilityRole="button"
          accessibilityLabel="Next page"
          accessibilityState={{ disabled: atEnd }}
          style={({ pressed }) => [
            styles.edge,
            atEnd && styles.edgeDisabled,
            pressed && !atEnd && styles.pagePressed,
          ]}
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={space(4.5)}
            color={atEnd ? COLORS.textFaint : COLORS.primary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const CELL = space(9);

const styles = StyleSheet.create({
  wrap: { paddingTop: space(2), gap: space(2.5) },
  label: { textAlign: 'center', fontSize: TEXT.sm, color: COLORS.textMuted },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1.5),
  },
  page: {
    minWidth: CELL,
    height: CELL,
    paddingHorizontal: space(2),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  pagePressed: { backgroundColor: COLORS.primary50 },
  pageText: { ...TNUM, fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  pageTextActive: { color: COLORS.white },
  edge: {
    width: CELL,
    height: CELL,
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  edgeDisabled: { opacity: 0.4 },
  ellipsis: {
    minWidth: space(5),
    textAlign: 'center',
    fontSize: TEXT.sm,
    color: COLORS.textFaint,
  },
});
