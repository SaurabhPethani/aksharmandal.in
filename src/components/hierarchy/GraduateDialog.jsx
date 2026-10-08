import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import FormDialog from '../FormDialog';
import { FormField, Input } from '../form';
import { Text } from '../Typography';
import { useToast } from '../../hooks/core';
import { useMobileCheck } from '../../hooks/useLookups';
import { isMobileTaken, mobileTakenLabel } from '../../utils/options';
import { usersService } from '../../services/usersService';
import { COLORS, TEXT, WEIGHT, space } from '../../constants/theme';

const digits = s => String(s || '').replace(/\D/g, '');

/**
 * Promotes a parent-managed child to a full member: they get a real, unique
 * 10-digit number of their own and can sign in with it.
 */
export default function GraduateDialog({ member, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMobile('');
  }, [member?.id]);

  const check = useMobileCheck(mobile);
  const taken = isMobileTaken(check.data);
  const valid = /^\d{10}$/.test(mobile);
  // The check is debounced, so a number just typed has no answer yet.
  const checking = check.isFetching || check.isPending;
  const canSubmit = valid && !taken && !checking && !busy;

  const submit = async () => {
    if (!canSubmit || !member) return;
    setBusy(true);
    try {
      const res = await usersService.graduateChild(member.id, mobile);
      toast.success(res?.detail || `${member.user_name} is now a full member.`);
      queryClient.invalidateQueries({ queryKey: ['user', String(member.id)] });
      onClose?.();
    } catch (e) {
      toast.error(e?.message || 'Could not graduate this member.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      isOpen={Boolean(member)}
      onClose={() => onClose?.()}
      title="Graduate to full member"
      submitLabel="Graduate"
      onSubmit={submit}
      submitDisabled={!canSubmit}
      busy={busy}
      size="sm"
    >
      <Text style={styles.copy}>
        <Text style={styles.name}>{member?.user_name}</Text> is a
        parent-managed child with no login of their own. Enter their own new
        mobile number to make them an independent member — they sign in with it
        and set their own password / PIN. Their attendance and family links are
        kept.
      </Text>

      <FormField label="New mobile number" compact>
        <Input
          value={mobile}
          inputMode="numeric"
          maxLength={10}
          placeholder="Enter new 10-digit number"
          onChangeText={next => setMobile(digits(next))}
        />
        <Hint
          mobile={mobile}
          checking={checking}
          taken={taken}
          data={check.data}
        />
      </FormField>
    </FormDialog>
  );
}

function Hint({ mobile, checking, taken, data }) {
  if (mobile.length > 0 && mobile.length < 10) {
    return <Text style={styles.hint}>Enter all 10 digits.</Text>;
  }
  if (!/^\d{10}$/.test(mobile)) return null;
  if (checking) {
    return (
      <View style={styles.hintRow}>
        <ActivityIndicator size="small" color={COLORS.textMuted} />
        <Text style={styles.hint}>Checking…</Text>
      </View>
    );
  }
  if (taken) {
    return (
      <View style={styles.hintRow}>
        <MaterialCommunityIcons
          name="close"
          size={space(3.5)}
          color={COLORS.dangerFg}
        />
        <Text style={[styles.hint, styles.hintText, styles.bad]}>
          {mobileTakenLabel(data)}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.hintRow}>
      <MaterialCommunityIcons
        name="check"
        size={space(3.5)}
        color={COLORS.successFg}
      />
      <Text style={[styles.hint, styles.hintText, styles.ok]}>
        Available — not used by any member.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.5,
    color: COLORS.textMuted,
  },
  name: { fontWeight: WEIGHT.semibold, color: COLORS.primary },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  hint: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  hintText: { flex: 1 },
  ok: { color: COLORS.successFg },
  bad: { color: COLORS.dangerFg },
});
