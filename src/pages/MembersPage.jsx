import React, { useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import AppHeader from '../components/AppHeader';
import ScrollViewWithTop from '../components/ScrollToTop';
import SiteFooter from '../components/SiteFooter';
import { Text, TextInput } from '../components/Typography';
import { Button, Card, ErrorState, PageHeader, PageLoader } from '../components/ui';
import { Modal } from '../components/Overlays';
import { DialogCancel } from '../components/FormDialog';
import MemberList, { MemberPager } from '../components/hierarchy/MemberList';
import QuickTransferDialog from '../components/hierarchy/QuickTransferDialog';
import ForbiddenPage from './ForbiddenPage';
import { useToast } from '../hooks/core';
import { useMyPermissions } from '../hooks/useMyPermissions';
import { useMemberStatusUpdate, useMembers } from '../hooks/useUsers';
import { useFilterState } from '../hooks/useFilterState';
import { formatNumber } from '../utils/format';
import { isAttending, statusLabel } from '../utils/memberFlags';
import { HTTP_MESSAGES, LOADING } from '../constants/messages';
import {
  ACTIONS,
  MODULES,
  TRANSFER_START_ACTION,
} from '../constants/permissions';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../constants/theme';

// The members in the caller's scope, searched and paged by the server.
//
//   the list itself   USERS:READ
//   status switch     USERS:BULK_STATUS_UPDATE
//   transfer          TRANSFER:CREATE

function StatusDialog({ member, nextStatus, busy, error, onConfirm, onCancel }) {
  const label = statusLabel(nextStatus);
  return (
    <Modal
      isOpen={Boolean(member)}
      onClose={onCancel}
      dismissible={!busy}
      size="sm"
      title={`Mark as ${label}?`}
      footer={
        <>
          <DialogCancel disabled={busy}>No</DialogCancel>
          <Button variant="primary" onPress={onConfirm} busy={busy}>
            Yes
          </Button>
        </>
      }
    >
      <Text style={styles.confirm}>
        Are you sure you want to mark{' '}
        <Text style={styles.confirmName}>{member?.user_name}</Text> as {label}?
      </Text>
      {error ? (
        <View accessibilityRole="alert" style={styles.confirmError}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={space(4)}
            color={COLORS.dangerFg}
          />
          <Text style={styles.confirmErrorText}>{error}</Text>
        </View>
      ) : null}
    </Modal>
  );
}

export default function MembersPage({
  onOpenMember,
  onBack,
  onMenu,
  onHelp,
  onNotifications,
  onProfile,
  onOpenPrivacy,
  onOpenTerms,
  onOpenDeleteAccount,
}) {
  const toast = useToast();
  const permissionsQ = useMyPermissions();
  const permissions = permissionsQ.data;
  const can = (moduleName, actionName) =>
    Boolean(permissions?.can(moduleName, actionName));

  const canRead = can(MODULES.USERS, ACTIONS.READ);
  const canChangeStatus = can(MODULES.USERS, ACTIONS.BULK_STATUS_UPDATE);
  const canTransfer = can(MODULES.TRANSFER, TRANSFER_START_ACTION);
  const title = permissions?.byName?.[MODULES.USERS]?.label || 'Users';

  // Kept outside the component, so the search and the page are still there on
  // the way back from a member's details.
  const { get, set } = useFilterState('members', { q: '', page: '' });
  const search = get('q');

  const members = useMembers(
    {
      search,
      initialPage: Number(get('page', '1')) || 1,
      onPageChange: next => set({ page: next > 1 ? next : '' }),
    },
    canRead,
  );
  const { page, setPage, pageSize, setPageSize, pageCount, total } = members;

  const scrollRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [transferring, setTransferring] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const statusUpdate = useMemberStatusUpdate();
  const nextStatus = toggling ? !isAttending(toggling.status) : false;

  const changeSearch = text => {
    set({ q: text, page: '' });
    setPage(1);
  };

  // The pager sits under the list, so a new page starts from its top.
  const toTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
  const changePage = next => {
    setPage(next);
    toTop();
  };
  const changePageSize = next => {
    setPageSize(next);
    toTop();
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await members.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const askStatus = row => {
    setStatusError(null);
    setToggling(row);
  };

  const cancelStatus = () => {
    if (statusUpdate.isPending) return;
    setToggling(null);
    setStatusError(null);
  };

  const confirmStatus = async () => {
    if (!toggling || statusUpdate.isPending) return;
    const member = toggling;
    setStatusError(null);
    try {
      const res = await statusUpdate.mutateAsync({
        userIds: [member.id],
        status: nextStatus,
      });
      setToggling(null);
      toast.success(
        res?.detail ||
          `${member.user_name} marked as ${statusLabel(nextStatus)}.`,
      );
    } catch (err) {
      // Shown in the dialog, so the choice is still there to retry.
      setStatusError(
        err?.status === 0
          ? HTTP_MESSAGES[0]
          : err?.detail ||
              err?.message ||
              'Could not update the status. Please try again.',
      );
    }
  };

  const body = permissionsQ.isLoading ? (
    <PageLoader label={LOADING.page} />
  ) : !permissions ? (
    <Card>
      <ErrorState
        error={permissionsQ.error}
        onRetry={permissionsQ.refetch}
        title="Could not load your permissions"
      />
    </Card>
  ) : !canRead ? (
    <ForbiddenPage
      message="Viewing members requires the Members · Read permission."
      onBack={onBack}
    />
  ) : (
    <View style={styles.stack}>
      <PageHeader title={title} />

      <Card style={styles.filters}>
        <View style={[styles.search, focused && styles.searchFocused]}>
          <MaterialCommunityIcons
            name="magnify"
            size={space(4.5)}
            color={COLORS.textMuted}
          />
          <TextInput
            value={search}
            onChangeText={changeSearch}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search by name or mobile…"
            placeholderTextColor={COLORS.textFaint}
            autoCorrect={false}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => changeSearch('')}
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={space(4.5)}
                color={COLORS.textFaint}
              />
            </Pressable>
          ) : null}
        </View>

        {!members.isLoading && !members.error && typeof total === 'number' ? (
          <View style={styles.matches}>
            <Text style={styles.matchesText}>
              {formatNumber(total)} {total === 1 ? 'match' : 'matches'}
            </Text>
          </View>
        ) : null}
      </Card>

      <MemberList
        rows={members.pageRows}
        loading={members.isLoading}
        busy={members.isFetching && !members.isLoading}
        error={members.error}
        onRetry={members.refetch}
        canChangeStatus={canChangeStatus}
        onStatusToggle={askStatus}
        statusBusy={statusUpdate.isPending}
        onOpen={onOpenMember ? row => onOpenMember(row.id) : null}
        onQuickTransfer={canTransfer ? setTransferring : null}
      />

      {!members.isLoading && !members.error && (
        <MemberPager
          page={page}
          pageCount={pageCount}
          onChange={changePage}
          pageSize={pageSize}
          onPageSize={changePageSize}
        />
      )}
    </View>
  );

  return (
    <View style={styles.safe}>
      <AppHeader
        onBack={onBack}
        onMenu={onMenu}
        onHelp={onHelp}
        onNotifications={onNotifications}
        onProfile={onProfile}
      />
      <ScrollViewWithTop
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          canRead ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          ) : undefined
        }
      >
        {body}
        <View style={styles.footerBleed}>
          <SiteFooter
            onPrivacy={onOpenPrivacy}
            onTerms={onOpenTerms}
            onDeleteAccount={onOpenDeleteAccount}
          />
        </View>
      </ScrollViewWithTop>

      <QuickTransferDialog
        member={transferring}
        onClose={() => setTransferring(null)}
      />
      <StatusDialog
        member={toggling}
        nextStatus={nextStatus}
        busy={statusUpdate.isPending}
        error={statusError}
        onConfirm={confirmStatus}
        onCancel={cancelStatus}
      />
    </View>
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
  stack: { gap: space(4) },

  filters: { gap: space(3) },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineInput,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(3),
  },
  searchFocused: { borderColor: 'rgba(0,49,88,0.5)' },
  searchInput: {
    flex: 1,
    paddingVertical: space(2),
    fontSize: TEXT.sm,
    color: COLORS.primary,
  },
  matches: {
    alignSelf: 'flex-start',
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: 'rgba(0,49,88,0.2)',
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  matchesText: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },

  confirm: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.5,
    color: COLORS.textMuted,
  },
  confirmName: { fontWeight: WEIGHT.semibold, color: COLORS.primary },
  confirmError: {
    marginTop: space(4),
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(2.5),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.2)',
    backgroundColor: COLORS.dangerBg,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
  },
  confirmErrorText: { flex: 1, fontSize: TEXT.sm, color: COLORS.dangerFg },
});
