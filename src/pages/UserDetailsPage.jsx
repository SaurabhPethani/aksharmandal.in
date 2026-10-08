import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import AppHeader from '../components/AppHeader';
import ScrollViewWithTop from '../components/ScrollToTop';
import SiteFooter from '../components/SiteFooter';
import { Text } from '../components/Typography';
import {
  Button,
  Card,
  ErrorState,
  PageLoader,
  Skeleton,
  Toggle,
} from '../components/ui';
import { Tabs } from '../components/Navigation';
import ProfileCards, {
  ProfileHero,
} from '../components/user-detail/ProfileCards';
import QuickTransferDialog from '../components/hierarchy/QuickTransferDialog';
import GraduateDialog from '../components/hierarchy/GraduateDialog';
import ForbiddenPage from './ForbiddenPage';
import { useToast } from '../hooks/core';
import { useMyPermissions } from '../hooks/useMyPermissions';
import { useMemberStatusUpdate, useProfile } from '../hooks/useUsers';
import { stampPhotoUrl, useProfileImage } from '../hooks/useProfileExtras';
import {
  useSyncPermissions,
  useUserPermissions,
} from '../hooks/usePermissionsData';
import { absoluteUrl } from '../api/client';
import { isAttending, statusLabel } from '../utils/memberFlags';
import { LOADING } from '../constants/messages';
import {
  ACTIONS,
  MODULES,
  PERMISSION_SYNC_ACTION,
  TRANSFER_START_ACTION,
  USER_EDIT_ACTION,
} from '../constants/permissions';
import { FONT_DISPLAY } from '../constants/typography';
import {
  COLORS,
  RADII,
  TEXT,
  TNUM,
  WEIGHT,
  space,
} from '../constants/theme';

// Every control is gated on the grant its own endpoint requires:
//
//   the page itself       USERS:READ
//   Edit Profile          USERS:UPDATE
//   Mark (Not) Attending  USERS:BULK_STATUS_UPDATE
//   Transfer              TRANSFER:CREATE
//   Graduate              USERS:CREATE, on a parent-managed child only
//   Permissions tab       USER_PERMISSION:READ
//   Permission toggles    USER_PERMISSION:UPDATE (labels instead, without it)

function Shell({ chrome, refreshControl, children }) {
  return (
    <View style={styles.safe}>
      <AppHeader
        onBack={chrome.onBack}
        onMenu={chrome.onMenu}
        onHelp={chrome.onHelp}
        onNotifications={chrome.onNotifications}
        onProfile={chrome.onProfile}
      />
      <ScrollViewWithTop
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}
      >
        {children}
        <View style={styles.footerBleed}>
          <SiteFooter
            onPrivacy={chrome.onOpenPrivacy}
            onTerms={chrome.onOpenTerms}
            onDeleteAccount={chrome.onOpenDeleteAccount}
          />
        </View>
      </ScrollViewWithTop>
    </View>
  );
}

/**
 * Every module and action full-context returned for this user, each with its
 * own switch. Toggles are staged and saved together: the sync endpoint takes
 * the whole matrix on every call.
 */
function PermissionsTab({ userId, canEdit }) {
  const toast = useToast();
  const { data, isLoading, error, refetch } = useUserPermissions(userId);
  const sync = useSyncPermissions(userId);
  /** `${module}:${action}` -> the granted value the user chose. */
  const [draft, setDraft] = useState({});

  const modules = useMemo(() => data?.modules ?? [], [data]);
  const keyOf = (module, action) => `${module.name}:${action.name}`;
  const grantedNow = (module, action) =>
    draft[keyOf(module, action)] ?? action.granted;

  const counts = useMemo(() => {
    let granted = 0;
    let denied = 0;
    let unsaved = 0;
    for (const module of modules) {
      for (const action of Object.values(module.actions ?? {})) {
        const now = draft[`${module.name}:${action.name}`] ?? action.granted;
        if (now) granted += 1;
        else denied += 1;
        if (now !== action.granted) unsaved += 1;
      }
    }
    return { granted, denied, unsaved };
  }, [modules, draft]);

  const save = async () => {
    const changes = Object.entries(draft)
      .map(([key, granted]) => {
        const [moduleName, actionName] = key.split(':');
        return { moduleName, actionName, granted };
      })
      .filter(({ moduleName, actionName, granted }) => {
        const action = data?.byName?.[moduleName]?.actions?.[actionName];
        return action && action.granted !== granted;
      });
    if (!changes.length) return;

    try {
      // One call per change, in order, so each builds on the last one's result.
      let res;
      for (const change of changes) {
        res = await sync.mutateAsync({ context: data, change });
      }
      setDraft({});
      toast.success(
        res?.detail ||
          `${changes.length} permission${changes.length === 1 ? '' : 's'} updated.`,
      );
    } catch (err) {
      toast.error(err?.message);
      refetch();
    }
  };

  if (isLoading) {
    return (
      <View style={styles.stackSm}>
        {[0, 1, 2, 3].map(i => (
          <Skeleton key={i} style={styles.moduleSkeleton} />
        ))}
      </View>
    );
  }
  if (error) {
    return (
      <Card>
        <ErrorState
          error={error}
          onRetry={refetch}
          title="Could not load permissions"
        />
      </Card>
    );
  }
  if (!modules.length) {
    return (
      <Card>
        <Text style={styles.noModules}>This user has no modules assigned.</Text>
      </Card>
    );
  }

  return (
    <View style={styles.stack}>
      <Card style={styles.summary}>
        <View style={styles.role}>
          <Text style={styles.eyebrow}>Current role</Text>
          <Text style={styles.roleName}>{data?.roleName ?? '—'}</Text>
          <Text style={styles.roleCopy}>
            {canEdit
              ? 'Toggle any action you have yourself to create a user-level override.'
              : 'You can view this user’s permissions but not change them.'}
          </Text>
        </View>

        <View style={styles.stats}>
          <Stat value={counts.granted} label="Granted" color={COLORS.successFg} />
          <Stat
            value={counts.denied}
            label="Denied"
            color={COLORS.textMuted}
            divided
          />
          <Stat
            value={counts.unsaved}
            label="Unsaved"
            color={counts.unsaved ? COLORS.accent : COLORS.textMuted}
            divided
          />
        </View>
      </Card>

      {counts.unsaved > 0 && (
        <View style={styles.unsavedBar}>
          <Text style={styles.unsavedTitle}>
            Unsaved permission change{counts.unsaved === 1 ? '' : 's'}
          </Text>
          <View style={styles.unsavedActions}>
            <Button
              variant="outline"
              onPress={() => setDraft({})}
              disabled={sync.isPending}
            >
              Discard
            </Button>
            <Button variant="accent" onPress={save} busy={sync.isPending}>
              Save Changes
            </Button>
          </View>
        </View>
      )}

      <Text style={styles.eyebrow}>Module permissions</Text>

      <View style={styles.stackSm}>
        {modules.map(module => {
          const actions = Object.values(module.actions ?? {});
          if (!actions.length) return null;
          const on = actions.filter(a => grantedNow(module, a)).length;

          return (
            <View key={module.id ?? module.name} style={styles.module}>
              <View style={styles.moduleHeader}>
                <Text numberOfLines={1} style={styles.moduleTitle}>
                  {module.label}
                </Text>
                <View style={styles.moduleCount}>
                  <Text style={styles.moduleCountText}>
                    {on}/{actions.length}
                  </Text>
                </View>
              </View>

              <View style={styles.actionList}>
                {actions.map((action, i) => {
                  const granted = grantedNow(module, action);
                  const changed = granted !== action.granted;
                  return (
                    <View
                      key={action.id ?? action.name}
                      style={[styles.action, i > 0 && styles.actionDivided]}
                    >
                      <View style={styles.actionCopy}>
                        <View
                          style={[
                            styles.actionDot,
                            granted && styles.actionDotOn,
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={granted ? 'check' : 'close'}
                            size={space(3)}
                            color={
                              granted ? COLORS.successFg : COLORS.textFaint
                            }
                          />
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.actionLabel,
                            granted && styles.actionLabelOn,
                          ]}
                        >
                          {action.label}
                        </Text>
                        {changed && (
                          <View style={styles.unsavedChip}>
                            <Text style={styles.unsavedChipText}>unsaved</Text>
                          </View>
                        )}
                      </View>

                      {/* Without the update grant the switch becomes the word
                          it would have shown. */}
                      {canEdit ? (
                        <Toggle
                          tone="accent"
                          checked={granted}
                          disabled={sync.isPending}
                          onChange={() =>
                            setDraft(d => ({
                              ...d,
                              [keyOf(module, action)]: !granted,
                            }))
                          }
                          label={`${action.label} on ${module.label}`}
                        />
                      ) : (
                        <View
                          style={[styles.grant, granted && styles.grantOn]}
                        >
                          <Text
                            style={[
                              styles.grantText,
                              granted && styles.grantTextOn,
                            ]}
                          >
                            {granted ? 'Granted' : 'Denied'}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Stat({ value, label, color, divided = false }) {
  return (
    <View style={[styles.stat, divided && styles.statDivided]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function UserDetailsPage({
  userId,
  onBack,
  /** Opens the member's edit form; without it Edit Profile is not offered. */
  onEdit,
  onMenu,
  onHelp,
  onNotifications,
  onProfile,
  onOpenPrivacy,
  onOpenTerms,
  onOpenDeleteAccount,
}) {
  const permissionsQ = useMyPermissions();
  const chrome = {
    onBack,
    onMenu,
    onHelp,
    onNotifications,
    onProfile,
    onOpenPrivacy,
    onOpenTerms,
    onOpenDeleteAccount,
  };

  if (permissionsQ.isLoading) {
    return (
      <Shell chrome={chrome}>
        <PageLoader label={LOADING.page} />
      </Shell>
    );
  }
  if (!permissionsQ.data) {
    return (
      <Shell chrome={chrome}>
        <Card>
          <ErrorState
            error={permissionsQ.error}
            onRetry={permissionsQ.refetch}
            title="Could not load your permissions"
          />
        </Card>
      </Shell>
    );
  }
  // Refused before the record is asked for.
  if (!permissionsQ.data.can(MODULES.USERS, ACTIONS.READ)) {
    return (
      <Shell chrome={chrome}>
        <ForbiddenPage
          message="Viewing member details requires the Members · Read permission."
          onBack={onBack}
          backLabel="Back to members"
        />
      </Shell>
    );
  }
  return (
    <UserDetails
      userId={userId}
      can={permissionsQ.data.can}
      onEdit={onEdit}
      chrome={chrome}
    />
  );
}

function UserDetails({ userId, can, onEdit, chrome }) {
  const toast = useToast();
  const [tab, setTab] = useState('profile');
  const [transferring, setTransferring] = useState(null);
  const [graduating, setGraduating] = useState(null);

  const {
    data: user,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useProfile(userId);
  const imageQ = useProfileImage(userId);
  const photo =
    imageQ.data?.image_url ||
    stampPhotoUrl(absoluteUrl(user?.photo_url), userId);
  const statusUpdate = useMemberStatusUpdate();

  const canTransfer = can(MODULES.TRANSFER, TRANSFER_START_ACTION);
  const canChangeStatus = can(MODULES.USERS, ACTIONS.BULK_STATUS_UPDATE);
  const canEditUser = can(MODULES.USERS, USER_EDIT_ACTION) && Boolean(onEdit);
  const canEditPermissions = can(
    MODULES.USER_PERMISSION,
    PERMISSION_SYNC_ACTION,
  );
  const canGraduate =
    can(MODULES.USERS, ACTIONS.CREATE) && user?.managed_by_user_id != null;
  const canViewPermissions = can(MODULES.USER_PERMISSION, ACTIONS.READ);

  const attending = isAttending(user?.status);

  const changeStatus = async () => {
    if (statusUpdate.isPending || !user) return;
    try {
      const res = await statusUpdate.mutateAsync({
        userIds: [user.id ?? Number(userId)],
        status: !attending,
      });
      await refetch();
      toast.success(
        res?.detail ||
          `${user.user_name} marked as ${statusLabel(!attending)}.`,
      );
    } catch (err) {
      toast.error(err?.message);
    }
  };

  if (isLoading) {
    return (
      <Shell chrome={chrome}>
        <PageLoader label={LOADING.page} />
      </Shell>
    );
  }
  if (error) {
    return (
      <Shell chrome={chrome}>
        <View style={styles.stackSm}>
          <BackLink onPress={chrome.onBack} />
          <Card>
            <ErrorState
              error={error}
              onRetry={refetch}
              title="Could not load this member"
            />
          </Card>
        </View>
      </Shell>
    );
  }

  const hasActions =
    canTransfer || canChangeStatus || canGraduate || canEditUser;

  return (
    <Shell
      chrome={chrome}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={refetch}
        />
      }
    >
      <View style={styles.stack}>
        <View style={styles.top}>
          <BackLink onPress={chrome.onBack} />

          {hasActions && (
            <View style={styles.actions}>
              {canTransfer && (
                <Button variant="outline" onPress={() => setTransferring(user)}>
                  Transfer
                </Button>
              )}
              {canChangeStatus && (
                <Button
                  variant="danger"
                  onPress={changeStatus}
                  busy={statusUpdate.isPending}
                >
                  {attending ? 'Mark Not Attending' : 'Mark Attending'}
                </Button>
              )}
              {canGraduate && (
                <Button variant="outline" onPress={() => setGraduating(user)}>
                  Graduate to full member
                </Button>
              )}
              {canEditUser && (
                <Button variant="primary" onPress={() => onEdit(userId)}>
                  Edit Profile
                </Button>
              )}
            </View>
          )}
        </View>

        <ProfileHero
          photo={photo}
          name={user?.user_name || 'Member'}
          meta={[
            user?.mobile_number,
            [user?.sabha_name, user?.mandal_name].filter(Boolean).join(' · '),
          ]}
          chips={
            <>
              {user?.role_name ? (
                <View style={styles.roleChip}>
                  <Text style={styles.roleChipText}>{user.role_name}</Text>
                </View>
              ) : null}
              {user?.status != null && user.status !== '' ? (
                <View
                  style={[
                    styles.statusChip,
                    attending ? styles.statusOk : styles.statusBad,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      attending ? styles.dotOk : styles.dotBad,
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      attending ? styles.statusTextOk : styles.statusTextBad,
                    ]}
                  >
                    {statusLabel(user.status)}
                  </Text>
                </View>
              ) : null}
            </>
          }
        />

        {/* One tab is not a choice, so without the grant the row is left off. */}
        {canViewPermissions && (
          <Tabs
            variant="solid"
            tabs={[
              { value: 'profile', label: 'Profile' },
              { value: 'permissions', label: 'Permissions' },
            ]}
            value={tab}
            onChange={setTab}
          />
        )}

        {canViewPermissions && tab === 'permissions' ? (
          <PermissionsTab userId={userId} canEdit={canEditPermissions} />
        ) : (
          <ProfileCards user={user} userId={userId} />
        )}
      </View>

      <QuickTransferDialog
        member={transferring}
        onClose={() => {
          setTransferring(null);
          refetch();
        }}
      />
      <GraduateDialog
        member={graduating}
        onClose={() => {
          setGraduating(null);
          refetch();
        }}
      />
    </Shell>
  );
}

function BackLink({ onPress }) {
  if (!onPress) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={styles.back}
    >
      {({ pressed }) => {
        const color = pressed ? COLORS.primary : COLORS.textMuted;
        return (
          <>
            <MaterialCommunityIcons
              name="arrow-left"
              size={space(4)}
              color={color}
            />
            <Text style={[styles.backText, { color }]}>Back to Users</Text>
          </>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: space(4), paddingBottom: 0 },
  footerBleed: {
    marginTop: 'auto',
    marginHorizontal: -space(4),
    paddingTop: space(4),
  },
  stack: { gap: space(5) },
  stackSm: { gap: space(4) },

  top: { gap: space(3) },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
  },
  backText: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
  },

  roleChip: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  roleChipText: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    borderRadius: RADII.full,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  statusOk: { backgroundColor: COLORS.successBg },
  statusBad: { backgroundColor: COLORS.dangerBg },
  statusDot: {
    width: space(1.5),
    height: space(1.5),
    borderRadius: RADII.full,
  },
  dotOk: { backgroundColor: COLORS.successFg },
  dotBad: { backgroundColor: COLORS.dangerFg },
  statusText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },
  statusTextOk: { color: COLORS.successFg },
  statusTextBad: { color: COLORS.dangerFg },

  eyebrow: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: COLORS.textMuted,
  },
  noModules: {
    paddingVertical: space(6),
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
  },
  moduleSkeleton: { height: space(48), width: '100%' },

  summary: { gap: space(5) },
  role: {
    borderRadius: RADII.control,
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(5),
    paddingVertical: space(4),
  },
  roleName: {
    marginTop: space(0.5),
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.base,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  roleCopy: {
    marginTop: space(1),
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
  },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: space(4) },
  statDivided: { borderLeftWidth: 1, borderLeftColor: COLORS.lineSoft },
  statValue: {
    fontFamily: FONT_DISPLAY,
    ...TNUM,
    fontSize: TEXT['2xl'],
    lineHeight: TEXT['2xl'],
    fontWeight: WEIGHT.bold,
  },
  statLabel: {
    marginTop: space(1),
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },

  unsavedBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    borderRadius: RADII.card,
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(5),
    paddingVertical: space(4),
  },
  unsavedTitle: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  unsavedActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
  },

  module: {
    overflow: 'hidden',
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(5),
    paddingVertical: space(3.5),
  },
  moduleTitle: {
    flex: 1,
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  moduleCount: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(2.5),
    paddingVertical: space(0.5),
  },
  moduleCountText: {
    fontSize: 11,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  actionList: { paddingHorizontal: space(5) },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    paddingVertical: space(3),
  },
  actionDivided: { borderTopWidth: 1, borderTopColor: COLORS.lineSoft },
  actionCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
  },
  actionDot: {
    width: space(5),
    height: space(5),
    borderRadius: RADII.full,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDotOn: { backgroundColor: COLORS.successBg },
  actionLabel: { flexShrink: 1, fontSize: TEXT.sm, color: COLORS.textMuted },
  actionLabelOn: { fontWeight: WEIGHT.semibold, color: COLORS.primary },
  unsavedChip: {
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: 'rgba(255,134,42,0.4)',
    backgroundColor: 'rgba(255,134,42,0.05)',
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  unsavedChipText: {
    fontSize: 10,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: COLORS.accent,
  },
  grant: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  grantOn: { backgroundColor: COLORS.successBg },
  grantText: {
    fontSize: 11,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  grantTextOn: { color: COLORS.successFg },
});
