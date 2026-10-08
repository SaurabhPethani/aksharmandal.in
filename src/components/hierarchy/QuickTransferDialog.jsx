import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import FormDialog from '../FormDialog';
import { FormField, Select } from '../form';
import { Text } from '../Typography';
import { useToast } from '../../hooks/core';
import { useProfile, useQuickTransfer } from '../../hooks/useUsers';
import {
  useTransferDestinationMandals,
  useTransferDestinationSabhas,
} from '../../hooks/useHierarchy';
import { toOptions } from '../../utils/options';
import {
  COLORS,
  RADII,
  SHADOWS,
  TEXT,
  WEIGHT,
  rem,
  space,
} from '../../constants/theme';

const MODES = [
  {
    key: 'sabha',
    label: 'Sabha Transfer',
    hint: 'Another Sabha in the same Mandal',
  },
  {
    key: 'mandal',
    label: 'Mandal Transfer',
    hint: 'Another Mandal in the same Pradesh',
  },
];

/**
 * Files a transfer request — `POST /notifications/transfer-request`. The member
 * does not move here: the destination side accepts or rejects it.
 *
 *   sabha   another Sabha inside the member's own Mandal
 *   mandal  another Mandal inside their Pradesh, and a Sabha within it
 */
export default function QuickTransferDialog({ member, onClose }) {
  const toast = useToast();
  const transfer = useQuickTransfer();
  const { width } = useWindowDimensions();
  const wide = width >= 640;

  const [mode, setMode] = useState('sabha');
  const [mandalId, setMandalId] = useState('');
  const [sabhaId, setSabhaId] = useState('');
  const [touched, setTouched] = useState(false);

  const isOpen = Boolean(member);
  const memberId = member?.user_id ?? member?.id ?? null;

  // A list row carries no placement ids, so they come from the record.
  const recordQ = useProfile(memberId);
  const record = recordQ.data;
  const pradeshId = record?.pradesh_id ?? member?.pradesh_id ?? null;
  const homeMandalId = record?.mandal_id ?? member?.mandal_id ?? null;
  const currentSabhaId = record?.sabha_id ?? member?.sabha_id ?? null;

  const isMandalMode = mode === 'mandal';
  const destMandalId = isMandalMode ? mandalId : homeMandalId;

  const mandalQ = useTransferDestinationMandals(isOpen && isMandalMode);
  const sabhaQ = useTransferDestinationSabhas(
    destMandalId,
    isOpen && Boolean(destMandalId),
  );

  useEffect(() => {
    setMode('sabha');
    setMandalId('');
    setSabhaId('');
    setTouched(false);
  }, [memberId]);

  const switchMode = key => {
    if (key === mode) return;
    setMode(key);
    setMandalId('');
    setSabhaId('');
    setTouched(false);
  };

  const chooseMandal = value => {
    setMandalId(value);
    setSabhaId('');
    setTouched(true);
  };

  const mandalOptions = toOptions(mandalQ.data, {
    labelKey: 'mandal_name',
  }).filter(o => String(o.value) !== String(homeMandalId ?? ''));
  // Their current Sabha is only excluded inside their own Mandal.
  const sabhaOptions = toOptions(sabhaQ.data, { labelKey: 'sabha_name' }).filter(
    o => isMandalMode || String(o.value) !== String(currentSabhaId ?? ''),
  );

  const busy = transfer.isPending;
  const recordLoading = recordQ.isLoading;
  const mandalsLoading = recordLoading || mandalQ.isLoading;
  const mandalsError = recordQ.error || mandalQ.error;
  const sabhasLoading = recordLoading || sabhaQ.isLoading;
  const sabhasError = recordQ.error || sabhaQ.error;

  // The one case where a Mandal transfer may go without a Sabha.
  const noSabhasHere =
    isMandalMode &&
    Boolean(mandalId) &&
    !sabhasLoading &&
    !sabhasError &&
    sabhaOptions.length === 0;

  const missingMandal = touched && isMandalMode && !mandalId;
  const missingSabha = touched && !sabhaId && !noSabhasHere;
  const canSubmit =
    (!isMandalMode || Boolean(mandalId)) && (Boolean(sabhaId) || noSabhasHere);

  const submit = async () => {
    if (busy) return;
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    try {
      const res = await transfer.mutateAsync({
        userId: memberId,
        type: mode,
        toPradeshId: pradeshId,
        toMandalId: destMandalId,
        toSabhaId: sabhaId || null,
      });
      toast.success(res?.detail || 'Transfer request submitted.');
      onClose();
    } catch (err) {
      // Stays open, so the selection can be retried.
      toast.error(err?.message);
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Transfer Member"
      submitLabel="Send Transfer Request"
      submitVariant="accent"
      onSubmit={submit}
      submitDisabled={!canSubmit}
      busy={busy}
      size="lg"
    >
      <View>
        <Text style={styles.eyebrow}>User</Text>
        <Text style={styles.name}>{member?.user_name || '—'}</Text>
      </View>

      <CurrentPlacement member={record ?? member} />

      <View>
        <Text style={[styles.eyebrow, styles.eyebrowGap]}>Transfer type</Text>
        <View style={[styles.modes, wide && styles.modesWide]}>
          {MODES.map(m => {
            const selected = m.key === mode;
            return (
              <Pressable
                key={m.key}
                accessibilityRole="tab"
                accessibilityState={{ selected, disabled: busy }}
                disabled={busy}
                onPress={() => switchMode(m.key)}
                style={[
                  styles.mode,
                  wide && styles.modeWide,
                  selected && styles.modeSelected,
                  busy && styles.modeDisabled,
                ]}
              >
                <Text
                  style={[styles.modeLabel, selected && styles.modeLabelOn]}
                >
                  {m.label}
                </Text>
                <Text style={[styles.modeHint, wide && styles.modeHintWide]}>
                  {m.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.destination}>
        <Text style={[styles.eyebrow, styles.destinationTitle]}>
          Destination
        </Text>

        <View style={[styles.fields, wide && styles.fieldsWide]}>
          {isMandalMode && (
            <View style={wide && styles.fieldWide}>
              <FormField
                label="Mandal"
                required
                compact
                error={missingMandal ? 'Please select a Mandal.' : null}
              >
                <Select
                  label="Mandal"
                  value={mandalId}
                  onChange={chooseMandal}
                  disabled={busy || mandalsLoading || Boolean(mandalsError)}
                  error={missingMandal}
                  placeholder={
                    mandalsLoading
                      ? 'Loading Mandals…'
                      : mandalsError
                        ? 'Mandal list unavailable'
                        : 'Select Mandal'
                  }
                  options={mandalOptions}
                />
              </FormField>
            </View>
          )}

          <View style={wide && styles.fieldWide}>
            <FormField
              label="Sabha"
              required={!noSabhasHere}
              compact
              error={missingSabha ? 'Please select a Sabha.' : null}
            >
              <Select
                label="Sabha"
                value={sabhaId}
                onChange={value => {
                  setSabhaId(value);
                  setTouched(true);
                }}
                disabled={
                  busy ||
                  sabhasLoading ||
                  Boolean(sabhasError) ||
                  (isMandalMode && !mandalId)
                }
                error={missingSabha}
                placeholder={
                  isMandalMode && !mandalId
                    ? 'Select a Mandal first'
                    : sabhasLoading
                      ? 'Loading Sabhas…'
                      : sabhasError
                        ? 'Sabha list unavailable'
                        : noSabhasHere
                          ? 'No Sabhas in this Mandal yet'
                          : 'Select Sabha'
                }
                options={sabhaOptions}
              />
            </FormField>
          </View>
        </View>

        <Text style={styles.note}>
          {isMandalMode
            ? 'Mandals within the user’s current Pradesh, and Sabhas within the Mandal chosen. '
            : 'Only Sabhas within the user’s current Mandal can be chosen. '}
          The member moves once the destination accepts.
        </Text>
      </View>
    </FormDialog>
  );
}

/** "Currently in: Pradesh › Mandal › Sabha", from whichever names are known. */
function CurrentPlacement({ member }) {
  const trail = [
    member?.pradesh_name,
    member?.mandal_name,
    member?.sabha_name,
  ].filter(Boolean);
  if (!trail.length) return null;

  return (
    <View style={styles.placement}>
      <Text style={styles.placementText}>Currently in: </Text>
      {trail.map((name, i) => (
        <View key={`${name}-${i}`} style={styles.placementStep}>
          {i > 0 && (
            <MaterialCommunityIcons
              name="chevron-right"
              size={space(3.5)}
              color={COLORS.textFaint}
            />
          )}
          <Text style={[styles.placementText, styles.placementName]}>
            {name}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: COLORS.textMuted,
  },
  eyebrowGap: { marginBottom: space(2) },
  name: {
    marginTop: space(0.5),
    fontSize: TEXT.lg,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },

  placement: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderRadius: RADII.control,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(3.5),
    paddingVertical: space(2.5),
  },
  placementStep: { flexDirection: 'row', alignItems: 'center' },
  placementText: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.625,
    color: COLORS.textMuted,
  },
  placementName: { fontWeight: WEIGHT.bold, color: COLORS.primary },

  modes: { gap: space(2) },
  modesWide: { flexDirection: 'row' },
  mode: {
    borderRadius: RADII.control,
    borderWidth: 2,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
  },
  modeWide: { flex: 1 },
  modeSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(229,238,245,0.6)',
    ...SHADOWS.card,
  },
  modeDisabled: { opacity: 0.5 },
  modeLabel: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.textMuted,
  },
  modeLabelOn: { color: COLORS.primary },
  modeHint: {
    marginTop: space(0.5),
    fontSize: TEXT.xs,
    color: COLORS.textFaint,
  },
  // Side by side, both cards keep one height whether or not the hint wraps.
  modeHintWide: { minHeight: rem(2) },

  destination: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: 'rgba(235,240,246,0.5)',
    padding: space(4),
  },
  destinationTitle: { marginBottom: space(3) },
  fields: { gap: space(4) },
  fieldsWide: { flexDirection: 'row' },
  fieldWide: { flex: 1 },
  note: {
    marginTop: space(3),
    fontSize: TEXT.xs,
    lineHeight: TEXT.xs * 1.625,
    color: COLORS.textMuted,
  },
});
