import React, { useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import AppHeader from '../components/AppHeader';
import ScrollViewWithTop from '../components/ScrollToTop';
import SiteFooter from '../components/SiteFooter';
import { Text } from '../components/Typography';
import { useNotifications } from '../hooks/useNotifications';
import {
  groupByDay,
  relativeTime,
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
  onProfile,
}) {
  const {
    items,
    unreadCount,
    isLoading,
    error,
    refetch,
    markAllRead: markNotificationsRead,
    canViewAll,
  } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const groups = groupByDay(items);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.safe}>
      <AppHeader
        onBack={onBack}
        onMenu={onMenu}
        onHelp={onHelp}
        onProfile={onProfile}
        breadcrumbs={['Dashboard', 'Notifications']}
      />
      <ScrollViewWithTop
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
          />
        }
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 ? (
            <Text
              accessibilityRole="button"
              onPress={markNotificationsRead}
              style={styles.markRead}
            >
              Mark all read
            </Text>
          ) : null}
        </View>
        <Text style={styles.subtitle}>
          Transfer approvals, information-change requests and updates on your requests
        </Text>
        {!canViewAll ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Notifications unavailable</Text>
            <Text style={styles.detail}>
              Your role does not grant access to transfer or information-change notifications.
            </Text>
          </View>
        ) : isLoading ? (
          <ActivityIndicator color={C.navy} size="large" />
        ) : error && !items.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Could not load notifications</Text>
            <Text style={styles.detail}>{error.message || String(error)}</Text>
          </View>
        ) : items.length ? (
          groups.map(group => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              <View style={styles.groupCard}>
                {group.items.map(item => (
                  <View
                    key={item.id}
                    style={[
                      styles.item,
                      item.unread && styles.unreadItem,
                    ]}
                  >
                    <View style={styles.icon}>
                      <MaterialCommunityIcons
                        name={
                          item.kind === 'info'
                            ? 'file-edit-outline'
                            : item.kind === 'transfer-mine'
                              ? 'send'
                              : 'arrow-right'
                        }
                        size={20}
                        color={C.navy}
                      />
                    </View>
                    <View style={styles.itemBody}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {item.detail ? (
                        <Text style={styles.detail}>{item.detail}</Text>
                      ) : null}
                      {item.at ? (
                        <Text style={styles.when}>{relativeTime(item.at)}</Text>
                      ) : null}
                    </View>
                    {item.unread ? <View style={styles.unreadDot} /> : null}
                  </View>
                ))}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>You’re all caught up</Text>
            <Text style={styles.detail}>
              Transfer approvals and information-change requests will appear here.
            </Text>
          </View>
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
  subtitle: { color: C.muted, fontSize: 13, lineHeight: 18 },
  markRead: { color: C.accent, fontSize: 13, fontWeight: '700' },
  error: {
    color: '#A33A28',
    backgroundColor: '#FFF0EC',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
  },
  group: { gap: 6 },
  groupLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  groupCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  unreadItem: { backgroundColor: '#FFF8F2' },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E6EEF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: C.accent, fontSize: 22, fontWeight: '800' },
  itemBody: { flex: 1, gap: 4 },
  itemTitle: { color: C.navy, fontWeight: '700' },
  detail: { color: C.muted, fontSize: 13 },
  when: { color: '#7894AA', fontSize: 12, marginTop: 4 },
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
