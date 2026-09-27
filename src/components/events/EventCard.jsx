import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { absoluteUrl } from '../../api/client';
import { NIMIT_SEVAK_LABEL, DOING_POOJA_LABEL } from '../../utils/memberFlags';
import { COLORS, RADII, SHADOWS, TEXT, TNUM, WEIGHT, rem, space } from '../../constants/theme';

// On-screen names for the Level-2 target flags the API sends in `target_flags`.
const FLAG_LABELS = {
  is_ambrish: 'Ambrish',
  is_nimit_sevak: NIMIT_SEVAK_LABEL,
  doing_pooja: DOING_POOJA_LABEL,
};

/**
 * One event.
 *
 * The three counts come from the server (`total_registered_count` and friends);
 * nothing here counts registrations, so the card cannot disagree with the list
 * it was rendered from.
 *
 * THE WHOLE CARD IS THE CONTROL that opens the event's popup, where registering
 * happens — but only when `onOpen` is supplied. Without it (an
 * EVENTS:REGISTER-less caller) the card renders as a plain, unpressable view:
 * the popup exists only to register, so a card that opened one showing nothing
 * to do would be a worse answer than a card that does not respond.
 */

/** "31 Aug 2026", or "20 Aug 2026 · 21:00" when a time is set. */
function whenLabel(date, time) {
  if (!date) return null;
  const d = new Date(date);
  const day = Number.isNaN(d.getTime())
    ? String(date)
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return time ? `${day} · ${time}` : day;
}

function Stat({ value, label, tone }) {
  return (
    <View style={[styles.stat, tone]}>
      <Text style={[styles.statValue, tone.text]}>{value ?? 0}</Text>
      <Text style={[styles.statLabel, tone.text]}>{label}</Text>
    </View>
  );
}

export default function EventCard({
  event,
  categoryNames,
  canUpdate,
  busy,
  onOpen,
  onEdit,
  onToggleStatus,
  onResults,
}) {
  const active = event.status !== false;
  const when = whenLabel(event.date, event.time);
  const src = absoluteUrl(event.image);
  const openable = Boolean(onOpen);

  return (
    <Pressable
      disabled={!openable}
      onPress={openable ? () => onOpen(event) : undefined}
      accessibilityRole={openable ? 'button' : undefined}
      accessibilityLabel={openable ? `Register for ${event.title}` : undefined}
      style={({ pressed }) => [styles.card, openable && pressed && styles.cardPressed]}
    >
      <View style={styles.banner}>
        {src ? (
          <Image source={{ uri: src }} style={styles.bannerImage} resizeMode="contain" />
        ) : (
          <View style={styles.bannerPlaceholder}>
            <MaterialCommunityIcons name="calendar-month-outline" size={space(10)} color={COLORS.lineStrong} />
          </View>
        )}
        <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}>
          <View style={[styles.badgeDot, { backgroundColor: active ? COLORS.successFg : COLORS.dangerFg }]} />
          <Text style={[styles.badgeText, { color: active ? COLORS.successFg : COLORS.dangerFg }]}>
            {active ? 'Active' : 'Inactive'}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <View>
          <Text style={styles.title}>{event.title}</Text>
          {event.category ? <Text style={styles.category}>{event.category}</Text> : null}
        </View>

        {when ? (
          <View style={styles.line}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={space(3.5)} color={COLORS.textMuted} />
            <Text style={styles.meta}>{when}</Text>
          </View>
        ) : null}
        {event.location ? (
          <View style={styles.line}>
            <MaterialCommunityIcons name="map-marker-outline" size={space(3.5)} color={COLORS.textMuted} />
            <Text style={styles.meta}>{event.location}</Text>
          </View>
        ) : null}
        {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

        {/* Who the event is aimed at. The API sends category IDs; the names come
            from the master-data lookup the page already loads. */}
        {(event.user_category?.length > 0 || event.target_flags?.length > 0) ? (
          <View style={styles.chips}>
            {event.user_category?.map(id => (
              <View key={`c-${id}`} style={styles.chip}>
                <Text style={styles.chipText}>{categoryNames?.get(id) ?? `#${id}`}</Text>
              </View>
            ))}
            {event.target_flags?.map(key => (
              <View key={`f-${key}`} style={styles.flagChip}>
                <Text style={styles.flagChipText}>{FLAG_LABELS[key] ?? key}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.stats}>
          <Stat
            value={event.total_registered_count}
            label="Total"
            tone={{ borderColor: COLORS.lineSoft, backgroundColor: COLORS.bg, text: { color: COLORS.primary } }}
          />
          <Stat
            value={event.confirmed_registered_count}
            label="Confirmed"
            tone={{
              borderColor: 'rgba(21,128,61,0.2)',
              backgroundColor: COLORS.successBg,
              text: { color: COLORS.successFg },
            }}
          />
          <Stat
            value={event.denied_registered_count}
            label="Denied"
            tone={{
              borderColor: 'rgba(185,28,28,0.2)',
              backgroundColor: COLORS.dangerBg,
              text: { color: COLORS.dangerFg },
            }}
          />
        </View>

        {canUpdate ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() => onEdit(event)}
              disabled={busy}
              style={({ pressed }) => [styles.actionBtn, pressed && !busy && styles.actionBtnPressed, busy && styles.disabled]}
            >
              <MaterialCommunityIcons name="pencil-outline" size={space(3.5)} color={COLORS.primary} />
              <Text style={styles.actionText}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => onToggleStatus(event)}
              disabled={busy}
              style={({ pressed }) => [styles.actionBtn, pressed && !busy && styles.actionBtnPressed, busy && styles.disabled]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <MaterialCommunityIcons name="power" size={space(3.5)} color={COLORS.primary} />
              )}
              <Text style={styles.actionText}>{active ? 'Deactivate' : 'Activate'}</Text>
            </Pressable>
            {onResults ? (
              <Pressable
                onPress={() => onResults(event)}
                disabled={busy}
                style={({ pressed }) => [styles.actionBtn, pressed && !busy && styles.actionBtnPressed, busy && styles.disabled]}
              >
                <MaterialCommunityIcons name="chart-bar" size={space(3.5)} color={COLORS.primary} />
                <Text style={styles.actionText}>Results</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  cardPressed: { opacity: 0.9 },
  banner: { height: rem(9), backgroundColor: COLORS.bg },
  bannerImage: { width: '100%', height: '100%' },
  bannerPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: space(3),
    top: space(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    borderRadius: RADII.full,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  badgeActive: { backgroundColor: COLORS.successBg },
  badgeInactive: { backgroundColor: COLORS.dangerBg },
  badgeDot: { width: space(1.5), height: space(1.5), borderRadius: RADII.full },
  badgeText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },
  body: { padding: space(4), gap: space(2) },
  title: { fontSize: TEXT.base, fontWeight: WEIGHT.bold, color: COLORS.primary },
  category: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: COLORS.accent },
  line: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  meta: { fontSize: TEXT.sm, color: COLORS.textMuted },
  description: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.3, color: COLORS.textFaint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1.5) },
  chip: { borderRadius: RADII.full, backgroundColor: COLORS.bg, paddingHorizontal: space(2), paddingVertical: space(0.5) },
  chipText: { fontSize: TEXT.xs, fontWeight: WEIGHT.medium, color: COLORS.textMuted },
  flagChip: {
    borderRadius: RADII.full,
    backgroundColor: 'rgba(255,134,42,0.1)',
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  flagChipText: { fontSize: TEXT.xs, fontWeight: WEIGHT.medium, color: COLORS.accent },
  stats: { flexDirection: 'row', gap: space(2), marginTop: space(1) },
  stat: { flex: 1, borderWidth: 1, borderRadius: RADII.control, alignItems: 'center', paddingVertical: space(2) },
  statValue: { ...TNUM, fontSize: TEXT.lg, fontWeight: WEIGHT.bold, lineHeight: TEXT.lg },
  statLabel: {
    marginTop: space(1),
    fontSize: 10,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    opacity: 0.7,
  },
  actions: { flexDirection: 'row', gap: space(2), paddingTop: space(2) },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1.5),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    paddingVertical: space(2),
  },
  actionBtnPressed: { backgroundColor: COLORS.primary50 },
  actionText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: COLORS.primary },
  disabled: { opacity: 0.5 },
});
