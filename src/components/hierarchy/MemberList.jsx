import React, { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import {
  BusyOverlay,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Toggle,
} from '../ui';
import PageSizeSelect from '../PageSizeSelect';
import { Text } from '../Typography';
import { absoluteUrl } from '../../api/client';
import { isAttending } from '../../utils/memberFlags';
import { telUrl } from '../../utils/contact';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

export { isAttending, statusLabel } from '../../utils/memberFlags';

const PILL_LINE = '#E2EAF4';
const PILL_BG = '#EEF2FA';
const PILL_FG = '#6B7FA3';
const DASH = '#C0CDE0';

function StatusSwitch({ row, onToggle, busy }) {
  if (row.status === null || row.status === undefined || row.status === '') {
    return <Text style={styles.dash}>—</Text>;
  }

  const attending = isAttending(row.status);

  return (
    <View style={styles.status}>
      <Toggle
        checked={attending}
        disabled={busy}
        onChange={() => onToggle?.(row)}
        label={`Mark ${row.user_name} as ${attending ? 'Not Attending' : 'Attending'}`}
      />
      <Text
        style={[
          styles.statusText,
          attending ? styles.statusOk : styles.statusBad,
        ]}
      >
        {attending ? 'Attending' : 'Not Attending'}
      </Text>
    </View>
  );
}

function FamilyBadge({ row }) {
  if (!row?.is_family_member) return null;
  return (
    <View
      style={styles.family}
      accessibilityLabel={
        row.managed_by_name
          ? `Family member of ${row.managed_by_name}`
          : 'Family member — shares a family number'
      }
    >
      <Text style={styles.familyText}>Family</Text>
    </View>
  );
}

function CallLink({ mobile, name }) {
  // A managed child's placeholder number has letters in it and cannot be dialled.
  if (!mobile || /[a-z]/i.test(String(mobile))) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Call ${name || 'member'} on ${mobile}`}
      onPress={() => Linking.openURL(telUrl(mobile))}
      hitSlop={6}
      style={styles.call}
    >
      {({ pressed }) => {
        const color = pressed ? COLORS.accent : PILL_FG;
        return (
          <>
            <MaterialCommunityIcons name="phone" size={space(3)} color={color} />
            <Text style={[styles.callText, { color }]}>{mobile}</Text>
          </>
        );
      }}
    </Pressable>
  );
}

function ActionIcon({ name }) {
  return (
    <MaterialCommunityIcons
      name={name}
      size={space(3.5)}
      color={COLORS.textFaint}
    />
  );
}

/** A pill that is the whole target for its action, or plain when there is none. */
function ActionPill({ onPress, label, accent = false, children }) {
  const box = [styles.pill, accent && styles.pillAccent];
  if (!onPress) return <View style={box}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [box, pressed && styles.pillPressed]}
    >
      {children}
    </Pressable>
  );
}

function FollowupBody({ row, actionable }) {
  const name = row.followup_by_id_name;

  if (!name) {
    if (!actionable) return <Text style={styles.dash}>—</Text>;
    return (
      <>
        <MaterialCommunityIcons
          name="plus"
          size={space(3)}
          color={COLORS.accent}
        />
        <Text style={[styles.pillText, styles.pillTextAccent]}>
          Assign followup
        </Text>
      </>
    );
  }

  return (
    <>
      <Text numberOfLines={1} style={[styles.pillText, styles.pillTextAccent]}>
        {name}
      </Text>
      {actionable && <ActionIcon name="pencil" />}
    </>
  );
}

const followupLabel = row =>
  row.followup_by_id_name
    ? `Change follow-up for ${row.user_name || 'member'}`
    : `Assign a follow-up for ${row.user_name || 'member'}`;

const transferLabel = row =>
  `Transfer ${row.user_name || 'member'} to another Sabha`;
const roleLabel = row => `Assign a role to ${row.user_name || 'member'}`;

/** The member's photo when they have one, their initial otherwise. */
function Avatar({ name, src }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const uri = absoluteUrl(src);

  return (
    <View style={styles.avatar}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={styles.avatarImage}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={styles.avatarText}>{initial}</Text>
      )}
    </View>
  );
}

function MemberCard({
  row,
  canChangeStatus,
  onStatusToggle,
  statusBusy,
  onOpen,
  onEdit,
  onQuickTransfer,
  onChangeFollowup,
  onAssignRole,
}) {
  const name = row.user_name || '—';

  return (
    <Card style={styles.card}>
      {onOpen ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`View ${row.user_name || 'member'}`}
          onPress={() => onOpen(row)}
        >
          <Avatar name={row.user_name} src={row.profile_image} />
        </Pressable>
      ) : (
        <Avatar name={row.user_name} src={row.profile_image} />
      )}

      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.identity}>
            <View style={styles.nameRow}>
              {onOpen ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`View ${row.user_name || 'member'}`}
                  onPress={() => onOpen(row)}
                  hitSlop={6}
                  style={styles.nameLink}
                >
                  <Text numberOfLines={1} style={styles.name}>
                    {name}
                  </Text>
                </Pressable>
              ) : (
                <Text numberOfLines={1} style={[styles.name, styles.nameLink]}>
                  {name}
                </Text>
              )}
              <FamilyBadge row={row} />
            </View>
            {/* A managed child is reached on the parent's number. */}
            <CallLink
              mobile={row.contact_number || row.mobile_number}
              name={row.user_name}
            />
          </View>

          {onEdit && (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Edit ${row.user_name || 'member'}`}
              onPress={() => onEdit(row)}
              hitSlop={8}
            >
              <Text style={styles.edit}>Edit</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.pills}>
          {row.role_name ? (
            <ActionPill
              onPress={onAssignRole && (() => onAssignRole(row))}
              label={roleLabel(row)}
            >
              <Text style={styles.pillText}>{row.role_name}</Text>
              {onAssignRole && <ActionIcon name="pencil" />}
            </ActionPill>
          ) : null}
          {row.sabha_name ? (
            <ActionPill
              onPress={onQuickTransfer && (() => onQuickTransfer(row))}
              label={transferLabel(row)}
            >
              <Text style={styles.pillText}>{row.sabha_name}</Text>
              {onQuickTransfer && <ActionIcon name="swap-horizontal" />}
            </ActionPill>
          ) : null}
          {(row.followup_by_id_name || onChangeFollowup) && (
            <ActionPill
              accent
              onPress={onChangeFollowup && (() => onChangeFollowup(row))}
              label={followupLabel(row)}
            >
              <FollowupBody row={row} actionable={Boolean(onChangeFollowup)} />
            </ActionPill>
          )}
        </View>

        {canChangeStatus && (
          <View style={styles.statusRow}>
            <StatusSwitch
              row={row}
              onToggle={onStatusToggle}
              busy={statusBusy}
            />
          </View>
        )}
      </View>
    </Card>
  );
}

/**
 * The members list, as cards. Every action is a callback, and one that is not
 * passed is not drawn: the grant behind it is the caller's business.
 */
export default function MemberList({
  rows = [],
  loading,
  error,
  onRetry,
  /** A refetch while rows are already on screen — paging or filtering. */
  busy = false,
  /** Without it the status row is left off the cards altogether. */
  canChangeStatus = false,
  onStatusToggle,
  statusBusy = false,
  /** (row) => void. Opens the member's details; without it the name is plain. */
  onOpen = null,
  onEdit = null,
  onQuickTransfer = null,
  onChangeFollowup = null,
  onAssignRole = null,
}) {
  if (loading) {
    return (
      <Card style={styles.skeletons}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={styles.skeletonRow}>
            <Skeleton style={styles.skeletonAvatar} />
            <View style={styles.skeletonCopy}>
              <Skeleton style={styles.skeletonName} />
              <Skeleton style={styles.skeletonSub} />
            </View>
            <Skeleton style={styles.skeletonPill} />
          </View>
        ))}
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <ErrorState
          error={error}
          onRetry={onRetry}
          title="Failed to load users"
        />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No members found"
          hint="Try clearing the search or filters."
        />
      </Card>
    );
  }

  return (
    <View>
      {busy && <BusyOverlay />}
      <View style={styles.list}>
        {rows.map(row => (
          <MemberCard
            key={row.id}
            row={row}
            canChangeStatus={canChangeStatus}
            onStatusToggle={onStatusToggle}
            statusBusy={statusBusy}
            onOpen={onOpen}
            onEdit={onEdit}
            onQuickTransfer={onQuickTransfer}
            onChangeFollowup={onChangeFollowup}
            onAssignRole={onAssignRole}
          />
        ))}
      </View>
    </View>
  );
}

/** Previous / numbered / Next, with the page-size dropdown beside the count. */
export function MemberPager({ page, pageCount, onChange, pageSize, onPageSize }) {
  // The size dropdown outlives the page buttons: with 30 members there is one
  // page at 50, and hiding the control would make 50 unreachable.
  if (pageCount <= 1 && !onPageSize) return null;

  const items = [];
  if (pageCount <= 7) {
    for (let i = 1; i <= pageCount; i += 1) items.push(i);
  } else {
    items.push(1);
    if (page > 3) items.push('ellipsis');
    for (
      let i = Math.max(2, page - 1);
      i <= Math.min(pageCount - 1, page + 1);
      i += 1
    )
      items.push(i);
    if (page < pageCount - 2) items.push('ellipsis');
    items.push(pageCount);
  }

  return (
    <View style={styles.pager}>
      <View style={styles.pagerInfo}>
        <PageSizeSelect value={pageSize} onChange={onPageSize} />
        <Text style={styles.pagerCount}>
          Page {page} of {pageCount}
        </Text>
      </View>

      {pageCount > 1 && (
        <View style={styles.pagerButtons}>
          <Button
            onPress={() => onChange(page - 1)}
            disabled={page <= 1}
            style={styles.pagerStep}
            textStyle={styles.pagerStepText}
          >
            Previous
          </Button>
          {items.map((item, i) =>
            item === 'ellipsis' ? (
              <Text key={`e-${i}`} style={styles.pagerEllipsis}>
                …
              </Text>
            ) : (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityLabel={`Page ${item}`}
                accessibilityState={{ selected: page === item }}
                onPress={() => onChange(item)}
                style={[
                  styles.pagerPage,
                  page === item && styles.pagerPageActive,
                ]}
              >
                <Text
                  style={[
                    styles.pagerPageText,
                    page === item && styles.pagerPageTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ),
          )}
          <Button
            onPress={() => onChange(page + 1)}
            disabled={page >= pageCount}
            style={styles.pagerStep}
            textStyle={styles.pagerStepText}
          >
            Next
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space(3) },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  body: { flex: 1, minWidth: 0 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space(3),
  },
  identity: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  nameLink: { flexShrink: 1 },
  name: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  edit: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.accent,
  },

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
  avatarText: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.white,
  },

  family: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(1.5),
    paddingVertical: space(0.5),
  },
  familyText: {
    fontSize: 10,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },

  call: {
    alignSelf: 'flex-start',
    marginTop: space(0.5),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
  },
  callText: { fontSize: TEXT.xs },

  pills: {
    marginTop: space(2),
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
  },
  pill: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: PILL_LINE,
    backgroundColor: PILL_BG,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  pillAccent: {
    borderColor: 'rgba(255,134,42,0.2)',
    backgroundColor: 'rgba(255,134,42,0.1)',
  },
  pillPressed: { opacity: 0.7 },
  pillText: {
    flexShrink: 1,
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: PILL_FG,
  },
  pillTextAccent: { color: COLORS.accent },
  dash: { fontSize: TEXT.sm, color: DASH },

  statusRow: {
    marginTop: space(3),
    borderTopWidth: 1,
    borderTopColor: '#F0F4F9',
    paddingTop: space(3),
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: space(2.5) },
  statusText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },
  statusOk: { color: COLORS.successFg },
  statusBad: { color: COLORS.dangerFg },

  skeletons: { gap: space(4) },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  skeletonAvatar: {
    width: space(10),
    height: space(10),
    borderRadius: RADII.full,
  },
  skeletonCopy: { flex: 1, gap: space(2) },
  skeletonName: { height: space(3.5), width: '50%' },
  skeletonSub: { height: space(2.5), width: '30%' },
  skeletonPill: {
    height: space(6),
    width: space(20),
    borderRadius: RADII.full,
  },

  pager: { gap: space(3) },
  pagerInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(3),
  },
  pagerCount: { fontSize: TEXT.sm, color: PILL_FG },
  pagerButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(1.5),
  },
  pagerStep: { paddingHorizontal: space(3), paddingVertical: space(2) },
  pagerStepText: { fontSize: TEXT.sm },
  pagerEllipsis: {
    paddingHorizontal: space(1.5),
    fontSize: TEXT.sm,
    color: '#9AA8C0',
  },
  pagerPage: {
    minWidth: 36,
    alignItems: 'center',
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: PILL_LINE,
    paddingHorizontal: space(2.5),
    paddingVertical: space(2),
  },
  pagerPageActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  pagerPageText: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: PILL_FG,
  },
  pagerPageTextActive: { color: COLORS.white },
});
