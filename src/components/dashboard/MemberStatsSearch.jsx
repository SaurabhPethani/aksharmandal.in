import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text, TextInput } from '../Typography';
import { dashboardService } from '../../services/dashboardService';
import {
  COLORS,
  RADII,
  SHADOWS,
  TEXT,
  WEIGHT,
  rem,
  space,
} from '../../constants/theme';

export default function MemberStatsSearch({ onPick }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  // Debounce so a fast typist fires one request, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useQuery({
    queryKey: ['member-search', debounced],
    queryFn: () => dashboardService.members({ search: debounced, limit: 8 }),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  const results = query.data?.items ?? [];

  const clear = () => {
    setQ('');
    setDebounced('');
  };

  const pick = m => {
    Keyboard.dismiss();
    onPick(m.id);
    clear();
    setOpen(false);
  };

  return (
    <View>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <MaterialCommunityIcons
          name="magnify"
          size={22}
          color={COLORS.textMuted}
        />
        <TextInput
          value={q}
          onChangeText={text => {
            setQ(text);
            setOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
          }}
          onBlur={() => setFocused(false)}
          placeholder="View a member's dashboard — search by name or mobile…"
          placeholderTextColor={COLORS.textMuted}
          accessibilityLabel="Search a member to view their dashboard"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
        {q ? (
          <Pressable
            onPress={clear}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            style={styles.clear}
          >
            {({ pressed }) => (
              <MaterialCommunityIcons
                name="close"
                size={space(4)}
                color={pressed ? COLORS.primary : COLORS.textMuted}
              />
            )}
          </Pressable>
        ) : null}
      </View>

      {open && debounced.length >= 2 ? (
        <View style={styles.results}>
          {query.isLoading ? (
            <Text style={styles.status}>Searching…</Text>
          ) : query.error ? (
            <Text style={styles.status}>
              Couldn&apos;t search right now. Please try again.
            </Text>
          ) : results.length === 0 ? (
            <Text style={styles.status}>No members found.</Text>
          ) : (
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={styles.listContent}
            >
              {results.map(m => (
                <Pressable
                  key={m.id}
                  onPress={() => pick(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${m.user_name}'s dashboard`}
                  style={({ pressed }) => [
                    styles.item,
                    pressed && styles.itemPressed,
                  ]}
                >
                  <Text style={styles.name} numberOfLines={1}>
                    {m.user_name}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {[m.sabha_name, m.mobile_number]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(3),
  },
  fieldFocused: { borderColor: COLORS.accent },
  input: {
    flex: 1,
    marginLeft: space(2),
    paddingVertical: space(2),
    fontSize: TEXT.sm,
    color: COLORS.primary,
  },
  clear: { marginLeft: space(1), padding: space(1), borderRadius: 4 },
  results: {
    marginTop: space(1),
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  list: { maxHeight: rem(18) },
  listContent: { paddingVertical: space(1) },
  item: { paddingHorizontal: space(3), paddingVertical: space(2) },
  itemPressed: { backgroundColor: COLORS.bg },
  name: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  sub: { fontSize: TEXT.xs, color: COLORS.textMuted },
  status: {
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
  },
});
