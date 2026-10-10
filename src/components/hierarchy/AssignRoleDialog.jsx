import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import FormDialog from '../FormDialog';
import { ErrorState, Skeleton } from '../ui';
import { Text } from '../Typography';
import MemberBanner from './MemberBanner';
import { useToast } from '../../hooks/core';
import { useAssignableRoles, useUpdateRole } from '../../hooks/useUsers';
import { pickRows } from '../../utils/options';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

const CHEVRON = '#C0CDE0';

const readRole = row => ({
  id: row?.id ?? row?.role_id ?? null,
  name: row?.role_name ?? row?.display_name ?? row?.name ?? '',
});

/**
 * Moves a member to another role — `PATCH /users/{id}/role`. The list is the
 * roles this caller may give this member, which the backend decides.
 */
export default function AssignRoleDialog({ member, onClose }) {
  const toast = useToast();
  const update = useUpdateRole();
  const [roleId, setRoleId] = useState('');
  const [touched, setTouched] = useState(false);

  const isOpen = Boolean(member);
  const rolesQ = useAssignableRoles(member?.id, isOpen);
  const roles = useMemo(
    () =>
      pickRows(rolesQ.data)
        .map(readRole)
        .filter(role => role.id != null),
    [rolesQ.data],
  );

  // Opens on the member's current role, once the list has arrived.
  const seededFor = useRef(null);
  useEffect(() => {
    if (!isOpen) {
      seededFor.current = null;
      return;
    }
    if (seededFor.current === member?.id || !roles.length) return;
    seededFor.current = member?.id;
    setTouched(false);
    const current = roles.find(
      role => role.name && role.name === member?.role_name,
    );
    setRoleId(current ? String(current.id) : '');
  }, [isOpen, member?.id, member?.role_name, roles]);

  const busy = update.isPending;

  const submit = async () => {
    if (busy) return;
    if (!roleId) {
      setTouched(true);
      return;
    }
    try {
      const res = await update.mutateAsync({
        userId: member.id,
        roleId,
        roleName:
          roles.find(role => String(role.id) === String(roleId))?.name ?? null,
      });
      toast.success(res?.detail || 'Role updated successfully.');
      onClose();
    } catch (err) {
      // Stays open, so the choice can be retried.
      toast.error(err?.message);
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Role"
      submitLabel="Update"
      onSubmit={submit}
      submitDisabled={!roleId}
      busy={busy}
    >
      <MemberBanner
        name={member?.user_name}
        meta={`Current role: ${member?.role_name || '—'}`}
      />

      <View>
        <Text style={styles.eyebrow}>Select new role</Text>
        {rolesQ.isLoading ? (
          <View style={styles.list}>
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} style={styles.skeleton} />
            ))}
          </View>
        ) : rolesQ.error ? (
          <ErrorState
            error={rolesQ.error}
            onRetry={rolesQ.refetch}
            title="Could not load roles"
          />
        ) : roles.length === 0 ? (
          <Text style={styles.none}>
            There are no roles you can assign to this member.
          </Text>
        ) : (
          <View accessibilityRole="radiogroup" style={styles.list}>
            {roles.map(role => {
              const on = String(role.id) === String(roleId);
              return (
                <Pressable
                  key={role.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    setRoleId(String(role.id));
                    setTouched(true);
                  }}
                  style={({ pressed }) => [
                    styles.role,
                    pressed && styles.rolePressed,
                    on && styles.roleOn,
                    busy && styles.roleBusy,
                  ]}
                >
                  <Text numberOfLines={1} style={styles.roleName}>
                    {role.name}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={space(4.5)}
                    color={on ? COLORS.accent : CHEVRON}
                  />
                </Pressable>
              );
            })}
          </View>
        )}
        {touched && !roleId ? (
          <Text style={styles.missing}>Please select a role.</Text>
        ) : null}
      </View>
    </FormDialog>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    marginBottom: space(2),
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: COLORS.textMuted,
  },
  list: { gap: space(2) },
  skeleton: { height: space(12), width: '100%' },
  none: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.lineStrong,
    paddingHorizontal: space(4),
    paddingVertical: space(6),
    textAlign: 'center',
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
  },
  role: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  rolePressed: { backgroundColor: COLORS.primary50 },
  roleOn: { borderColor: COLORS.accent, backgroundColor: COLORS.primary50 },
  roleBusy: { opacity: 0.6 },
  roleName: {
    flex: 1,
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  missing: {
    marginTop: space(2),
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.medium,
    color: COLORS.dangerFg,
  },
});
