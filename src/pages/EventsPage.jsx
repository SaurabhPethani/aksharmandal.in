import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import AppHeader from '../components/AppHeader';
import ScrollViewWithTop from '../components/ScrollToTop';
import SiteFooter from '../components/SiteFooter';
import { Text } from '../components/Typography';
import { Tabs } from '../components/Navigation';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../components/ui';
import EventCard from '../components/events/EventCard';
import EventFormDialog from '../components/events/EventFormDialog';
import EventRegisterDialog from '../components/events/EventRegisterDialog';
import EventResultsDialog from '../components/events/EventResultsDialog';
import EventRegistrationData from '../components/events/EventRegistrationData';
import RegistrationsByEvent from '../components/events/RegistrationsByEvent';
import EditRegistrationDialog from '../components/events/EditRegistrationDialog';
import { useToast } from '../hooks/core';
import { useMyPermissions } from '../hooks/useMyPermissions';
import { useCategories, useMe } from '../hooks/useLookups';
import {
  useEventMutations,
  useEvents,
  useMyRegistrations,
} from '../hooks/useEvents';
import { ACTIONS, MODULES } from '../constants/permissions';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../constants/theme';

/**
 * Events — the mobile port of the web's EventsPage.jsx. Three tabs, each
 * gated by its own EVENTS action:
 *
 *   Events tab      EVENTS:READ      every event, filterable by status
 *   Registered tab  EVENTS:REGISTER  the members this caller has registered
 *   Registered Data scope-gated      full registrant data + Excel, own band
 *
 *   EVENTS:CREATE   creating an event, and editing / deactivating one
 *
 * The four EVENTS actions are INDEPENDENT server-side — see
 * services/eventsService.js. Nimit Sevak and Yuvak hold REGISTER alone, so
 * `GET /events` 403s for them; the frontend must not fetch the event list
 * before checking READ.
 *
 * The grants are the caller's own, from hooks/useMyPermissions. Nothing is
 * drawn until they load, so no role is shown a tab or button it does not hold.
 */
const FILTERS = [
  { key: 'all', label: 'All', status: undefined },
  { key: 'active', label: 'Active', status: 'active' },
  { key: 'inactive', label: 'Inactive', status: 'inactive' },
];

export default function EventsPage({
  onBack,
  onMenu,
  onHelp,
  onNotifications,
  onOpenPrivacy,
  onOpenTerms,
  onOpenDeleteAccount,
  onProfile,
}) {
  const permissionsQ = useMyPermissions();
  const permissions = permissionsQ.data;
  const toast = useToast();

  const allowed = (moduleName, actionName) =>
    Boolean(permissions?.can(moduleName, actionName));

  const canRead = allowed(MODULES.EVENTS, ACTIONS.READ);
  // One grant for create AND update — see EventFormDialog / the web note.
  const canWrite = allowed(MODULES.EVENTS, ACTIONS.CREATE);
  // REGISTER **and** READ, by explicit request — registering is something you
  // do to an event you can already see, so no READ means no register.
  const canRegister = canRead && allowed(MODULES.EVENTS, ACTIONS.REGISTER);
  // Registered Data is scope-gated, NOT permission-gated: anyone with a band
  // above 'self' sees registrant data within their own scope.
  const scopeLevel = permissions?.scopeLevel;
  const canSeeData = Boolean(scopeLevel) && scopeLevel !== 'self';

  // Says only what this caller can do here.
  const subtitle = canWrite
    ? 'Create events, register members, and keep track of registrations.'
    : canSeeData
      ? 'Discover events, register, and keep track of your registrations.'
      : canRegister
        ? 'Discover events and register.'
        : 'Discover upcoming events.';

  // const TABS = [
  //   { key: 'events', label: 'Events', show: canRead },
  //   { key: 'registered', label: 'Registered', show: canRegister },
  //   { key: 'data', label: 'Registered Data', show: canSeeData },
  // ].filter(t => t.show);

  // const [activeTab, setActiveTab] = useState(TABS[0]?.key);
  // const tab = TABS.find(t => t.key === activeTab) ?? TABS[0];

  const TABS = useMemo(
    () =>
      [
        { key: 'events', label: 'Events', show: canRead },
        { key: 'registered', label: 'Registered', show: canRegister },
        { key: 'data', label: 'Registered Data', show: canSeeData },
      ].filter(t => t.show),
    [canRead, canRegister, canSeeData],
  );

  const [activeTab, setActiveTab] = useState(TABS[0]?.key);

  useEffect(() => {
    if (!TABS.some(t => t.key === activeTab)) {
      setActiveTab(TABS[0]?.key);
    }
  }, [TABS, activeTab]);

  const tab = TABS.find(t => t.key === activeTab) ?? TABS[0];

  const [filter, setFilter] = useState('all');
  const activeFilter = FILTERS.find(f => f.key === filter) ?? FILTERS[0];

  // Each tab fetches only while it is the one on screen.
  const eventsQ = useEvents(
    canWrite ? activeFilter.status : 'active',
    canRead && tab?.key === 'events',
  );
  const registrationsQ = useMyRegistrations(
    canRegister && tab?.key === 'registered',
  );
  // Own record, for pre-filling self-registration. Fetched only when usable.
  const meQ = useMe(canRegister);

  const { saveEvent, setStatus, register, updateRegistration } =
    useEventMutations();

  const [dialog, setDialog] = useState(null);
  /** The event whose popup is open — set by tapping its card. */
  const [openEvent, setOpenEvent] = useState(null);
  /** The event whose poll-results dialog is open — organiser only. */
  const [resultsEvent, setResultsEvent] = useState(null);
  const [editingRegistration, setEditingRegistration] = useState(null);

  /**
   * Categories have exactly two readers: the event CARDS (turning
   * `user_category` ids into names) and the event FORM (audience picker). Fetched
   * for those two and nothing else.
   */
  const categoriesQ = useCategories(
    canRead && (tab?.key === 'events' || Boolean(dialog)),
  );
  const categories = useMemo(
    () => (Array.isArray(categoriesQ.data) ? categoriesQ.data : []),
    [categoriesQ.data],
  );
  const categoryNames = useMemo(
    () => new Map(categories.map(c => [c.id, c.name])),
    [categories],
  );

  const events = useMemo(
    () =>
      (Array.isArray(eventsQ.data) ? eventsQ.data : [])
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [eventsQ.data],
  );
  const registrations = Array.isArray(registrationsQ.data)
    ? registrationsQ.data
    : [];

  // Android's back button goes where the breadcrumb does.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack?.();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const openCreate = () => {
    saveEvent.reset();
    setDialog({ event: null });
  };
  const openEdit = event => {
    saveEvent.reset();
    setDialog({ event });
  };

  const submitEvent = payload =>
    saveEvent.mutate(
      { id: dialog.event?.id ?? null, payload },
      {
        onSuccess: res => {
          toast.success(res?.detail ?? 'Event saved.');
          setDialog(null);
        },
        onError: err =>
          toast.error(err?.message ?? 'Could not save the event.'),
      },
    );

  const toggleStatus = event =>
    setStatus.mutate(
      { id: event.id, status: event.status === false },
      {
        onSuccess: res => toast.success(res?.detail ?? 'Event updated.'),
        onError: err =>
          toast.error(err?.message ?? 'Could not update the event.'),
      },
    );

  const saveRegistration = payload =>
    updateRegistration.mutate(
      { id: editingRegistration.id, payload },
      {
        onSuccess: res => {
          toast.success(res?.detail ?? 'Registration updated.');
          setEditingRegistration(null);
        },
        onError: err =>
          toast.error(err?.message ?? 'Could not save the registration.'),
      },
    );

  /**
   * Cancelling a registration is a status flip, not a delete — the endpoint has
   * no delete, and the row stays visible as Denied so it is clear what happened.
   */
  const cancelRegistration = row =>
    updateRegistration.mutate(
      { id: row.id, payload: { status: false } },
      {
        onSuccess: res =>
          toast.success(res?.detail ?? 'Registration cancelled.'),
        onError: err =>
          toast.error(err?.message ?? 'Could not cancel the registration.'),
      },
    );

  /** The mirror of `cancelRegistration` — flips the same status back. */
  const restoreRegistration = row =>
    updateRegistration.mutate(
      { id: row.id, payload: { status: true } },
      {
        onSuccess: res =>
          toast.success(res?.detail ?? 'Registration confirmed again.'),
        onError: err =>
          toast.error(err?.message ?? 'Could not confirm the registration.'),
      },
    );

  const submitRegistration = items =>
    register.mutate(items, {
      onSuccess: res => {
        toast.success(res?.detail ?? 'Registration saved.');
        setOpenEvent(null);
      },
      onError: err =>
        toast.error(err?.message ?? 'Could not save the registration.'),
    });

  const header = (
    <AppHeader
      onMenu={onMenu}
      onHelp={onHelp}
      onNotifications={onNotifications}
      onProfile={onProfile}
      onBack={onBack}
      // breadcrumbs={['Dashboard', 'Events']}
    />
  );

  if (!permissions) {
    return (
      <View style={styles.safe}>
        {header}
        <View style={styles.state}>
          {permissionsQ.error ? (
            <ErrorState
              error={permissionsQ.error}
              onRetry={permissionsQ.refetch}
              title="Could not load your access"
            />
          ) : (
            <Skeleton style={styles.tabSkeleton} />
          )}
        </View>
      </View>
    );
  }

  if (!TABS.length) {
    return (
      <View style={styles.safe}>
        {header}
        <View style={styles.state}>
          <EmptyState
            title="No access"
            hint="Viewing events requires the Events · Read permission."
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      {header}
      <ScrollViewWithTop
        style={styles.flex}
        contentContainerStyle={styles.content}
      >
        <PageHeader
          title="Events"
          subtitle={subtitle}
          actions={
            canWrite ? (
              <Button variant="accent" onPress={openCreate}>
                <MaterialCommunityIcons name="plus" size={space(4)} />
                Create Event
              </Button>
            ) : null
          }
        />

        {TABS.length > 1 ? (
          <Tabs
            tabs={TABS.map(({ key, label }) => ({
              value: key,
              label,
            }))}
            value={tab?.key}
            onChange={setActiveTab}
            variant="solid"
            style={styles.tabs}
          />
        ) : null}

        {tab?.key === 'events' ? (
          <>
            {/* Status filter for organisers only — `GET /events` returns
                inactive events only to a caller with EVENTS:CREATE. */}
            {canWrite ? (
              <View style={styles.filters}>
                {FILTERS.map(f => (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    style={[
                      styles.filter,
                      filter === f.key && styles.filterActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        filter === f.key && styles.filterTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {eventsQ.isLoading ? (
              <View style={styles.skeletons}>
                {[0, 1, 2].map(i => (
                  <Skeleton key={i} style={styles.cardSkeleton} />
                ))}
              </View>
            ) : eventsQ.error ? (
              <ErrorState
                error={eventsQ.error}
                onRetry={eventsQ.refetch}
                title="Could not load events"
              />
            ) : events.length === 0 ? (
              <Card>
                <EmptyState
                  title={
                    filter === 'all' ? 'No events yet' : `No ${filter} events`
                  }
                  hint={
                    filter === 'all'
                      ? 'Nothing has been created.'
                      : 'Try another filter.'
                  }
                />
              </Card>
            ) : (
              <View style={styles.cards}>
                {events.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    categoryNames={categoryNames}
                    canUpdate={canWrite}
                    busy={setStatus.isPending || saveEvent.isPending}
                    // No REGISTER grant, no tap: the popup only registers, so
                    // opening one with nothing to do would be worse than a card
                    // that stays a card.
                    onOpen={
                      canRegister
                        ? e => {
                            register.reset();
                            setOpenEvent(e);
                          }
                        : null
                    }
                    onEdit={openEdit}
                    onToggleStatus={toggleStatus}
                    onResults={canWrite ? setResultsEvent : null}
                  />
                ))}
              </View>
            )}
          </>
        ) : null}

        {tab?.key === 'registered' ? (
          registrationsQ.isLoading ? (
            <Skeleton style={styles.tabSkeleton} />
          ) : registrationsQ.error ? (
            <ErrorState
              error={registrationsQ.error}
              onRetry={registrationsQ.refetch}
              title="Could not load your registrations"
            />
          ) : registrations.length === 0 ? (
            <Card>
              <EmptyState
                title="No registrations yet"
                hint="Members you register for an event will appear here."
              />
            </Card>
          ) : (
            <RegistrationsByEvent
              rows={registrations}
              canEdit={canRegister}
              busy={updateRegistration.isPending}
              onEdit={row => {
                updateRegistration.reset();
                setEditingRegistration(row);
              }}
              onCancel={cancelRegistration}
              onRestore={restoreRegistration}
            />
          )
        ) : null}

        {tab?.key === 'data' ? (
          <EventRegistrationData enabled={tab.key === 'data'} />
        ) : null}

        <View style={styles.footerBleed}>
          <SiteFooter
            onPrivacy={onOpenPrivacy}
            onTerms={onOpenTerms}
            onDeleteAccount={onOpenDeleteAccount}
          />
        </View>
      </ScrollViewWithTop>

      {dialog ? (
        // Keyed on the event so the form seeds from the row being edited rather
        // than from whichever one opened it first.
        <EventFormDialog
          key={dialog.event?.id ?? 'new-event'}
          event={dialog.event}
          categories={categories}
          isOpen
          busy={saveEvent.isPending}
          error={saveEvent.error?.message ?? null}
          onClose={() => {
            if (!saveEvent.isPending) setDialog(null);
          }}
          onSubmit={submitEvent}
        />
      ) : null}

      {openEvent ? (
        // Keyed on the event so the member rows and the chosen tab reset
        // between one event's popup and the next.
        <EventRegisterDialog
          key={openEvent.id}
          event={openEvent}
          me={meQ.data}
          canRegister={canRegister}
          isOpen
          busy={register.isPending}
          error={register.error?.message ?? null}
          onResetError={register.reset}
          onClose={() => {
            if (!register.isPending) setOpenEvent(null);
          }}
          onSubmit={submitRegistration}
        />
      ) : null}

      {editingRegistration ? (
        <EditRegistrationDialog
          key={editingRegistration.id}
          registration={editingRegistration}
          isOpen
          busy={updateRegistration.isPending}
          error={updateRegistration.error?.message ?? null}
          onClose={() => {
            if (!updateRegistration.isPending) setEditingRegistration(null);
          }}
          onSubmit={saveRegistration}
        />
      ) : null}

      {resultsEvent ? (
        <EventResultsDialog
          key={resultsEvent.id}
          event={resultsEvent}
          isOpen
          onClose={() => setResultsEvent(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: space(4.5),
    paddingBottom: 0,
    gap: space(5),
  },
  state: { flex: 1, padding: space(4.5) },
  footerBleed: {
    marginTop: 'auto',
    marginHorizontal: -space(4.5),
    paddingTop: space(3.5),
  },
  tabs: { marginTop: -space(1) },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  filter: {
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    borderRadius: RADII.full,
    paddingHorizontal: space(3.5),
    paddingVertical: space(1.5),
    backgroundColor: COLORS.surface,
  },
  filterActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.primary,
    fontWeight: WEIGHT.semibold,
    fontSize: TEXT.sm,
  },
  filterTextActive: { color: COLORS.white },
  skeletons: { gap: space(3) },
  cardSkeleton: { height: space(56), width: '100%' },
  tabSkeleton: { height: space(40), width: '100%' },
  cards: { gap: space(4) },
});
