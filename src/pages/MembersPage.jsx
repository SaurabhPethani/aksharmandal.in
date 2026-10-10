import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import AppHeader from '../components/AppHeader';
import ScrollViewWithTop from '../components/ScrollToTop';
import SiteFooter from '../components/SiteFooter';
import { Text, TextInput } from '../components/Typography';
import { Button, Card, ErrorState, PageHeader, PageLoader } from '../components/ui';
import { Modal } from '../components/Overlays';
import { DialogCancel } from '../components/FormDialog';
import MultiSelectFilter, {
  SelectFilter,
} from '../components/form/MultiSelectFilter';
import HierarchyGrid, {
  LEVEL_META,
  levelName,
} from '../components/hierarchy/HierarchyGrid';
import AssignRoleDialog from '../components/hierarchy/AssignRoleDialog';
import ChangeFollowupDialog from '../components/hierarchy/ChangeFollowupDialog';
import MemberList, { MemberPager } from '../components/hierarchy/MemberList';
import QuickTransferDialog from '../components/hierarchy/QuickTransferDialog';
import ScopeAreaFilter from '../components/hierarchy/ScopeAreaFilter';
import ForbiddenPage from './ForbiddenPage';
import { useToast } from '../hooks/core';
import { useMyPermissions } from '../hooks/useMyPermissions';
import {
  useHierarchyGroups,
  useMandals,
  useMyGroupLeaderships,
  usePradeshList,
  useSabhas,
} from '../hooks/useHierarchy';
import {
  useMemberStatusUpdate,
  useMembers,
  useUserListFilters,
} from '../hooks/useUsers';
import {
  useCategories,
  useFollowupPersons,
  useMe,
} from '../hooks/useLookups';
import { useFilterState } from '../hooks/useFilterState';
import { formatNumber } from '../utils/format';
import {
  NIMIT_SEVAK_FIELD,
  NIMIT_SEVAK_LABEL,
  SWAYAM_SEVAK_FIELD,
  SWAYAM_SEVAK_LABEL,
  ambrishLabel,
  isAttending,
  statusLabel,
} from '../utils/memberFlags';
import { searchMatches, toOptions } from '../utils/options';
import { computeSabhaIds, selectionForSabha } from '../utils/scopeArea';
import { HTTP_MESSAGES, LOADING } from '../constants/messages';
import {
  ACTIONS,
  FOLLOWUP_UPDATE_ACTION,
  MODULES,
  ROLE_UPDATE_ACTION,
  TRANSFER_START_ACTION,
  USER_EDIT_ACTION,
} from '../constants/permissions';
import { canFilterByFollowup } from '../constants/roles';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../constants/theme';

// Pradesh → Mandal → Sabha → members: the page opens on the first level the
// caller may read and has not picked from yet, and on the member list once
// there is none left.
//
//   a level's cards   PRADESH / MANDAL / SABHA :READ
//   the member list   USERS:READ
//   Add User          USERS:CREATE
//   Edit on a row     USERS:UPDATE
//   role pill         USERS:UPDATE_ROLE
//   follow-up pill    USERS:UPDATE_FOLLOWUP
//   status switch     USERS:BULK_STATUS_UPDATE
//   transfer          TRANSFER:CREATE

const LEVELS = ['pradesh', 'mandal', 'sabha'];

const FILTER_DEFAULTS = {
  q: '',
  page: '',
  selPradesh: null,
  selMandal: null,
  selSabha: null,
  viewAll: false,
  area: null,
  followup: '',
  category: null,
  tag: null,
};

/** What moving around the tree clears. */
const CLEARED = { q: '', page: '', followup: '', category: null, tag: null };

/** A search starts at this many characters; fewer filters nothing. */
const MIN_SEARCH = 3;

/** The follow-up filter's value for members nobody follows up. */
const UNASSIGNED = 'null';
const NONE = [];

const CHEVRON = '#C0CDE0';

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

function Breadcrumbs({ trail }) {
  return (
    <View style={styles.trail}>
      {trail.map((crumb, i) => (
        <View key={`${crumb.label}-${i}`} style={styles.crumb}>
          {i > 0 && (
            <MaterialCommunityIcons
              name="chevron-right"
              size={space(3.5)}
              color={CHEVRON}
            />
          )}
          {crumb.onPress ? (
            <Pressable
              accessibilityRole="link"
              onPress={crumb.onPress}
              hitSlop={8}
            >
              <Text style={styles.crumbLink}>{crumb.label}</Text>
            </Pressable>
          ) : (
            <Text style={styles.crumbCurrent}>{crumb.label}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const memberCountOf = (rows, id) => {
  const row = (rows ?? []).find(r => Number(r.id) === Number(id));
  return typeof row?.member_count === 'number' ? row.member_count : null;
};

export default function MembersPage({
  onOpenMember,
  /** Opens the add-member form; without it Add User is not offered. */
  onAddUser,
  /** (id) => void. Opens a member's edit form; without it rows carry no Edit. */
  onEditMember,
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
  const insets = useSafeAreaInsets();
  const permissionsQ = useMyPermissions();
  const permissions = permissionsQ.data;
  const can = (moduleName, actionName) =>
    Boolean(permissions?.can(moduleName, actionName));

  const canRead = can(MODULES.USERS, ACTIONS.READ);
  const canCreate = can(MODULES.USERS, ACTIONS.CREATE);
  const canEdit = can(MODULES.USERS, USER_EDIT_ACTION);
  const canAssignRole = can(MODULES.USERS, ROLE_UPDATE_ACTION);
  const canChangeFollowup = can(MODULES.USERS, FOLLOWUP_UPDATE_ACTION);
  const canChangeStatus = can(MODULES.USERS, ACTIONS.BULK_STATUS_UPDATE);
  const canTransfer = can(MODULES.TRANSFER, TRANSFER_START_ACTION);
  const canReadHierarchy = can(MODULES.HIERARCHY, ACTIONS.READ);
  const canReadSabha = can(MODULES.SABHA, ACTIONS.READ);
  const title = permissions?.byName?.[MODULES.USERS]?.label || 'Users';

  // The head of a Sabha group browses Sabhas without the Sabha grant.
  const leaderships = useMyGroupLeaderships(!canReadSabha && canReadHierarchy);
  const leadsSabhaGroup = (leaderships.data || []).some(
    l => l.level === 'sabha',
  );
  const access = {
    pradesh: can(MODULES.PRADESH, ACTIONS.READ),
    mandal: can(MODULES.MANDAL, ACTIONS.READ),
    sabha: canReadSabha || leadsSabhaGroup,
  };

  // Kept outside the component, so the place in the tree, the search and the
  // page are still there on the way back from a member's details.
  const { get, set } = useFilterState('members', FILTER_DEFAULTS);
  const search = get('q');
  const typed = search.trim().length;
  const query = typed >= MIN_SEARCH ? search : '';
  const viewAll = Boolean(get('viewAll', false));
  const area = get('area', null) || null;
  const followup = get('followup');
  const categories = get('category', null) || NONE;
  const tags = get('tag', null) || NONE;
  const selected = {
    pradesh: get('selPradesh', null) || null,
    mandal: get('selMandal', null) || null,
    sabha: get('selSabha', null) || null,
  };

  const level =
    viewAll || !canRead
      ? 'users'
      : LEVELS.find(l => access[l] && !selected[l]) ?? 'users';
  const browsing = level !== 'users';
  const levelLabel = LEVEL_META[level]?.label ?? '';

  const pradeshQ = usePradeshList(level === 'pradesh');
  const mandalQ = useMandals(selected.pradesh?.id, level === 'mandal');
  const sabhaQ = useSabhas(selected.mandal?.id, level === 'sabha');
  const levelQ = { pradesh: pradeshQ, mandal: mandalQ, sabha: sabhaQ }[level];

  const filtersQ = useUserListFilters(canRead);
  const filters = filtersQ.data;
  const areaSabhaIds = useMemo(
    () => computeSabhaIds(area || {}, filters),
    [area, filters],
  );

  const listing = canRead && !browsing;
  const sabhaId = selected.sabha?.id;
  const shownArea = useMemo(
    () => (sabhaId ? selectionForSabha(sabhaId, filters) : area),
    [sabhaId, filters, area],
  );
  const followupOn = listing && canFilterByFollowup(permissions?.roleId);
  const wideRole = (Number(permissions?.hierarchyRank) || 0) >= 50;

  const meQ = useMe(followupOn || (listing && !wideRole));
  // A wide role has no one gender of its own to go by: it is read off the
  // Sabhas being listed, when they all share one.
  const listedGender = useMemo(() => {
    const ids = areaSabhaIds.length
      ? areaSabhaIds
      : sabhaId
        ? [sabhaId]
        : [];
    if (!wideRole || !ids.length) return null;
    const genderOf = new Map(
      (filters?.sabhas || []).map(s => [Number(s.id), s.gender || null]),
    );
    const found = new Set(ids.map(id => genderOf.get(Number(id))));
    return (found.size === 1 && [...found][0]) || null;
  }, [wideRole, sabhaId, areaSabhaIds, filters]);
  const gender = wideRole ? listedGender : meQ.data?.gender || null;

  const categoriesQ = useCategories(
    listing && (wideRole || !meQ.isPending),
    gender,
  );
  const categoryOptions = useMemo(
    () =>
      (Array.isArray(categoriesQ.data) ? categoriesQ.data : []).map(c => ({
        id: c.id,
        name: c.name,
      })),
    [categoriesQ.data],
  );
  const tagOptions = useMemo(
    () => [
      { id: 'is_ambrish', name: ambrishLabel(gender) },
      { id: NIMIT_SEVAK_FIELD, name: NIMIT_SEVAK_LABEL },
      { id: SWAYAM_SEVAK_FIELD, name: SWAYAM_SEVAK_LABEL },
    ],
    [gender],
  );

  const followupScope =
    areaSabhaIds.length
      ? areaSabhaIds
      : sabhaId ??
        ((filters?.sabhas || []).length > 1
          ? null
          : meQ.data?.sabha_id ?? null);
  const followupQ = useFollowupPersons(
    followupOn && !meQ.isPending,
    followupScope,
  );
  const followupBusy = followupQ.isLoading || (followupOn && meQ.isLoading);
  const followupUnavailable = followupBusy || Boolean(followupQ.error);
  const followupChoices = useMemo(
    () => [
      { value: '', label: 'All Follow-up' },
      { value: UNASSIGNED, label: 'Unassigned' },
      ...toOptions(followupQ.data, { valueKey: 'id', labelKey: 'user_name' }),
    ],
    [followupQ.data],
  );

  const groupsQ = useHierarchyGroups(browsing && canReadHierarchy);
  const groups = useMemo(() => {
    if (!browsing) return [];
    const leaders = new Map(
      (groupsQ.data || []).map(g => [Number(g.id), g.leaders]),
    );
    return (filters?.[`${level}_groups`] || []).map(g => ({
      id: g.id,
      name: g.name,
      entityIds: g[`${level}_ids`],
      leaders: leaders.get(Number(g.id)) || [],
    }));
  }, [browsing, level, filters, groupsQ.data]);

  const members = useMembers(
    {
      sabhaId,
      search: query,
      followupById: followupOn ? followup : '',
      filterSabhaIds: listing ? areaSabhaIds : undefined,
      categoryIds: listing ? categories : undefined,
      tags: listing ? tags : undefined,
      initialPage: Number(get('page', '1')) || 1,
      onPageChange: next => set({ page: next > 1 ? next : '' }),
    },
    canRead && !browsing && !leaderships.isLoading,
  );
  const { page, setPage, pageSize, setPageSize, pageCount, total } = members;

  // A Sabha's card counts attending members only, where this list holds
  // everyone. When the whole result is in hand the split is counted from it,
  // so the two figures can be read against each other.
  const statusSplit = useMemo(() => {
    const held = Array.isArray(members.data?.items) ? members.data.items : null;
    if (!held || typeof total !== 'number' || held.length < total) return null;
    const attending = held.filter(row => isAttending(row.status)).length;
    return { attending, notAttending: held.length - attending };
  }, [members.data, total]);

  // A choice the reloaded list no longer offers is dropped, not sent.
  const categoriesSettled =
    !categoriesQ.isFetching && Array.isArray(categoriesQ.data);
  useEffect(() => {
    if (!listing || !categories.length || !categoriesSettled) return;
    const offered = new Set(categoryOptions.map(c => String(c.id)));
    const kept = categories.filter(id => offered.has(String(id)));
    if (kept.length !== categories.length) {
      set({ category: kept.length ? kept : null, page: '' });
    }
  }, [listing, categories, categoryOptions, categoriesSettled, set]);

  const followupSettled =
    !followupQ.isFetching && followupQ.data !== undefined;
  useEffect(() => {
    if (!followupOn || !followupSettled) return;
    if (!followup || followup === UNASSIGNED) return;
    if (!followupChoices.some(o => String(o.value) === String(followup))) {
      set({ followup: '', page: '' });
    }
  }, [followupOn, followup, followupChoices, followupSettled, set]);

  const scrollRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [transferring, setTransferring] = useState(null);
  const [assigningRole, setAssigningRole] = useState(null);
  const [changingFollowup, setChangingFollowup] = useState(null);
  // One filter's list is open at a time; opening another closes it.
  const [openFilter, setOpenFilter] = useState(null);
  const dropdown = key => ({
    open: openFilter === key,
    onOpenChange: isOpen => setOpenFilter(isOpen ? key : null),
  });
  useEffect(() => {
    if (!listing) setOpenFilter(null);
  }, [listing]);
  const [toggling, setToggling] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const statusUpdate = useMemberStatusUpdate();
  const nextStatus = toggling ? !isAttending(toggling.status) : false;

  // Under a picked Pradesh or Mandal the total is that row's own count; at the
  // top it is the whole scope's, which the list response carries.
  const scopeCount =
    selected.pradesh || selected.mandal
      ? level === 'sabha'
        ? memberCountOf(mandalQ.data, selected.mandal?.id)
        : level === 'mandal'
          ? memberCountOf(pradeshQ.data, selected.pradesh?.id)
          : null
      : levelQ?.memberCount ?? null;

  const levelItems = (levelQ?.data ?? []).filter(item => {
    if (!query) return true;
    if (searchMatches(levelName(item, level), query)) return true;
    // A group's name finds every entity in it.
    return groups.some(
      g =>
        searchMatches(g.name, query) &&
        (g.entityIds || []).some(id => Number(id) === Number(item.id)),
    );
  });

  const changeSearch = text => {
    set({ q: text, page: '' });
    setPage(1);
  };

  /**
   * Inside one Sabha the area filters show that Sabha, and the groups that
   * hold it, as what is chosen. Changing them there leaves the Sabha for the
   * list across Sabhas, narrowed to the new choice — the API would otherwise
   * AND the choice with the opened Sabha and filter nothing.
   */
  const changeArea = next => {
    if (sabhaId) {
      set({ area: next, selSabha: null, viewAll: true, page: '' });
    } else {
      set({ area: next, page: '' });
    }
    setPage(1);
  };

  const changeCategories = next => {
    set({ category: next?.length ? next : null, page: '' });
    setPage(1);
  };

  const changeTags = next => {
    set({ tag: next?.length ? next : null, page: '' });
    setPage(1);
  };

  const changeFollowup = next => {
    set({ followup: next, page: '' });
    setPage(1);
  };

  const openEntity = item => {
    set({
      ...CLEARED,
      area: null,
      viewAll: false,
      selPradesh: level === 'pradesh' ? item : selected.pradesh,
      selMandal:
        level === 'mandal' ? item : level === 'pradesh' ? null : selected.mandal,
      selSabha: level === 'sabha' ? item : null,
    });
    setPage(1);
  };

  /** Back up the tree: to the top, or keeping everything down to `keep`. */
  const goTo = keep => {
    set({
      ...CLEARED,
      area: null,
      viewAll: false,
      selPradesh: keep === null ? null : selected.pradesh,
      selMandal: keep === 'mandal' ? selected.mandal : null,
      selSabha: null,
    });
    setPage(1);
  };

  const viewAllMembers = () => {
    set({ ...CLEARED, viewAll: true });
    setPage(1);
  };

  const viewGroupMembers = group => {
    set({
      ...CLEARED,
      // The group and everything in it both show as chosen in the filters.
      area: {
        [`${level}GroupIds`]: [group.id],
        [`${level}Ids`]: group.items.map(item => item.id),
      },
      viewAll: true,
    });
    setPage(1);
  };

  const trail = [
    {
      label: title,
      onPress:
        viewAll || selected.pradesh || selected.mandal || selected.sabha
          ? () => goTo(null)
          : null,
    },
    selected.pradesh && {
      label: selected.pradesh.pradesh_name,
      onPress: () => goTo('pradesh'),
    },
    selected.mandal && {
      label: selected.mandal.mandal_name,
      onPress: () => goTo('mandal'),
    },
    selected.sabha && { label: selected.sabha.sabha_name, onPress: null },
    viewAll && { label: 'All Members', onPress: null },
  ].filter(Boolean);

  // Hardware back climbs one level before it leaves the screen.
  const stepBack = viewAll
    ? () => {
        set({ ...CLEARED, area: null, viewAll: false });
        setPage(1);
      }
    : selected.sabha
      ? () => goTo(selected.mandal ? 'mandal' : selected.pradesh ? 'pradesh' : null)
      : selected.mandal
        ? () => goTo(selected.pradesh ? 'pradesh' : null)
        : selected.pradesh
          ? () => goTo(null)
          : null;
  const stepBackRef = useRef(stepBack);
  stepBackRef.current = stepBack;
  const canStepBack = Boolean(stepBack);
  useEffect(() => {
    if (!canStepBack) return undefined;
    let sub;
    // A tick late: the last subscriber is asked first, and on the way back to
    // this screen AppNavigator re-subscribes in the same commit.
    const timer = setTimeout(() => {
      sub = BackHandler.addEventListener('hardwareBackPress', () => {
        stepBackRef.current?.();
        return true;
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      sub?.remove();
    };
  }, [canStepBack]);

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
      if (browsing) {
        await Promise.all([
          levelQ.refetch(),
          canReadHierarchy && groupsQ.refetch(),
          filtersQ.refetch(),
        ]);
      } else {
        await members.refetch();
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Held steady across renders, so a keystroke in the search box does not
  // redraw every card under it.
  const live = useRef({});
  live.current = { onOpenMember, onEditMember, openEntity };
  const openRow = useCallback(row => live.current.onOpenMember?.(row.id), []);
  const editRow = useCallback(row => live.current.onEditMember?.(row.id), []);
  const selectEntity = useCallback(item => live.current.openEntity(item), []);
  const askStatus = useCallback(row => {
    setStatusError(null);
    setToggling(row);
  }, []);

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

  const body =
    permissionsQ.isLoading || leaderships.isLoading ? (
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
        <PageHeader
          title={title}
          breadcrumbs={<Breadcrumbs trail={trail} />}
          actions={
            canCreate && onAddUser ? (
              <Button variant="primary" onPress={onAddUser}>
                <MaterialCommunityIcons name="plus" size={space(4)} />
                Add User
              </Button>
            ) : null
          }
        />

        <Card style={styles.filters}>
          {listing && (
            <View style={styles.selects}>
              <ScopeAreaFilter
                filters={filters}
                value={shownArea}
                onChange={changeArea}
                inline
                openKey={openFilter}
                onOpenKey={setOpenFilter}
              />
              {categoryOptions.length > 0 && (
                <MultiSelectFilter
                  label="Filter by Category"
                  allLabel="All Categories"
                  options={categoryOptions}
                  value={categories}
                  onChange={changeCategories}
                  inline
                  {...dropdown('category')}
                />
              )}
              <MultiSelectFilter
                label="Filter by Tag"
                allLabel="All Tags"
                options={tagOptions}
                value={tags}
                onChange={changeTags}
                inline
                {...dropdown('tag')}
              />
            </View>
          )}

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
              placeholder={
                browsing
                  ? `Search ${levelLabel.toLowerCase()} by name…`
                  : 'Search by name or mobile…'
              }
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

          {typed > 0 && typed < MIN_SEARCH ? (
            <Text style={styles.searchHint}>
              Type at least {MIN_SEARCH} characters to search.
            </Text>
          ) : null}

          {followupOn && (
            <SelectFilter
              label="Filter by follow-up person"
              value={followup}
              options={followupUnavailable ? [] : followupChoices}
              placeholder={
                followupBusy ? 'Loading follow-up…' : 'Follow-up unavailable'
              }
              disabled={followupUnavailable}
              onChange={changeFollowup}
              {...dropdown('followup')}
            />
          )}

          {browsing && scopeCount !== 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={viewAllMembers}
              hitSlop={8}
              style={styles.viewAll}
            >
              <MaterialCommunityIcons
                name="account-multiple-outline"
                size={space(4)}
                color={COLORS.accent}
              />
              <Text style={styles.viewAllText}>
                View All{' '}
                {scopeCount == null ? '' : `${formatNumber(scopeCount)} `}
                Members
              </Text>
            </Pressable>
          ) : null}

          {!browsing &&
          !members.isLoading &&
          !members.error &&
          typeof total === 'number' ? (
            <View style={styles.matchesRow}>
              <View style={styles.matches}>
                <Text style={styles.matchesText}>
                  {formatNumber(total)} {total === 1 ? 'match' : 'matches'}
                </Text>
              </View>
              {statusSplit && statusSplit.notAttending > 0 ? (
                <Text style={styles.split}>
                  {formatNumber(statusSplit.attending)} attending ·{' '}
                  {formatNumber(statusSplit.notAttending)} not attending
                </Text>
              ) : null}
            </View>
          ) : null}
        </Card>

        {browsing ? (
          <HierarchyGrid
            groups={groups}
            onViewGroup={
              filters?.[`show_${level}`] ? viewGroupMembers : null
            }
            items={levelItems}
            level={level}
            onSelect={selectEntity}
            loading={levelQ.isLoading}
            error={levelQ.error}
            onRetry={levelQ.refetch}
            emptyTitle={`No ${levelLabel} available`}
            emptyHint="Nothing in your scope at this level."
          />
        ) : (
          <>
            <MemberList
              rows={members.pageRows}
              loading={members.isLoading}
              busy={members.isFetching && !members.isLoading}
              error={members.error}
              onRetry={members.refetch}
              canChangeStatus={canChangeStatus}
              onStatusToggle={askStatus}
              statusBusy={statusUpdate.isPending}
              onOpen={onOpenMember ? openRow : null}
              onEdit={canEdit && onEditMember ? editRow : null}
              onQuickTransfer={canTransfer ? setTransferring : null}
              onAssignRole={canAssignRole ? setAssigningRole : null}
              onChangeFollowup={
                canChangeFollowup ? setChangingFollowup : null
              }
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
          </>
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
      {/* The offset is the status bar: the screen starts below it. */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={insets.top}
        style={styles.flex}
      >
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
      </KeyboardAvoidingView>

      <QuickTransferDialog
        member={transferring}
        onClose={() => setTransferring(null)}
      />
      <AssignRoleDialog
        member={assigningRole}
        onClose={() => setAssigningRole(null)}
      />
      <ChangeFollowupDialog
        member={changingFollowup}
        onClose={() => setChangingFollowup(null)}
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

  trail: {
    marginTop: space(2),
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(1.5),
  },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  crumbLink: { fontSize: TEXT.xs, color: COLORS.textMuted },
  crumbCurrent: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },

  filters: { gap: space(3) },
  selects: { gap: space(2) },
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
  searchHint: {
    marginTop: -space(1.5),
    fontSize: TEXT.xs,
    color: COLORS.textMuted,
  },
  viewAll: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
  },
  viewAllText: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.accent,
  },
  matchesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
  },
  split: { fontSize: TEXT.xs, color: COLORS.textMuted },
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
