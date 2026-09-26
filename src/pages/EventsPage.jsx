import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons/static';
import AppHeader from '../components/AppHeader';
import ScrollViewWithTop from '../components/ScrollToTop';
import SiteFooter from '../components/SiteFooter';
import { Text } from '../components/Typography';
import { dashboardService } from '../services/dashboardService';

const C = {
  navy: '#003158',
  muted: '#5C7A96',
  faint: '#7894AA',
  background: '#F0F4F8',
  surface: '#FFFFFF',
  border: '#DDE9F3',
  accent: '#FF862A',
  green: '#15803D',
  red: '#B42318',
};

const FILTERS = [
  { key: 'all', label: 'All', status: undefined },
  { key: 'active', label: 'Active', status: 'active' },
  { key: 'inactive', label: 'Inactive', status: 'inactive' },
];

function dateLabel(value) {
  if (!value) return 'Date not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
}

function EventCard({ event, canRegister }) {
  const active = event.status !== false && event.status !== 'inactive';
  return (
    <Pressable
      disabled={!canRegister}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole={canRegister ? 'button' : undefined}
      accessibilityLabel={
        canRegister ? `Register for ${event.title || 'event'}` : undefined
      }
    >
      <View style={styles.cardBanner}>
        <Icon name="calendar-star" size={30} color={C.accent} />
        <View
          style={[
            styles.status,
            active ? styles.activeStatus : styles.inactiveStatus,
          ]}
        >
          <Text style={styles.statusText}>
            {active ? 'Active' : 'Inactive'}
          </Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.eventTitle}>{event.title || 'Untitled event'}</Text>
        {event.category ? (
          <Text style={styles.category}>{event.category}</Text>
        ) : null}
        <View style={styles.eventLine}>
          <Icon name="calendar-outline" size={16} color={C.muted} />
          <Text style={styles.meta}>
            {dateLabel(event.date)}
            {event.time ? ` · ${event.time}` : ''}
          </Text>
        </View>
        {event.location ? (
          <View style={styles.eventLine}>
            <Icon name="map-marker-outline" size={16} color={C.muted} />
            <Text style={styles.meta}>{event.location}</Text>
          </View>
        ) : null}
        {event.description ? (
          <Text style={styles.description} numberOfLines={4}>
            {event.description}
          </Text>
        ) : null}
        {event.total_count != null ||
        event.confirmed_count != null ||
        event.denied_count != null ? (
          <View style={styles.counts}>
            <Text style={styles.count}>Total {event.total_count ?? 0}</Text>
            <Text style={styles.count}>
              Confirmed {event.confirmed_count ?? 0}
            </Text>
            <Text style={styles.count}>Denied {event.denied_count ?? 0}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

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
  // Mobile currently has no PermissionProvider. Keep the read-only event
  // surface available, while hiding web-only organizer and registration
  // controls until their native flows are implemented.
  const canWrite = false;
  const canRegister = true;
  const tabs = [
    { key: 'events', label: 'Events' },
    { key: 'registered', label: 'Registered' },
    { key: 'data', label: 'Registered Data' },
  ];
  const [tab, setTab] = useState(tabs[0]?.key || 'events');
  const [filter, setFilter] = useState('all');
  const [events, setEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [dataEvents, setDataEvents] = useState([]);
  const [dataRows, setDataRows] = useState([]);
  const [selectedDataEvent, setSelectedDataEvent] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const activeFilter = FILTERS.find(item => item.key === filter) || FILTERS[0];
  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      if (tab === 'registered') {
        const result = await dashboardService.eventRegistrations();
        setRegistrations(Array.isArray(result) ? result : result?.items || []);
      } else if (tab === 'data') {
        const result = await dashboardService.eventDataEvents();
        const next = Array.isArray(result) ? result : result?.items || [];
        setDataEvents(next);
        if (next[0]?.id) {
          setSelectedDataEvent(String(next[0].id));
          const rows = await dashboardService.eventDataRegistrations(
            next[0].id,
          );
          setDataRows(Array.isArray(rows) ? rows : rows?.items || []);
        }
      } else {
        const result = await dashboardService.events(
          canWrite ? activeFilter.status : 'active',
        );
        setEvents(Array.isArray(result) ? result : result?.items || []);
      }
    } catch (caught) {
      setError(
        caught?.message ||
          `Could not load ${
            tab === 'registered'
              ? 'your registrations'
              : tab === 'data'
                ? 'registered data'
                : 'events'
          }.`,
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // The request intentionally reruns when the selected tab or filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filter, canWrite]);

  const sortedEvents = useMemo(
    () => events.slice().sort((a, b) => new Date(a.date) - new Date(b.date)),
    [events],
  );

  return (
    <View style={styles.safe}>
      <AppHeader
        onMenu={onMenu}
        onHelp={onHelp}
        onNotifications={onNotifications}
        onProfile={onProfile}
        onBack={onBack}
        breadcrumbs={['Dashboard', 'Events']}
      />
      <ScrollViewWithTop
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={C.navy}
          />
        }
      >
        <Text style={styles.title}>Events</Text>
        <Text style={styles.subtitle}>
          Discover events, register, and keep track of your registrations.
        </Text>
        {tabs.length > 1 ? (
          <View style={styles.tabs}>
            {tabs.map(item => (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={[styles.tab, tab === item.key && styles.selectedTab]}
              >
                <Text
                  style={[
                    styles.tabText,
                    tab === item.key && styles.selectedTabText,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {tab === 'events' && canWrite ? (
          <View style={styles.filters}>
            {FILTERS.map(item => (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={[
                  styles.filter,
                  filter === item.key && styles.selectedFilter,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === item.key && styles.selectedFilterText,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {loading ? (
          <ActivityIndicator size="large" color={C.navy} />
        ) : error ? (
          <View style={styles.state}>
            <Icon name="alert-circle-outline" size={34} color={C.red} />
            <Text style={styles.stateText}>{error}</Text>
            <Pressable onPress={() => load()}>
              <Text style={styles.retry}>Retry</Text>
            </Pressable>
          </View>
        ) : tab === 'data' ? (
          dataEvents.length ? (
            <>
              <View style={styles.dataEventList}>
                {dataEvents.map(event => (
                  <Pressable
                    key={event.id}
                    onPress={async () => {
                      setSelectedDataEvent(String(event.id));
                      const result =
                        await dashboardService.eventDataRegistrations(event.id);
                      setDataRows(
                        Array.isArray(result) ? result : result?.items || [],
                      );
                    }}
                    style={[
                      styles.dataEvent,
                      selectedDataEvent === String(event.id) &&
                        styles.dataEventSelected,
                    ]}
                  >
                    <Text style={styles.dataEventText}>
                      {event.title || event.name || 'Event'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {dataRows.length ? (
                dataRows.map((row, index) => (
                  <View key={row.id || index} style={styles.registration}>
                    <Text style={styles.eventTitle}>
                      {row.name ||
                        row.user_name ||
                        row.mobile_number ||
                        'Registrant'}
                    </Text>
                    <Text style={styles.meta}>
                      {row.mobile_number ||
                        row.gender ||
                        row.status ||
                        'Registration'}
                    </Text>
                  </View>
                ))
              ) : (
                <Empty
                  title="No registrations yet"
                  hint="This event has no registered members."
                />
              )}
            </>
          ) : (
            <Empty
              title="No events available"
              hint="There are no events with registration data."
            />
          )
        ) : tab === 'registered' ? (
          registrations.length ? (
            registrations.map(row => (
              <View
                key={row.id || `${row.event_id}-${row.mobile_number}`}
                style={styles.registration}
              >
                <Text style={styles.eventTitle}>
                  {row.event_title || row.event_name || 'Event registration'}
                </Text>
                <Text style={styles.meta}>
                  {row.name ||
                    row.user_name ||
                    row.mobile_number ||
                    'Registration'}
                </Text>
                <Text style={styles.meta}>
                  {row.status === false ? 'Denied' : 'Confirmed'}
                </Text>
              </View>
            ))
          ) : (
            <Empty
              title="No registrations yet"
              hint="Members you register for an event will appear here."
            />
          )
        ) : sortedEvents.length ? (
          sortedEvents.map(event => (
            <EventCard
              key={event.id || event.title}
              event={event}
              canRegister={canRegister}
            />
          ))
        ) : (
          <Empty
            title={filter === 'all' ? 'No events yet' : `No ${filter} events`}
            hint={
              filter === 'all'
                ? 'Nothing has been created.'
                : 'Try another filter.'
            }
          />
        )}
        <View style={styles.footerBleed}>
          <SiteFooter
            onPrivacy={onOpenPrivacy}
            onTerms={onOpenTerms}
            onDeleteAccount={onOpenDeleteAccount}
          />
        </View>
      </ScrollViewWithTop>
    </View>
  );
}

function Empty({ title, hint }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.stateText}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 18, gap: 12 },
  footerBleed: { marginTop: 'auto', marginHorizontal: -18, paddingTop: 14 },
  title: { color: C.navy, fontSize: 26, fontWeight: '800' },
  subtitle: { color: C.muted, lineHeight: 20 },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  selectedTab: {
    backgroundColor: C.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { color: C.muted, fontWeight: '600' },
  selectedTabText: { color: C.navy, fontWeight: '800' },
  filters: { flexDirection: 'row', gap: 8 },
  filter: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: C.surface,
  },
  selectedFilter: { borderColor: C.navy, backgroundColor: C.navy },
  filterText: { color: C.navy, fontWeight: '600', fontSize: 13 },
  selectedFilterText: { color: C.surface },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.8 },
  cardBanner: {
    height: 86,
    backgroundColor: '#E6EEF5',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  status: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  activeStatus: { backgroundColor: '#DCFCE7' },
  inactiveStatus: { backgroundColor: '#FEE4E2' },
  statusText: { fontSize: 11, fontWeight: '700', color: C.green },
  cardBody: { padding: 15, gap: 7 },
  eventTitle: { color: C.navy, fontSize: 17, fontWeight: '800' },
  category: { color: C.accent, fontSize: 12, fontWeight: '700' },
  eventLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { color: C.muted, fontSize: 13 },
  description: { color: C.muted, lineHeight: 19, marginTop: 2 },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
    marginTop: 4,
  },
  count: { color: C.muted, fontSize: 11, fontWeight: '600' },
  registration: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    gap: 5,
  },
  state: { alignItems: 'center', gap: 10, padding: 28 },
  stateText: { color: C.muted, textAlign: 'center' },
  retry: { color: C.navy, fontWeight: '700' },
  empty: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    alignItems: 'center',
    padding: 30,
    gap: 8,
  },
  emptyTitle: { color: C.navy, fontWeight: '800', fontSize: 16 },
});
