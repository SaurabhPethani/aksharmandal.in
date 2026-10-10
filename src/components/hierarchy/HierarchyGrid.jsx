import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Card, EmptyState, ErrorState, Skeleton } from '../ui';
import { Text } from '../Typography';
import { useStagedCount } from '../../hooks/useStagedCount';
import { formatNumber } from '../../utils/format';
import { FONT_DISPLAY } from '../../constants/typography';
import {
  COLORS,
  RADII,
  SHADOWS,
  TEXT,
  WEIGHT,
  space,
} from '../../constants/theme';

const GREEN = '#22C55E';
const VIOLET = '#8B5CF6';
const VIOLET_DEEP = '#6D28D9';
const VIOLET_LINE = '#DDD6FE';
const AMBER = '#F59E0B';
const PILL_LINE = '#E2EAF4';
const PILL_BG = '#EEF2FA';
const PILL_FG = '#6B7FA3';
const LABEL_FG = '#8A9AB8';
const CHEVRON = '#C0CDE0';

export const LEVEL_META = {
  pradesh: {
    label: 'Pradesh',
    nameKey: 'pradesh_name',
    badge: COLORS.primary,
    ring: 'rgba(0,49,88,0.4)',
  },
  mandal: {
    label: 'Mandal',
    nameKey: 'mandal_name',
    badge: COLORS.accent,
    ring: 'rgba(255,134,42,0.4)',
  },
  sabha: {
    label: 'Sabha',
    nameKey: 'sabha_name',
    badge: GREEN,
    ring: 'rgba(74,222,128,0.6)',
  },
};

const COUNT_KEYS = [
  'member_count',
  'members_count',
  'total_members',
  'user_count',
  'total_users',
];

function readMemberCount(item) {
  for (const key of COUNT_KEYS) {
    const value = item?.[key];
    if (typeof value === 'number') return value;
    if (
      typeof value === 'string' &&
      value.trim() !== '' &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value);
    }
  }
  return null;
}

const idOf = (item, level) => item?.id ?? item?.[`${level}_id`] ?? null;

export const levelName = (item, level) =>
  item?.[LEVEL_META[level].nameKey] ?? item?.name ?? '';

const plural = word => (word.endsWith('sh') ? `${word}es` : `${word}s`);
const countLabel = (count, word) =>
  `${formatNumber(count)} ${count === 1 ? word : plural(word)}`;

function leaderNames(leaders) {
  const names = [...(leaders || [])]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map(leader => leader.user_name)
    .filter(Boolean);
  if (!names.length) return null;
  const shown = names.slice(0, 2).join(', ');
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown;
}

const totalMembers = items =>
  items.reduce(
    (sum, item) =>
      sum + (typeof item.member_count === 'number' ? item.member_count : 0),
    0,
  );

/** Each group with the entities it holds, and the entities no group holds. */
function splitByGroup(items, groups, level) {
  const grouped = new Set();
  const sections = (groups || [])
    .map(group => {
      const ids = new Set((group.entityIds || []).map(Number));
      const own = items.filter(item => ids.has(Number(idOf(item, level))));
      own.forEach(item => grouped.add(Number(idOf(item, level))));
      return { ...group, items: own };
    })
    .filter(group => group.items.length > 0);
  const rest = items.filter(item => !grouped.has(Number(idOf(item, level))));
  return { sections, rest };
}

const LevelCard = React.memo(function LevelCard({ item, level, onSelect }) {
  const meta = LEVEL_META[level];
  const name = levelName(item, level);
  const count = readMemberCount(item);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name || meta.label}, ${meta.label}`}
      onPress={() => onSelect(item)}
      style={({ pressed }) => [
        styles.card,
        pressed && { borderColor: meta.ring },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.badge, { backgroundColor: meta.badge }]}>
          <Text style={styles.badgeText}>{initial}</Text>
        </View>
        <View style={styles.cardCopy}>
          <Text numberOfLines={1} style={styles.cardName}>
            {name || '—'}
          </Text>
          <Text style={styles.cardLevel}>{meta.label}</Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={space(4.5)}
          color={CHEVRON}
          style={styles.cardChevron}
        />
      </View>
      <View style={styles.cardFoot}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {count == null
              ? '—'
              : `${count} ${count === 1 ? 'member' : 'members'}`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

function LevelCards({
  items = [],
  level,
  onSelect,
  loading,
  error,
  onRetry,
  emptyTitle = 'Nothing to show',
  emptyHint,
  /** Draw only this many for now; the rest are on their way. */
  limit = items.length,
}) {
  if (loading) {
    return (
      <View style={styles.grid}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <View key={i} style={styles.card}>
            <View style={styles.cardTop}>
              <Skeleton style={styles.skeletonBadge} />
              <View style={styles.skeletonCopy}>
                <Skeleton style={styles.skeletonName} />
                <Skeleton style={styles.skeletonLevel} />
              </View>
            </View>
            <Skeleton style={styles.skeletonPill} />
          </View>
        ))}
      </View>
    );
  }
  if (error) {
    return (
      <Card>
        <ErrorState
          error={error}
          onRetry={onRetry}
          title="Couldn’t load this list"
        />
      </Card>
    );
  }
  if (!items.length) {
    return (
      <Card>
        <EmptyState title={emptyTitle} hint={emptyHint} />
      </Card>
    );
  }
  return (
    <View style={styles.grid}>
      {items.slice(0, limit).map((item, i) => (
        <LevelCard
          key={`${idOf(item, level) ?? 'n'}-${i}`}
          item={item}
          level={level}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

/**
 * One hierarchy level as cards. Entities that belong to a group sit inside the
 * group's own section; the rest follow under "Other".
 */
export default function HierarchyGrid({
  groups = [],
  onViewGroup,
  items = [],
  level,
  ...rest
}) {
  const { sections, rest: ungrouped } = splitByGroup(items, groups, level);
  const grouped = sections.length > 0 && !rest.loading && !rest.error;

  // The first screenful of cards is drawn at once and the rest just after,
  // counted down the page across the group sections.
  const total = grouped
    ? sections.reduce((n, g) => n + g.items.length, ungrouped.length)
    : items.length;
  const shown = useStagedCount(
    total,
    items.length ? `${level}:${grouped}:${idOf(items[0], level)}` : '',
  );

  if (!grouped) {
    return <LevelCards items={items} level={level} limit={shown} {...rest} />;
  }

  let budget = shown;
  const take = count => {
    const mine = Math.max(0, Math.min(count, budget));
    budget -= mine;
    return mine;
  };

  const label = LEVEL_META[level].label;

  return (
    <View style={styles.sections}>
      {sections.map(group => {
        const leaders = leaderNames(group.leaders);
        const members = totalMembers(group.items);
        return (
          <View
            key={group.id}
            accessibilityLabel={`${group.name} group`}
            style={styles.group}
          >
            <View style={styles.groupHead}>
              <View style={styles.groupIcon}>
                <MaterialCommunityIcons
                  name="hexagon-multiple-outline"
                  size={space(4.5)}
                  color={COLORS.white}
                />
              </View>
              <View style={styles.groupCopy}>
                <Text numberOfLines={1} style={styles.groupName}>
                  {group.name}
                </Text>
                <View style={styles.groupMeta}>
                  <Text style={styles.groupLevel}>{label} Group</Text>
                  {leaders ? (
                    <View style={styles.groupLeaders}>
                      <MaterialCommunityIcons
                        name="crown-outline"
                        size={space(3.5)}
                        color={AMBER}
                      />
                      <Text numberOfLines={1} style={styles.groupLeaderText}>
                        {leaders}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.groupChips}>
              <View style={styles.groupChip}>
                <Text style={styles.groupChipText}>
                  {countLabel(group.items.length, label)}
                </Text>
              </View>
              <View style={styles.groupChip}>
                <Text style={styles.groupChipText}>
                  {countLabel(members, 'member')}
                </Text>
              </View>
              {onViewGroup && members > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onViewGroup(group)}
                  hitSlop={8}
                  style={styles.viewMembers}
                >
                  <MaterialCommunityIcons
                    name="account-multiple-outline"
                    size={space(4)}
                    color={COLORS.accent}
                  />
                  <Text style={styles.viewMembersText}>View members</Text>
                </Pressable>
              ) : null}
            </View>

            <LevelCards
              items={group.items}
              level={level}
              onSelect={rest.onSelect}
              limit={take(group.items.length)}
            />
          </View>
        );
      })}

      {ungrouped.length > 0 && (
        <View accessibilityLabel={`Other ${label}`} style={styles.other}>
          <View style={styles.otherHead}>
            <Text style={styles.otherTitle}>Other {plural(label)}</Text>
            <View style={styles.otherCount}>
              <Text style={styles.otherCountText}>{ungrouped.length}</Text>
            </View>
            <View style={styles.otherRule} />
          </View>
          <LevelCards
            items={ungrouped}
            level={level}
            onSelect={rest.onSelect}
            limit={take(ungrouped.length)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space(3) },
  sections: { gap: space(5) },

  card: {
    borderRadius: RADII.card,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: COLORS.surface,
    padding: space(4),
    ...SHADOWS.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  badge: {
    width: space(11),
    height: space(11),
    borderRadius: RADII.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: TEXT.base,
    fontWeight: WEIGHT.bold,
    color: COLORS.white,
  },
  cardCopy: { flex: 1, minWidth: 0 },
  cardName: {
    fontSize: TEXT.base,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  cardLevel: {
    marginTop: space(0.5),
    fontSize: 11,
    fontWeight: WEIGHT.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    color: LABEL_FG,
  },
  cardChevron: { marginTop: space(1) },
  cardFoot: { marginTop: space(3), flexDirection: 'row' },
  pill: {
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: PILL_LINE,
    backgroundColor: PILL_BG,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  pillText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: PILL_FG },

  skeletonBadge: {
    width: space(11),
    height: space(11),
    borderRadius: RADII.xl,
  },
  skeletonCopy: { flex: 1, gap: space(2) },
  skeletonName: { height: space(3.5), width: '66%' },
  skeletonLevel: { height: space(2.5), width: '33%' },
  skeletonPill: {
    marginTop: space(3),
    height: space(6),
    width: space(24),
    borderRadius: RADII.full,
  },

  group: {
    borderRadius: RADII['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(221,214,254,0.8)',
    backgroundColor: 'rgba(245,243,255,0.4)',
    padding: space(3),
    gap: space(3),
  },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  groupIcon: {
    width: space(9),
    height: space(9),
    borderRadius: RADII.xl,
    backgroundColor: VIOLET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCopy: { flex: 1, minWidth: 0 },
  groupName: {
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  groupMeta: {
    marginTop: space(0.5),
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space(2),
  },
  groupLevel: {
    fontSize: 11,
    fontWeight: WEIGHT.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    color: VIOLET,
  },
  groupLeaders: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
  },
  groupLeaderText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  groupChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
  },
  groupChip: {
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: VIOLET_LINE,
    backgroundColor: COLORS.white,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  groupChipText: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: VIOLET_DEEP,
  },
  viewMembers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
  },
  viewMembersText: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.accent,
  },

  other: { gap: space(2.5) },
  otherHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(0.5),
  },
  otherTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: PILL_FG,
  },
  otherCount: {
    borderRadius: RADII.full,
    backgroundColor: PILL_BG,
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  otherCountText: { fontSize: 11, fontWeight: WEIGHT.bold, color: PILL_FG },
  otherRule: { flex: 1, height: 1, backgroundColor: '#E6EDF5' },
});
