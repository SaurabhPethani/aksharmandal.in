import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import AppHeader from '../components/AppHeader';
import ScrollViewWithTop from '../components/ScrollToTop';
import SiteFooter from '../components/SiteFooter';
import { Text, TextInput } from '../components/Typography';
import { FONT_DISPLAY } from '../constants/typography';
import { useNotLoggedIn } from '../hooks/useNotLoggedIn';
import { hasMobile, telUrl } from '../utils/contact';
import { NIMIT_SEVAK_LABEL, ambrishLabel } from '../utils/memberFlags';
import { searchMatches } from '../utils/options';
import { MemberStatsDialog } from './DashboardPage';

const COLORS = {
  navy: '#003158',
  muted: '#5C7A96',
  background: '#F0F4F8',
  surface: '#FFFFFF',
  border: '#DDE9F3',
  accent: '#FF862A',
  green: '#15803D',
  red: '#B91C1C',
};

export default function NotLoggedInPage({
  onBack,
  onOpenMenu,
  onOpenHelp,
  onNotifications,
  onOpenPrivacy,
  onOpenTerms,
  onOpenDeleteAccount,
  onProfile,
}) {
  const query = useNotLoggedIn(true);
  const members = useMemo(
    () =>
      Array.isArray(query.data)
        ? query.data
        : query.data?.items || query.data?.users || [],
    [query.data],
  );
  const [statsUserId, setStatsUserId] = useState(null);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [loadingMore, setLoadingMore] = useState(false);
  const showSearch = members.length > 25;
  const searchText = showSearch ? search.trim() : '';
  const visibleMembers = searchText
    ? members.filter(member => searchMatches(member.full_name, searchText))
    : members;
  const pagedMembers = visibleMembers.slice(0, pageSize);

  useEffect(() => {
    setPageSize(25);
  }, [search]);

  const groups = useMemo(() => {
    const map = new Map();
    pagedMembers.forEach(member => {
      const key = member.sabha_id ?? member.sabha_name ?? 'unknown';
      if (!map.has(key)) {
        map.set(key, { name: member.sabha_name || 'Sabha', members: [] });
      }
      map.get(key).members.push(member);
    });
    return [...map.values()];
  }, [pagedMembers]);

  const renderMemberTags = member => {
    const tags = [];
    if (member.role_name) tags.push({ key: 'role', text: member.role_name, style: styles.roleTag });
    if (member.is_ambrish) {
      tags.push({
        key: 'ambrish',
        text: ambrishLabel(member.gender),
        style: styles.flagTag,
      });
    }
    if (member.is_nimit_sevak) {
      tags.push({ key: 'nimit', text: NIMIT_SEVAK_LABEL, style: styles.flagTag });
    }
    if (!tags.length) return null;

    return (
      <View style={styles.tagsRow}>
        {tags.map(tag => (
          <View key={tag.key} style={[styles.tag, tag.style]}>
            <Text style={[styles.tagText, { color: tag.key === 'role' ? COLORS.navy : COLORS.accent }]}>{tag.text}</Text>
          </View>
        ))}
      </View>
    );
  };

  const openContact = url => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Unable to open contact', 'Please try again.');
    });
  };

  return (
    <View style={styles.safe}>
      <AppHeader
        onMenu={onOpenMenu}
        onHelp={onOpenHelp}
        onNotifications={onNotifications}
        onProfile={onProfile}
        onBack={onBack}
        breadcrumbs={['Dashboard', 'Not Login']}
      />
      <ScrollViewWithTop style={styles.flex1} contentContainerStyle={styles.scroll}>
        <View style={styles.pageHeader}>
          {/* <Pressable
            onPress={onBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to dashboard"
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={20}
              color={COLORS.navy}
            />
            <Text style={styles.backText}>Dashboard</Text>
          </Pressable> */}
          <Text style={styles.title}>Not Login</Text>
          <Text style={styles.subtitle}>
            Members in your hierarchy who have not signed in to the Akshar
            Connect app yet. Tap a number to call, or a name to see their
            attendance.
          </Text>
        </View>

        {query.isLoading ? (
          <View style={styles.state}>
            <ActivityIndicator size="large" color={COLORS.navy} />
            <Text style={styles.stateText}>Loading members…</Text>
          </View>
        ) : query.error ? (
          <View style={styles.state}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={42}
              color={COLORS.red}
            />
            <Text style={styles.errorTitle}>Couldn&apos;t load the list</Text>
            <Text style={styles.stateText}>
              Please check your connection and try again.
            </Text>
            <Pressable
              onPress={() => query.refetch()}
              style={styles.retry}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : members.length === 0 ? (
          <View style={styles.state}>
            <MaterialCommunityIcons
              name="account-check-outline"
              size={48}
              color={COLORS.green}
            />
            <Text style={styles.emptyTitle}>Everyone has logged in</Text>
            <Text style={styles.stateText}>
              No members are pending their first login.
            </Text>
          </View>
        ) : (
          <>
            {showSearch ? (
              <>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search member by name…"
                  placeholderTextColor={COLORS.muted}
                  style={styles.search}
                  accessibilityLabel="Search members by name"
                />
                <Text style={styles.searchMeta}>
                  {visibleMembers.length} member{visibleMembers.length === 1 ? '' : 's'} match{visibleMembers.length === 1 ? 'es' : ''} across all records
                </Text>
              </>
            ) : null}
            {!visibleMembers.length ? (
              <View style={styles.state}>
                <Text style={styles.stateText}>No member matches your search.</Text>
              </View>
            ) : (
              <View style={styles.groups}>
                {groups.map(group => (
                  <View key={group.name} style={styles.group}>
                    <View style={styles.groupHeader}>
                      <Text style={styles.groupName} numberOfLines={1}>
                        {group.name}
                      </Text>
                      <Text style={styles.groupCount}>
                        {group.members.length} not logged in
                      </Text>
                    </View>
                    {group.members.map(member => {
                      const name = member.full_name || '—';
                      const mobile = member.mobile_number;
                      return (
                        <View key={member.id} style={styles.row}>
                          <View style={styles.copy}>
                            <Pressable
                              onPress={() => setStatsUserId(member.id)}
                              accessibilityRole="button"
                              accessibilityLabel={`View ${name}'s attendance`}
                            >
                              <Text style={styles.name} numberOfLines={1}>
                                {name}
                              </Text>
                            </Pressable>
                            {mobile ? (
                              <Pressable
                                onPress={() => openContact(telUrl(mobile))}
                                disabled={!hasMobile(mobile)}
                                style={styles.phoneLink}
                                accessibilityRole="button"
                                accessibilityLabel={`Call ${name} on ${mobile}`}
                              >
                                <MaterialCommunityIcons
                                  name="phone"
                                  size={13}
                                  color={COLORS.muted}
                                />
                                <Text style={styles.meta}>{mobile}</Text>
                              </Pressable>
                            ) : null}
                            {renderMemberTags(member)}
                          </View>
                          <Pressable
                            onPress={() => setStatsUserId(member.id)}
                            style={styles.statsButton}
                            accessibilityRole="button"
                            accessibilityLabel={`View ${name}'s statistics`}
                          >
                            <MaterialCommunityIcons
                              name="chart-bar"
                              size={17}
                              color={COLORS.accent}
                            />
                            <Text style={styles.statsText}>Stats</Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ))}
                {pageSize < visibleMembers.length ? (
                  <Pressable
                    style={styles.loadMoreButton}
                    disabled={loadingMore}
                    onPress={() => {
                      setLoadingMore(true);
                      setTimeout(() => {
                        setPageSize(value => value + 25);
                        setLoadingMore(false);
                      }, 250);
                    }}
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color={COLORS.navy} />
                    ) : (
                      <Text style={styles.loadMoreText}>Load more</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            )}
          </>
        )}
        <View style={styles.footerBleed}>
          <SiteFooter
            onPrivacy={onOpenPrivacy}
            onTerms={onOpenTerms}
            onDeleteAccount={onOpenDeleteAccount}
          />
        </View>
      </ScrollViewWithTop>
      <MemberStatsDialog
        userId={statsUserId}
        isOpen={statsUserId != null}
        onClose={() => setStatsUserId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, padding: 16, paddingBottom: 24 },
  footerBleed: { marginTop: 'auto', marginHorizontal: -16, paddingTop: 14 },
  pageHeader: { marginBottom: 16 },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginBottom: 14,
  },
  backText: { color: COLORS.navy, fontSize: 13, fontWeight: '700' },
  title: {
    fontFamily: FONT_DISPLAY,
    color: COLORS.navy,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  search: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.navy,
    marginBottom: 8,
  },
  searchMeta: { color: COLORS.muted, fontSize: 12, marginBottom: 16 },
  loadMoreButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  loadMoreText: { color: COLORS.navy, fontWeight: '700' },
  state: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  stateText: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  errorTitle: {
    color: COLORS.red,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
  },
  emptyTitle: {
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
  },
  retry: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retryText: { color: COLORS.navy, fontSize: 13, fontWeight: '700' },
  groups: { gap: 22 },
  group: { gap: 8 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  groupName: {
    fontFamily: FONT_DISPLAY,
    flex: 1,
    color: COLORS.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  groupCount: {
    flexShrink: 0,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#EBF0F6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  copy: { flex: 1, minWidth: 0, marginRight: 10 },
  name: { color: COLORS.navy, fontSize: 15, fontWeight: '800' },
  meta: { color: COLORS.muted, fontSize: 12 },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleTag: {
    backgroundColor: '#EEF4FF',
  },
  flagTag: {
    backgroundColor: '#FFF4E8',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  phoneLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 3,
  },
  statsButton: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },
  statsText: { color: COLORS.navy, fontSize: 12, fontWeight: '700' },
});
