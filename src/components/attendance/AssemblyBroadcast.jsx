import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { useToast } from '../../hooks/core';
import { attendanceService } from '../../services/attendanceService';
import {
  assemblySlots,
  assemblyFinalUnlock,
  buildSlotMessage,
  buildFinalMessage,
  buildFinalNewMessage,
  buildNsAbsentMessage,
  buildFocusAbsentMessage,
  sendAssemblyBroadcast,
} from '../../utils/assemblyBroadcast';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

// The live-assembly broadcast strip on the Mark screen — mobile port. Three
// broadcasts: Assembly (per-slot + Final), NS Absent, Focus 36 Absent. Each tap
// fetches fresh numbers, builds the WhatsApp text, and opens WhatsApp's share
// picker. Renders nothing for a sitting with no usable start time (a special
// sitting).

function SlotButton({ label, ready, isBusy, onPress, accent = true, disabled }) {
  const off = !ready || disabled;
  return (
    <Pressable
      disabled={off}
      onPress={onPress}
      style={[
        styles.slot,
        ready ? (accent ? styles.slotAccent : styles.slotPrimary) : styles.slotLocked,
      ]}
    >
      {isBusy ? (
        <ActivityIndicator size="small" color={accent ? COLORS.accent : COLORS.white} />
      ) : (
        <MaterialCommunityIcons
          name={ready ? 'send' : 'lock'}
          size={space(4)}
          color={ready ? (accent ? COLORS.accent : COLORS.white) : COLORS.textFaint}
        />
      )}
      <Text
        style={[
          styles.slotText,
          ready ? (accent ? styles.slotTextAccent : styles.slotTextPrimary) : styles.slotTextLocked,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function AssemblyBroadcast({ sabhaDetailId, sabha }) {
  const toast = useToast();
  const slots = useMemo(() => assemblySlots(sabha), [sabha]);
  const finalUnlock = useMemo(() => assemblyFinalUnlock(slots), [slots]);
  const nsSlots = useMemo(() => [slots[0], slots[2], slots[4]].filter(Boolean), [slots]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!slots.length) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [slots.length]);

  if (!slots.length) return null;

  const run = async (key, fetch, build) => {
    setBusy(key);
    try {
      const res = await fetch();
      const data = res?.data ?? res;
      sendAssemblyBroadcast(build(data));
    } catch {
      toast.error('Could not build the broadcast. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const sendSlot = slot =>
    run(
      slot.index,
      () => attendanceService.broadcast(sabhaDetailId, { asOf: slot.asOf }),
      d => buildSlotMessage(d, slot.label),
    );
  const sendFinal = () =>
    run('final', () => attendanceService.broadcast(sabhaDetailId, { final: true }), d => buildFinalMessage(d));
  const sendFinalNew = () =>
    run('final-new', () => attendanceService.broadcast(sabhaDetailId, { final: true }), d => buildFinalNewMessage(d));
  const sendNsSlot = slot =>
    run(`ns:${slot.index}`, () => attendanceService.nsAbsent(sabhaDetailId, { asOf: slot.asOf }), buildNsAbsentMessage);
  const sendNsLive = () =>
    run('ns:live', () => attendanceService.nsAbsent(sabhaDetailId, {}), buildNsAbsentMessage);
  const sendFocusLive = () =>
    run('focus:live', () => attendanceService.focusAbsent(sabhaDetailId), buildFocusAbsentMessage);

  const finalReady = finalUnlock ? now >= finalUnlock.getTime() : false;
  const anyBusy = busy !== null;

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <MaterialCommunityIcons name="radio-tower" size={space(4)} color={COLORS.accent} />
        <Text style={styles.title}>Assembly broadcast</Text>
        <Text style={styles.subtitle}>— send live counts to WhatsApp</Text>
      </View>

      <View style={styles.slotRow}>
        {slots.map(slot => (
          <SlotButton
            key={slot.index}
            label={slot.label}
            ready={now >= slot.at.getTime()}
            isBusy={busy === slot.index}
            disabled={anyBusy}
            onPress={() => sendSlot(slot)}
          />
        ))}
        <SlotButton label="Final" ready={finalReady} isBusy={busy === 'final'} disabled={anyBusy} onPress={sendFinal} accent={false} />
        <SlotButton label="Final New" ready={finalReady} isBusy={busy === 'final-new'} disabled={anyBusy} onPress={sendFinalNew} accent={false} />
      </View>

      <Text style={styles.note}>
        A slot unlocks once its time has passed. Tapping opens WhatsApp with the message ready —
        pick the assembly group and send.
      </Text>

      <View style={styles.section}>
        <View style={styles.headRow}>
          <MaterialCommunityIcons name="account-off" size={space(4)} color={COLORS.accent} />
          <Text style={styles.title}>NS absent list</Text>
          <Text style={styles.subtitle}>— Nimit Sevaks not yet present</Text>
        </View>
        <View style={styles.slotRow}>
          {nsSlots.map(slot => (
            <SlotButton
              key={`ns-${slot.index}`}
              label={slot.label}
              ready={now >= slot.at.getTime()}
              isBusy={busy === `ns:${slot.index}`}
              disabled={anyBusy}
              onPress={() => sendNsSlot(slot)}
            />
          ))}
          <SlotButton label="Live" ready isBusy={busy === 'ns:live'} disabled={anyBusy} onPress={sendNsLive} accent={false} />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.headRow}>
          <MaterialCommunityIcons name="target" size={space(4)} color={COLORS.accent} />
          <Text style={styles.title}>Focus 36 absent list</Text>
          <Text style={styles.subtitle}>— slipping members not yet present</Text>
        </View>
        <View style={styles.slotRow}>
          <SlotButton label="Live" ready isBusy={busy === 'focus:live'} disabled={anyBusy} onPress={sendFocusLive} accent={false} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    padding: space(4),
  },
  headRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space(2), marginBottom: space(3) },
  title: { fontSize: TEXT.sm, fontWeight: WEIGHT.bold, color: COLORS.primary },
  subtitle: { fontSize: TEXT.xs, color: COLORS.textMuted },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    borderRadius: RADII.control,
    borderWidth: 1,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },
  slotAccent: { borderColor: 'rgba(255,134,42,0.4)', backgroundColor: 'rgba(255,134,42,0.06)' },
  slotPrimary: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  slotLocked: { borderColor: COLORS.lineSoft, backgroundColor: 'rgba(235,240,246,0.4)' },
  slotText: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold },
  slotTextAccent: { color: COLORS.accent },
  slotTextPrimary: { color: COLORS.white },
  slotTextLocked: { color: COLORS.textFaint },
  note: { marginTop: space(2.5), fontSize: TEXT.xs, color: COLORS.textMuted },
  section: { marginTop: space(4), borderTopWidth: 1, borderTopColor: COLORS.lineSoft, paddingTop: space(4) },
});
