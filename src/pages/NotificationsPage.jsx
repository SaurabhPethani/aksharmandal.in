import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import AppHeader from '../components/AppHeader';
import SiteFooter from '../components/SiteFooter';
import { Text } from '../components/Typography';
import { dashboardService } from '../services/dashboardService';
import {
  fromInfoRequests,
  fromMyTransferRequests,
  fromPendingTransfers,
  isUnread,
  markAllRead,
  readWatermark,
  relativeTime,
  sortByNewest,
} from '../utils/notifications';

const C = {
  navy: '#003158',
  muted: '#5C7A96',
  bg: '#F0F4F8',
  surface: '#FFF',
  border: '#DDE9F3',
  accent: '#FF862A',
};

export default function NotificationsPage({
  onBack,
  onMenu,
  onHelp,
  onOpenPrivacy,
  onOpenTerms,
  onOpenDeleteAccount,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [watermark, setWatermark] = useState(readWatermark);
  const [error, setError] = useState('');
  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    const results = await Promise.allSettled([
      dashboardService.notificationPendingTransfers(),
      dashboardService.notificationMyTransfers(),
      dashboardService.notificationInfoRequests({ status: 'pending' }),
    ]);
    const rows = [];
    const read = result =>
      Array.isArray(result) ? result : result?.items || [];
    const failed = results.filter(
      result => result.status === 'rejected',
    ).length;
    setError(
      failed
        ? `${failed} notification source${failed === 1 ? '' : 's'} could not be loaded. Pull to retry.`
        : '',
    );
    if (results[0].status === 'fulfilled')
      rows.push(...fromPendingTransfers(read(results[0].value)));
    if (results[1].status === 'fulfilled')
      rows.push(...fromMyTransferRequests(read(results[1].value)));
    if (results[2].status === 'fulfilled')
      rows.push(...fromInfoRequests(read(results[2].value)));
    setItems(sortByNewest(rows));
    setLoading(false);
    setRefreshing(false);
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <View style={styles.safe}>
      <AppHeader
        onBack={onBack}
        onMenu={onMenu}
        onHelp={onHelp}
        breadcrumbs={['Dashboard', 'Notifications']}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
          />
        }
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>Notifications</Text>
          {items.some(item => isUnread(item, watermark)) ? (
            <Text
              accessibilityRole="button"
              onPress={() => setWatermark(markAllRead())}
              style={styles.markRead}
            >
              Mark all read
            </Text>
          ) : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? (
          <ActivityIndicator color={C.navy} size="large" />
        ) : items.length ? (
          items.map(item => (
            <View
              key={item.id}
              style={[
                styles.item,
                isUnread(item, watermark) && styles.unreadItem,
              ]}
            >
              <View style={styles.icon}>
                <MaterialCommunityIcons
                  name={
                    item.kind === 'info' ? 'account-edit' : 'account-switch'
                  }
                  size={20}
                  color={C.accent}
                />
              </View>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.detail}>
                  {item.detail || 'Notification'}{' '}
                  {relativeTime(item.at) ? `· ${relativeTime(item.at)}` : ''}
                </Text>
              </View>
              {isUnread(item, watermark) ? (
                <View style={styles.unreadDot} />
              ) : null}
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>You’re all caught up</Text>
            <Text style={styles.detail}>No new notifications.</Text>
          </View>
        )}
        <View style={styles.footerBleed}>
          <SiteFooter
            onPrivacy={onOpenPrivacy}
            onTerms={onOpenTerms}
            onDeleteAccount={onOpenDeleteAccount}
          />
        </View>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 18, gap: 10 },
  footerBleed: { marginTop: 'auto', marginHorizontal: -18, paddingTop: 14 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: C.navy, fontSize: 26, fontWeight: '800', marginBottom: 4 },
  markRead: { color: C.accent, fontSize: 13, fontWeight: '700' },
  error: {
    color: '#A33A28',
    backgroundColor: '#FFF0EC',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
  },
  item: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
  },
  unreadItem: { borderColor: C.accent },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFF0E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: C.accent, fontSize: 22, fontWeight: '800' },
  itemBody: { flex: 1, gap: 4 },
  itemTitle: { color: C.navy, fontWeight: '700' },
  detail: { color: C.muted, fontSize: 13 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
    alignSelf: 'center',
  },
  empty: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 28,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { color: C.navy, fontWeight: '800', fontSize: 16 },
});
