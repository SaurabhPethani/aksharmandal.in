import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Modal } from '../Overlays';
import { Input } from './index';
import { usersService } from '../../services/usersService';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

const isBlank = s => s == null || String(s).trim() === '';

/**
 * One speaker slot. A vakta is either IN-HOUSE — a registered member, stored as
 * `{ name, userId }` so speaker analysis by id is possible later — or EXTERNAL —
 * someone not in Akshar Connect, stored as a typed name with `userId: null`.
 *
 * The value this control owns is the object `{ name, userId }`. The trigger shows
 * the current name; tapping opens a search sheet where typing searches members
 * org-wide (a speaker is often a visitor from another Sabha/Mandal). Picking a
 * member links the id; committing the typed text keeps it as an external name.
 */
export default function VaktaPicker({ value, onChange, error, placeholder }) {
  const v = value && typeof value === 'object' ? value : { name: value ?? '', userId: null };
  const name = v.name ?? '';
  const userId = v.userId ?? null;
  const linked = userId != null && !isBlank(name);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => () => {
    aliveRef.current = false;
  }, []);

  // Debounced org-wide search. Only fires at 2+ chars; a stale response never
  // overwrites a newer one (guarded by the captured query length).
  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    if (q.length < 2) {
      setRows([]);
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await usersService.vaktaSearch(q);
        if (alive) setRows(Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : []);
      } catch {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, open]);

  const openSheet = () => {
    setQuery(name ?? '');
    setRows([]);
    setOpen(true);
  };

  const pick = row => {
    onChange({ name: row.user_name, userId: row.user_id });
    setOpen(false);
  };

  const commitTyped = () => {
    const typed = query.trim();
    // Typing breaks any existing member link — the id only stays valid while the
    // shown name is exactly the picked member's.
    onChange({ name: typed, userId: null });
    setOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={placeholder ?? 'Select vakta'}
        onPress={openSheet}
        style={({ pressed }) => [
          styles.trigger,
          pressed && styles.triggerPressed,
          error && styles.triggerError,
        ]}
      >
        <MaterialCommunityIcons
          name={linked ? 'account-check' : 'microphone'}
          size={space(4.5)}
          color={linked ? COLORS.successFg : COLORS.textMuted}
        />
        <Text
          numberOfLines={1}
          style={[styles.triggerText, isBlank(name) && styles.triggerPlaceholder]}
        >
          {isBlank(name) ? placeholder ?? 'Search a member, or type an outside speaker' : name}
        </Text>
        {linked ? (
          <View style={styles.inHouse}>
            <Text style={styles.inHouseText}>In-house</Text>
          </View>
        ) : null}
      </Pressable>

      <Text style={styles.helper}>
        {linked
          ? 'Linked to a registered member — kept for speaker analysis.'
          : isBlank(name)
            ? 'Tap to find a member, or enter an outside speaker’s name.'
            : 'External speaker (not linked to a member).'}
      </Text>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Vakta" size="md">
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Type a member’s name…"
          autoCorrect={false}
          autoFocus
          style={styles.search}
        />
        {query.trim().length >= 2 ? (
          loading ? (
            <View style={styles.searching}>
              <ActivityIndicator size="small" color={COLORS.textMuted} />
              <Text style={styles.searchingText}>Searching…</Text>
            </View>
          ) : rows.length === 0 ? (
            <Text style={styles.noMatch}>
              No member matches — “{query.trim()}” will be saved as an outside speaker.
            </Text>
          ) : (
            <View>
              {rows.map(r => {
                const on = r.user_id === userId;
                return (
                  <Pressable
                    key={String(r.user_id)}
                    onPress={() => pick(r)}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && styles.rowPressed,
                      on && styles.rowActive,
                    ]}
                  >
                    <View style={styles.rowCopy}>
                      <Text numberOfLines={1} style={styles.rowName}>
                        {r.user_name}
                      </Text>
                      <Text numberOfLines={1} style={styles.rowMeta}>
                        {[r.sabha_name, r.role_name].filter(Boolean).join(' · ') || '—'}
                      </Text>
                    </View>
                    {on ? (
                      <MaterialCommunityIcons
                        name="check"
                        size={space(4.5)}
                        color={COLORS.successFg}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )
        ) : (
          <Text style={styles.hint}>Type at least two letters to search members.</Text>
        )}

        {query.trim().length >= 1 ? (
          <Pressable
            onPress={commitTyped}
            style={({ pressed }) => [styles.external, pressed && styles.rowPressed]}
          >
            <MaterialCommunityIcons name="microphone" size={space(4)} color={COLORS.accent} />
            <Text style={styles.externalText}>
              Use “{query.trim()}” as an outside speaker
            </Text>
          </Pressable>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    width: '100%',
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineInput,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  triggerPressed: { borderColor: 'rgba(0,49,88,0.5)' },
  triggerError: { borderColor: COLORS.dangerFg },
  triggerText: { flex: 1, fontSize: 16, lineHeight: 24, color: COLORS.primary },
  triggerPlaceholder: { color: COLORS.textFaint },
  inHouse: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.successBg,
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  inHouseText: {
    fontSize: 10,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    color: COLORS.successFg,
  },
  helper: { marginTop: space(1), fontSize: TEXT.xs, color: COLORS.textMuted },
  search: { marginBottom: space(3) },
  searching: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(4) },
  searchingText: { fontSize: TEXT.sm, color: COLORS.textMuted },
  noMatch: { paddingVertical: space(3), fontSize: TEXT.sm, color: COLORS.textMuted },
  hint: { paddingVertical: space(3), fontSize: TEXT.sm, color: COLORS.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    borderRadius: RADII.control,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
  },
  rowPressed: { backgroundColor: COLORS.primary50 },
  rowActive: { backgroundColor: COLORS.bg },
  rowCopy: { flex: 1 },
  rowName: { fontSize: TEXT.base, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  rowMeta: { marginTop: 2, fontSize: TEXT.xs, color: COLORS.textMuted },
  external: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    marginTop: space(2),
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: space(3),
    paddingHorizontal: space(1),
  },
  externalText: { flex: 1, fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.accent },
});
