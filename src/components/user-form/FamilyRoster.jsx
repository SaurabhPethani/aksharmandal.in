import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Button, ErrorState, Skeleton } from '../ui';
import { Combobox, FormField, Select } from '../form';
import { Text } from '../Typography';
import { useMandalUsers } from '../../hooks/useLookups';
import { absoluteUrl } from '../../api/client';
import { pickRows, toOptions } from '../../utils/options';
import { headRelationIdFrom, isHeadRelation } from './shared';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

/**
 * The member's family — `GET /users/{id}/family`, written through
 * `POST` / `DELETE /users/{id}/family-member`.
 *
 * A family is a real record with exactly one head. A member with no family yet
 * has one founded for them, with themselves as its head, the first time a
 * relative is linked; the head cannot be removed while anyone else remains.
 */

/** A member row's own id, under either spelling the API might use. */
const idOf = row => row?.user_id ?? row?.id;

function Avatar({ src }) {
  return (
    <View style={styles.avatar}>
      {src ? (
        <Image source={{ uri: src }} style={styles.avatarImage} />
      ) : (
        <MaterialCommunityIcons
          name="account"
          size={space(5)}
          color={COLORS.white}
        />
      )}
    </View>
  );
}

function EmptyFamily({ message }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons
          name="account-group"
          size={space(6)}
          color={COLORS.textMuted}
        />
      </View>
      <Text style={styles.emptyTitle}>No family linked yet</Text>
      <Text style={styles.emptyHint}>{message}</Text>
    </View>
  );
}

export default function FamilyRoster({
  query,
  userId,
  relations,
  mutations,
  onError,
  ensureMember,
  busy: pageBusy = false,
  allowSelfRemove = false,
  readOnly = false,
}) {
  const family = query?.data ?? null;
  // `family_id: 0` is how the API says "no family", not a real id.
  const familyId = Number(family?.family_id) || null;
  const members = pickRows(family?.members ?? family);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ member: '', relation: '' });
  const [touched, setTouched] = useState(false);
  // Shown under the Family Member field, because that is what these refusals
  // are about — "already assigned to the family of X".
  const [saveError, setSaveError] = useState(null);

  const candidatesQ = useMandalUsers(open);
  const linked = new Set(members.map(m => String(idOf(m))));
  const candidates = useMemo(
    () =>
      pickRows(candidatesQ.data)
        .filter(
          r =>
            idOf(r) != null &&
            String(idOf(r)) !== String(userId) &&
            !linked.has(String(idOf(r))),
        )
        .map(r => ({
          value: String(idOf(r)),
          label: r.user_name ?? r.name ?? String(idOf(r)),
          meta: r.mobile_number ?? '',
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidatesQ.data, userId, members],
  );

  // "Family Head" is not offered: it is what founding a family grants, and the
  // API rejects it for anyone joining an existing one.
  const relationOptions = toOptions(
    pickRows(relations?.data).filter(r => !isHeadRelation(r?.name)),
  );
  const headRelationId = headRelationIdFrom(relations);

  const busy = mutations?.isPending || pageBusy;

  const closeForm = () => {
    setOpen(false);
    setDraft({ member: '', relation: '' });
    setTouched(false);
    setSaveError(null);
  };

  const submit = async () => {
    if (busy) return;
    if (!draft.member || !draft.relation) {
      setTouched(true);
      return;
    }
    setSaveError(null);
    try {
      const subjectId = userId ?? (await ensureMember?.());
      if (!subjectId) return;

      await mutations.add.mutateAsync({
        subjectId,
        memberUserId: draft.member,
        relationId: draft.relation,
        familyId,
        headRelationId,
      });
      closeForm();
    } catch (err) {
      setSaveError(err?.message ?? 'Could not save this family member.');
      onError?.(err);
    }
  };

  const removeMember = async memberUserId => {
    if (busy) return;
    try {
      await mutations.remove.mutateAsync({ subjectId: userId, memberUserId });
    } catch (err) {
      onError?.(err);
    }
  };

  if (query?.isLoading) {
    return (
      <View style={styles.skeletons}>
        {[0, 1].map(i => (
          <Skeleton key={i} style={styles.skeleton} />
        ))}
      </View>
    );
  }
  if (query?.error) {
    return (
      <ErrorState
        error={query.error}
        onRetry={query.refetch}
        title="Could not load the family"
      />
    );
  }

  return (
    <View style={styles.stack}>
      {members.length === 0 && !open ? (
        <EmptyFamily
          message={
            readOnly
              ? 'This member has no family linked yet.'
              : userId
                ? 'Add the first relative to start this user’s family tree.'
                : 'Add the first relative to start this user’s family tree. Saving it creates the member.'
          }
        />
      ) : members.length > 0 ? (
        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.eyebrow}>FAMILY</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {relativeCount(members, userId)}
              </Text>
            </View>
          </View>

          {members.map((m, i) => {
            const name = m.user_name ?? m.name ?? '—';
            const relation = m.relation_name ?? m.relation ?? null;
            const isHead = isHeadRelation(relation);
            const isSelf = String(idOf(m) ?? '') === String(userId);

            return (
              <View
                key={m.id ?? `${name}-${i}`}
                style={[styles.member, i > 0 && styles.memberDivided]}
              >
                <View style={styles.memberCopy}>
                  <Avatar src={absoluteUrl(m.photo_url)} />
                  <View style={styles.memberNames}>
                    <Text numberOfLines={1} style={styles.memberName}>
                      {name}
                    </Text>
                    {isHead ? (
                      <Text style={styles.memberRole}>Family Head</Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.memberActions}>
                  {isSelf ? (
                    <View style={styles.selfBadge}>
                      <Text style={styles.selfBadgeText}>This user</Text>
                    </View>
                  ) : null}
                  {!isSelf && relation && !isHead ? (
                    <View style={styles.relationBadge}>
                      <Text style={styles.relationText}>{relation}</Text>
                    </View>
                  ) : null}
                  {/* The head is never offered Remove while the family has
                      anyone else in it — the API refuses to remove a head. */}
                  {!readOnly && (!isSelf || allowSelfRemove) && !isHead ? (
                    <Text
                      accessibilityRole="button"
                      onPress={busy ? undefined : () => removeMember(idOf(m))}
                      style={[styles.remove, busy && styles.disabled]}
                    >
                      Remove
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {readOnly ? null : open ? (
        <View style={styles.form}>
          {/* The brand's amber, not the danger red: founding a family is what
              is meant to happen here, it is just worth saying out loud. */}
          {!familyId ? (
            <View style={styles.foundNotice}>
              <Text style={styles.foundText}>
                This member has no family yet — adding the first relative will
                create their family with this member as the Family Head.
              </Text>
            </View>
          ) : null}

          <FormField
            label="Family Member"
            required
            compact
            error={
              (touched && !draft.member ? 'Please select a member.' : null) ??
              saveError
            }
          >
            <Combobox
              label="Family Member"
              value={draft.member}
              onChange={v => {
                setDraft(d => ({ ...d, member: v }));
                setTouched(true);
              }}
              options={candidates}
              disabled={busy || candidatesQ.isLoading}
              error={Boolean(touched && !draft.member) || Boolean(saveError)}
              placeholder={
                candidatesQ.isLoading ? 'Loading…' : 'Search Mandal users…'
              }
              emptyLabel="No one matches that name or number."
            />
          </FormField>

          <FormField
            label="Relation"
            required
            compact
            error={touched && !draft.relation ? 'Please select a relation.' : null}
          >
            <Select
              label="Relation"
              error={touched && !draft.relation}
              value={draft.relation}
              onChange={v => {
                setDraft(d => ({ ...d, relation: v }));
                setTouched(true);
              }}
              disabled={busy || relations?.isLoading}
              placeholder={
                relations?.isLoading ? 'Loading…' : 'Select relation'
              }
              options={relationOptions}
            />
          </FormField>

          <View style={styles.formActions}>
            <Button variant="ghost" onPress={closeForm} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="accent"
              onPress={submit}
              busy={busy}
              disabled={!draft.member || !draft.relation}
            >
              Save
            </Button>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
        >
          <Text style={styles.addText}>+ Add family member</Text>
        </Pressable>
      )}
    </View>
  );
}

/** "1 member" / "3 members", counting the relatives rather than the subject. */
function relativeCount(members, userId) {
  const n = members.filter(
    m => String(idOf(m) ?? '') !== String(userId),
  ).length;
  return `${n} member${n === 1 ? '' : 's'}`;
}

const styles = StyleSheet.create({
  stack: { gap: space(3) },
  skeletons: { gap: space(2) },
  skeleton: { height: space(14), width: '100%' },

  empty: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    paddingHorizontal: space(6),
    paddingVertical: space(10),
    alignItems: 'center',
  },
  emptyIcon: {
    width: space(14),
    height: space(14),
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: space(4),
    fontSize: TEXT.base,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  emptyHint: {
    marginTop: space(1),
    fontSize: TEXT.sm,
    textAlign: 'center',
    color: COLORS.textMuted,
  },

  panel: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    padding: space(4),
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    marginBottom: space(1),
  },
  eyebrow: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.bold,
    letterSpacing: 0.6,
    color: COLORS.textMuted,
  },
  countBadge: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(2.5),
    paddingVertical: space(0.5),
  },
  countText: { fontSize: 11, fontWeight: WEIGHT.semibold, color: COLORS.textMuted },

  member: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    paddingVertical: space(3),
  },
  memberDivided: { borderTopWidth: 1, borderTopColor: COLORS.lineSoft },
  memberCopy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
  },
  memberNames: { flex: 1 },
  memberName: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  memberRole: { fontSize: TEXT.xs, color: COLORS.textMuted },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  avatar: {
    width: space(10),
    height: space(10),
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  selfBadge: {
    borderRadius: RADII.full,
    backgroundColor: 'rgba(255,134,42,0.1)',
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  selfBadgeText: {
    fontSize: 11,
    fontWeight: WEIGHT.semibold,
    color: COLORS.accent,
  },
  relationBadge: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  relationText: {
    fontSize: 11,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  remove: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.dangerFg,
  },
  disabled: { opacity: 0.5 },

  form: {
    gap: space(4),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    padding: space(4),
  },
  foundNotice: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: 'rgba(255,134,42,0.3)',
    backgroundColor: 'rgba(255,134,42,0.05)',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  foundText: { fontSize: TEXT.sm, color: COLORS.accentHover },
  formActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space(2),
  },

  add: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.lineStrong,
    paddingHorizontal: space(4),
    paddingVertical: space(4),
    alignItems: 'center',
  },
  addPressed: { backgroundColor: COLORS.primary50 },
  addText: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
});
