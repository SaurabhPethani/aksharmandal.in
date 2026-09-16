import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import SiteFooter from '../components/SiteFooter';
import { Text, TextInput } from '../components/Typography';
import { dashboardService } from '../services/dashboardService';
import { API_BASE } from '../api/client';
import { useAuth } from '../hooks/core';
import { canReadOverallDashboard, canSeeNotLoggedIn } from '../constants/roles';
import { readWeekDate } from '../utils/dates';
import { useMyKhardo } from '../hooks/useKhardo';
import {
  saveRemoteImage,
  shareRemoteImageOnWhatsApp,
} from '../utils/saveImage';

const COLORS = {
  navy: '#003158',
  navyLight: '#004275',
  muted: '#5C7A96',
  faint: '#9BB5CB',
  background: '#F0F4F8',
  surface: '#FFFFFF',
  border: '#DDE9F3',
  accent: '#FF862A',
  green: '#15803D',
  greenBg: '#DCFCE7',
  red: '#B91C1C',
  redBg: '#FEE2E2',
  softRed: '#E9878A',
  whatsApp: '#25D366',
  chartBlue: '#3389C9',
};

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const numberText = value =>
  value == null ? '—' : Number(value).toLocaleString('en-IN');
const qrUrl = userId =>
  userId ? `${API_BASE}/api/v1/qr/codes/akshar-connect-${userId}.jpeg` : null;

function weekRange(weekDate, { live = false } = {}) {
  if (!weekDate) return null;
  let y, mo, d;
  const str = String(weekDate).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const parts = str.split('-');
    d = Number(parts[0]);
    mo = Number(parts[1]);
    y = Number(parts[2]);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const parts = str.split('-');
    y = Number(parts[0]);
    mo = Number(parts[1]);
    d = Number(parts[2]);
  } else {
    return null;
  }

  const monStr = `${d}-${MONTHS[mo - 1]}`;
  if (live) return `Week ${monStr} to today`;

  const sunDate = new Date(Date.UTC(y, mo - 1, d + 6));
  const sunStr = `${sunDate.getUTCDate()}-${MONTHS[sunDate.getUTCMonth()]}`;
  return `Week ${monStr} to ${sunStr}`;
}

function formatSabhaAge(age) {
  if (!age) return null;
  const parts = [
    age.year ? `${age.year}y` : null,
    age.month ? `${age.month}m` : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(' ');
  if (age.days && age.days > 0) return 'This month';
  return 'Today';
}

function formatLastSabhaDay(dateStr) {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (!m) return dateStr;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

function readClock(value) {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
  if (!m) return String(value);
  const hour = Number(m[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return String(value);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

function buildChartPoints(weeks) {
  const rows = Array.isArray(weeks) ? weeks : [];
  return rows
    .map(w => {
      const read = readWeekDate(w?.week_date);
      const present = Number(w?.present_count) || (w?.attended ? 1 : 0);
      const absent = Number(w?.absent_count) || (w?.attended === false ? 1 : 0);
      const total = present + absent;
      const pct =
        w?.present_percentage != null
          ? Number(w.present_percentage)
          : w?.attended != null
            ? w.attended
              ? 100
              : 0
            : total > 0
              ? (present / total) * 100
              : 0;

      return {
        key: read?.key || String(w?.week_date || ''),
        label: read?.label || String(w?.week_date || '').slice(0, 5),
        present,
        absent,
        total,
        percentage: Math.round(pct * 10) / 10,
        ratio:
          total > 0
            ? `${present}/${total}`
            : w?.attended != null
              ? w.attended
                ? 'P'
                : 'A'
              : '0/0',
      };
    })
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

const PairValue = ({ present, absent }) => (
  <Text numberOfLines={1}>
    <Text style={styles.greenText}>{numberText(present)}</Text>
    <Text style={styles.metricValue}> | </Text>
    <Text style={styles.redText}>{numberText(absent)}</Text>
  </Text>
);

const MonthlyValue = ({ monthly, regular }) => (
  <Text numberOfLines={1}>
    <Text style={styles.greenText}>{numberText(monthly)}</Text>
    <Text style={styles.metricValue}> | </Text>
    <Text style={styles.navyText}>{numberText(regular)}</Text>
  </Text>
);

const RatioValue = ({ part, whole }) => (
  <Text numberOfLines={1}>
    <Text style={styles.metricValue}>{numberText(part)}</Text>
    <Text style={styles.metricRatioSub}> / {numberText(whole)}</Text>
  </Text>
);

function TopBar({ onMenu }) {
  return (
    <View style={styles.topBar}>
      <Pressable
        onPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel="Open navigation"
        style={styles.topButton}
      >
        <MaterialCommunityIcons name="menu" size={24} color={COLORS.surface} />
      </Pressable>
      <View style={styles.topActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Help and FAQ"
          style={styles.topButton}
        >
          <MaterialCommunityIcons
            name="book-open-outline"
            size={22}
            color={COLORS.surface}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={styles.topButton}
        >
          <MaterialCommunityIcons
            name="bell-outline"
            size={22}
            color={COLORS.surface}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          style={styles.avatar}
        >
          <MaterialCommunityIcons
            name="account"
            size={22}
            color={COLORS.surface}
          />
        </Pressable>
      </View>
    </View>
  );
}

function Drawer({ visible, onClose, onSignOut, roleName }) {
  const slide = useRef(new Animated.Value(-320)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start();
      return undefined;
    }

    const closingAnimation = Animated.parallel([
      Animated.timing(slide, {
        toValue: -320,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
    ]);

    closingAnimation.start(({ finished }) => {
      if (finished) setMounted(false);
    });

    return () => closingAnimation.stop();
  }, [backdropOpacity, slide, visible]);

  if (!mounted) return null;

  return (
    <View style={styles.drawerLayer}>
      <Animated.View
        style={[styles.drawer, { transform: [{ translateX: slide }] }]}
      >
        <View style={styles.drawerHeader}>
          <Image
            source={require('../assets/logo-square.png')}
            style={styles.drawerLogo}
            resizeMode="contain"
          />
          <Pressable onPress={onClose} style={styles.drawerClose}>
            <MaterialCommunityIcons
              name="close"
              size={20}
              color={COLORS.surface}
            />
          </Pressable>
        </View>

        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            {roleName || 'Sabha DB Manager'}
          </Text>
        </View>

        <ScrollView style={styles.flex1} showsVerticalScrollIndicator={false}>
          {[['view-dashboard-outline', 'Dashboard', true]].map(
            ([icon, label, active]) => (
              <Pressable
                key={label}
                onPress={onClose}
                style={[styles.drawerItem, active && styles.drawerItemActive]}
              >
                <MaterialCommunityIcons
                  name={icon}
                  size={20}
                  color={active ? COLORS.navy : '#C5D8E8'}
                />
                <Text
                  style={[
                    styles.drawerItemText,
                    active && styles.drawerItemTextActive,
                  ]}
                >
                  {label}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={18}
                  color={active ? COLORS.navy : '#7EA1BA'}
                />
              </Pressable>
            ),
          )}
        </ScrollView>

        <Pressable onPress={onSignOut} style={[styles.drawerItem]}>
          <MaterialCommunityIcons name="logout" size={20} color="#C5D8E8" />
          <Text style={[styles.drawerItemText]}>Logout</Text>
        </Pressable>
      </Animated.View>
      <Animated.View
        style={[styles.drawerBackdrop, { opacity: backdropOpacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable
          style={styles.drawerBackdropButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close navigation"
        />
      </Animated.View>
    </View>
  );
}

function QrBar({ userId, expanded, onToggle, onDownload, downloading }) {
  const image = qrUrl(userId);
  return (
    <View style={[styles.qrBar, expanded && styles.qrBarExpanded]}>
      <View style={styles.qrBarHeader}>
        <Text style={styles.qrBarTitle} numberOfLines={1}>
          My QR Code
        </Text>
        <View style={styles.qrBarActions}>
          <Pressable
            onPress={onToggle}
            style={styles.qrShowButton}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Hide QR Code' : 'Show QR Code'}
          >
            <Text style={styles.qrShowText}>{expanded ? 'Hide' : 'Show'}</Text>
          </Pressable>
          <Pressable
            onPress={onDownload}
            disabled={downloading}
            style={[styles.qrDownloadButton, downloading && styles.qrBusy]}
            accessibilityRole="button"
            accessibilityLabel="Download QR Code"
          >
            {downloading ? (
              <ActivityIndicator size="small" color={COLORS.navy} />
            ) : (
              <MaterialCommunityIcons
                name="download-outline"
                size={16}
                color={COLORS.navy}
              />
            )}
            <Text style={styles.qrDownloadText}>Download</Text>
          </Pressable>
        </View>
      </View>
      {expanded ? (
        <View style={styles.qrContent}>
          {image ? (
            <Image
              source={{ uri: image }}
              style={styles.qrInlineImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.qrMissingBox}>
              <MaterialCommunityIcons
                name="qrcode-remove"
                size={40}
                color={COLORS.muted}
              />
              <Text style={styles.qrMissingText}>QR code not available</Text>
            </View>
          )}
          <Text style={styles.qrInlineHint}>
            Show this at Sabha to mark your attendance
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SevaRing() {
  const { data, isLoading } = useMyKhardo();
  if (isLoading) return null;

  const pct = data?.data?.percentage;
  if (pct === null || pct === undefined) return null;

  const value = Math.max(0, Math.min(100, Number(pct)));
  if (Number.isNaN(value)) return null;
  const R = 42;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - value / 100);
  // Colour by how much of the promised Seva is in: red → amber → green.
  const color = value >= 80 ? '#15803d' : value >= 50 ? '#d97706' : '#b91c1c';

  return (
    <View style={[styles.sectionPanel, styles.sevaPanel]}>
      <Text style={[styles.sectionTitle, styles.sevaTitle]}>Seva</Text>
      <View
        style={styles.sevaRing}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Seva ${Math.round(value)}% submitted`}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="10"
          />
          <Circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${C} ${C}`}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
          />
        </Svg>
        <View style={styles.sevaCenter} pointerEvents="none">
          <Text style={[styles.sevaPercent, { color }]}>
            {Math.round(value)}%
          </Text>
          <Text style={styles.sevaSubmitted}>submitted</Text>
        </View>
      </View>
      <Text style={styles.sevaCaption}>Seva submitted of promised</Text>
    </View>
  );
}

function NotLoginCard() {
  return (
    <Pressable style={styles.notLoginCard}>
      <View style={styles.notLoginIcon}>
        <MaterialCommunityIcons
          name="account-remove-outline"
          size={22}
          color={COLORS.accent}
        />
      </View>
      <Text style={styles.notLoginText}>Not Login</Text>
      <MaterialCommunityIcons
        name="chevron-right"
        size={22}
        color={COLORS.muted}
      />
    </Pressable>
  );
}

function SearchBar() {
  return (
    <View style={styles.searchCard}>
      <MaterialCommunityIcons name="magnify" size={20} color={COLORS.muted} />
      <TextInput
        style={styles.searchInput}
        placeholder="View a member's dashboard — search by name..."
        placeholderTextColor={COLORS.muted}
      />
    </View>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = 'navy',
  action = false,
  iconBg,
  iconColor,
}) {
  const getIconBg = () => {
    if (iconBg) return { backgroundColor: iconBg };
    if (tone === 'green') return { backgroundColor: COLORS.greenBg };
    if (tone === 'orange') return { backgroundColor: '#FFF0E5' };
    return { backgroundColor: '#E5EEF5' };
  };

  const getIconColor = () => {
    if (iconColor) return iconColor;
    if (tone === 'green') return COLORS.green;
    if (tone === 'orange') return COLORS.accent;
    return COLORS.navy;
  };

  return (
    <View style={styles.metricCard}>
      <View style={styles.metricCardHeader}>
        <View style={[styles.metricIcon, getIconBg()]}>
          <MaterialCommunityIcons
            name={icon}
            size={18}
            color={getIconColor()}
          />
        </View>
        <Text style={styles.metricLabel} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <View style={styles.metricValueContainer}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <Text style={styles.metricValue} numberOfLines={2}>
            {value}
          </Text>
        ) : (
          value
        )}
      </View>
      {detail ? (
        action ? (
          <Text style={styles.metricAction} numberOfLines={2}>
            {detail}
          </Text>
        ) : (
          <Text
            style={[
              styles.metricDetail,
              tone === 'goodText' && styles.greenDetailText,
            ]}
            numberOfLines={2}
          >
            {detail}
          </Text>
        )
      ) : null}
    </View>
  );
}

function ErrorPanel({ message, onRetry }) {
  return (
    <View style={styles.errorPanel}>
      <MaterialCommunityIcons
        name="alert-circle-outline"
        size={32}
        color={COLORS.red}
      />
      <Text style={styles.errorTitle}>Couldn&apos;t load dashboard</Text>
      <Text style={styles.errorText}>{message || 'Please try again.'}</Text>
      <Pressable onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

function ThoughtCard({ thought }) {
  const [portrait, setPortrait] = useState(false);
  // Which action is running ('download' | 'share'), so both buttons lock and
  // the pressed one shows a spinner.
  const [busy, setBusy] = useState(null);
  const showPortrait = portrait && Boolean(thought?.image_url_portrait);
  const image = showPortrait ? thought.image_url_portrait : thought?.image_url;
  const name = `Todays-Thought-${showPortrait ? 'Portrait' : 'Landscape'}.png`;

  const handleDownload = async () => {
    if (!image || busy) return;
    setBusy('download');
    try {
      const res = await saveRemoteImage(image, name);
      if (res.ok) {
        Alert.alert(
          "Today's Thought",
          res.mode === 'share'
            ? 'Image ready to share.'
            : 'Image saved to your gallery.',
        );
      } else if (res.reason !== 'cancelled') {
        Alert.alert("Today's Thought", res.reason);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    if (!image || busy) return;
    setBusy('share');
    try {
      const res = await shareRemoteImageOnWhatsApp(image, name);
      if (!res.ok && res.reason !== 'cancelled') {
        Alert.alert("Today's Thought", res.reason);
      }
    } finally {
      setBusy(null);
    }
  };

  if (!image) return null;

  return (
    <View style={[styles.sectionPanel, styles.thoughtPanel]}>
      <View
        style={[
          styles.thoughtHeader,
          !portrait && styles.thoughtHeaderLandscape,
        ]}
      >
        <View style={styles.orientation}>
          <Pressable
            onPress={() => setPortrait(false)}
            style={[
              styles.orientationBtn,
              !portrait && styles.orientationActive,
            ]}
          >
            <Text
              style={
                !portrait
                  ? styles.orientationTextActive
                  : styles.orientationText
              }
            >
              Landscape
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPortrait(true)}
            style={[
              styles.orientationBtn,
              portrait && styles.orientationActive,
            ]}
          >
            <Text
              style={
                portrait ? styles.orientationTextActive : styles.orientationText
              }
            >
              Portrait
            </Text>
          </Pressable>
        </View>
      </View>

      <Image
        source={{ uri: encodeURI(image.trim()) }}
        style={portrait ? styles.thoughtPortrait : styles.thoughtLandscape}
        resizeMode="contain"
      />

      <View
        style={[
          styles.thoughtActions,
          !portrait && styles.thoughtActionsLandscape,
        ]}
      >
        <Pressable
          style={[styles.thoughtDownloadBtn, busy && styles.thoughtBtnBusy]}
          onPress={handleDownload}
          disabled={Boolean(busy)}
          accessibilityLabel="Download today's thought image"
        >
          {busy === 'download' ? (
            <ActivityIndicator size="small" color={COLORS.surface} />
          ) : (
            <MaterialCommunityIcons
              name="download-outline"
              size={16}
              color={COLORS.surface}
            />
          )}
          <Text style={styles.thoughtBtnText}>Download</Text>
        </Pressable>
        <Pressable
          style={[styles.thoughtShareBtn, busy && styles.thoughtBtnBusy]}
          onPress={handleShare}
          disabled={Boolean(busy)}
          accessibilityLabel="Share today's thought image on WhatsApp"
        >
          {busy === 'share' ? (
            <ActivityIndicator size="small" color={COLORS.surface} />
          ) : (
            <MaterialCommunityIcons
              name="whatsapp"
              size={16}
              color={COLORS.surface}
            />
          )}
          <Text style={styles.thoughtBtnText}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FriendsCard({ me }) {
  const people = [
    {
      role: 'Follow-up',
      name: me?.followup_by_id_name,
      mobile: me?.followup_id_mobile,
      icon: 'account-heart-outline',
      iconBg: '#FFF0E5',
      iconColor: COLORS.accent,
    },
    {
      role: 'Sabha Head',
      name: me?.sabha_head_name,
      mobile: me?.sabha_head_mobile,
      icon: 'shield-account-outline',
      iconBg: '#E5EEF5',
      iconColor: COLORS.navy,
    },
    {
      role: 'Mandal Head',
      name: me?.mandal_head_name,
      mobile: me?.mandal_head_mobile,
      icon: 'office-building-outline',
      iconBg: COLORS.greenBg,
      iconColor: COLORS.green,
    },
  ];

  const handleCall = mobile => {
    if (mobile) Linking.openURL(`tel:${mobile}`);
  };

  const handleWhatsApp = mobile => {
    if (mobile) {
      const clean = mobile.replace(/[^0-9]/g, '');
      Linking.openURL(
        `https://wa.me/${clean}?text=${encodeURIComponent('Jai Swaminarayan')}`,
      );
    }
  };

  return (
    <View style={styles.sectionPanel}>
      <View style={styles.sectionHeaderWithIcon}>
        <View style={styles.sectionTitleIcon}>
          <MaterialCommunityIcons
            name="account-check-outline"
            size={18}
            color={COLORS.navy}
          />
        </View>
        <Text style={styles.sectionTitle}>My Spiritual Friend</Text>
      </View>
      {people.map(({ role, name, mobile, icon, iconBg, iconColor }) => (
        <View key={role} style={styles.friendRow}>
          <View style={[styles.friendIcon, { backgroundColor: iconBg }]}>
            <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
          </View>
          <View style={styles.friendCopy}>
            <Text style={styles.friendName} numberOfLines={1}>
              {name || '—'}
            </Text>
          </View>
          {mobile ? (
            <View style={styles.friendActions}>
              <Pressable
                onPress={() => handleCall(mobile)}
                style={styles.friendActionCall}
              >
                <MaterialCommunityIcons
                  name="phone"
                  size={16}
                  color={COLORS.surface}
                />
              </Pressable>
              <Pressable
                onPress={() => handleWhatsApp(mobile)}
                style={styles.friendActionWhatsApp}
              >
                <MaterialCommunityIcons
                  name="whatsapp"
                  size={16}
                  color={COLORS.surface}
                />
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function EventsCard({ events }) {
  const upcoming = (Array.isArray(events) ? events : [])
    .filter(
      event =>
        event?.date && new Date(event.date).getTime() >= Date.now() - 86400000,
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 4);

  return (
    <View style={styles.sectionPanel}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Upcoming Events</Text>
        <Text style={styles.sectionLink}>View All</Text>
      </View>
      {upcoming.length ? (
        upcoming.map(event => (
          <View key={event.id || event.title} style={styles.eventRow}>
            <View style={styles.eventIcon}>
              <MaterialCommunityIcons
                name="calendar-star"
                size={18}
                color={COLORS.accent}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.eventTitle} numberOfLines={1}>
                {event.title || 'Untitled event'}
              </Text>
              <Text style={styles.eventDate}>
                {new Date(event.date).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
                {event.time ? `, ${event.time}` : ''}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>Nothing scheduled yet.</Text>
      )}
    </View>
  );
}

function LineChart({ points = [], height = 180 }) {
  const [chartWidth, setChartWidth] = useState(0);
  const chartHeight = height - 52;

  if (!points || !points.length) {
    return <Text style={styles.emptyText}>No attendance data available.</Text>;
  }

  const gridYValues = [100, 75, 50, 25, 0];

  return (
    <View
      style={[styles.lineChartContainer, { height }]}
      onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
    >
      {/* Y-axis Grid lines */}
      <View style={StyleSheet.absoluteFill}>
        {gridYValues.map((val, idx) => {
          const top = (idx / (gridYValues.length - 1)) * chartHeight + 24;
          return (
            <View key={val} style={[styles.chartGridLineRow, { top }]}>
              <Text style={styles.chartYLabel}>{val}</Text>
              <View style={styles.chartGridLine} />
            </View>
          );
        })}
      </View>

      {/* Points & Lines Area */}
      {chartWidth > 0 && points.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={points.length > 5}
          contentContainerStyle={{ minWidth: chartWidth }}
        >
          {(() => {
            const step = Math.max(
              52,
              (chartWidth - 48) / Math.max(1, points.length - 1),
            );
            const calculatedPoints = points.map((p, i) => {
              const x = 32 + i * step;
              const y =
                24 +
                chartHeight *
                  (1 - Math.min(100, Math.max(0, p.percentage)) / 100);
              return { ...p, x, y };
            });

            return (
              <View
                style={{
                  width: Math.max(chartWidth, 32 + points.length * step),
                  height,
                }}
              >
                {/* Connecting Line Segments */}
                {calculatedPoints.map((p1, i) => {
                  if (i === calculatedPoints.length - 1) return null;
                  const p2 = calculatedPoints[i + 1];
                  const dx = p2.x - p1.x;
                  const dy = p2.y - p1.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const angle = `${Math.atan2(dy, dx) * (180 / Math.PI)}deg`;

                  return (
                    <View
                      key={`line-${i}`}
                      style={[
                        styles.chartLineSegment,
                        {
                          left: p1.x,
                          top: p1.y,
                          width: dist,
                          transform: [{ rotate: angle }],
                        },
                      ]}
                    />
                  );
                })}

                {/* Point Dots & Labels */}
                {calculatedPoints.map((p, i) => (
                  <React.Fragment key={`point-${i}`}>
                    {/* Floating Label above Dot */}
                    <View
                      style={[
                        styles.chartPointLabelBox,
                        { left: p.x - 30, top: Math.max(0, p.y - 24) },
                      ]}
                    >
                      <Text style={styles.chartRatioText}>{p.ratio}</Text>
                      <Text style={styles.chartPctText}>{p.percentage}%</Text>
                    </View>

                    {/* Point Marker Dot */}
                    <View
                      style={[
                        styles.chartPointDot,
                        { left: p.x - 4, top: p.y - 4 },
                      ]}
                    />

                    {/* X-axis Date Label */}
                    <Text
                      style={[
                        styles.chartXLabel,
                        { left: p.x - 24, top: height - 18 },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </React.Fragment>
                ))}
              </View>
            );
          })()}
        </ScrollView>
      ) : null}
    </View>
  );
}

function WeeklyAttendanceCard({
  last4,
  last12,
  weeks,
  title = 'Weekly Attendance',
  allowWindowToggle = false,
}) {
  const [showTable, setShowTable] = useState(false);
  const [windowSize, setWindowSize] = useState('4');

  const sourceWeeks = allowWindowToggle
    ? windowSize === '12'
      ? last12 || weeks
      : last4 || weeks
    : weeks;

  const points = buildChartPoints(sourceWeeks);

  return (
    <View style={styles.sectionPanel}>
      <View style={styles.sectionHeaderWithIcon}>
        <View style={styles.sectionTitleIcon}>
          <MaterialCommunityIcons
            name="trending-up"
            size={18}
            color={COLORS.navy}
          />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      <View style={styles.chartControlsRow}>
        {allowWindowToggle ? (
          <View style={styles.togglePillGroup}>
            <Pressable
              onPress={() => setWindowSize('4')}
              style={[
                styles.togglePillBtn,
                windowSize === '4' && styles.togglePillBtnActive,
              ]}
            >
              <Text
                style={
                  windowSize === '4'
                    ? styles.togglePillTextActive
                    : styles.togglePillText
                }
              >
                4 weeks
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setWindowSize('12')}
              style={[
                styles.togglePillBtn,
                windowSize === '12' && styles.togglePillBtnActive,
              ]}
            >
              <Text
                style={
                  windowSize === '12'
                    ? styles.togglePillTextActive
                    : styles.togglePillText
                }
              >
                12 weeks
              </Text>
            </Pressable>
          </View>
        ) : (
          <View />
        )}

        <Pressable
          style={styles.showTableBtn}
          onPress={() => setShowTable(!showTable)}
        >
          <MaterialCommunityIcons name="table" size={15} color={COLORS.navy} />
          <Text style={styles.showTableText}>
            {showTable ? 'Show chart' : 'Show table'}
          </Text>
        </Pressable>
      </View>

      {showTable ? (
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeadCellFlex2}>Week</Text>
            <Text style={styles.tableHeadCellFlex1Center}>Present</Text>
            <Text style={styles.tableHeadCellFlex1Center}>Absent</Text>
          </View>
          {points.map((p, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.tableCellFlex2}>{p.label}</Text>
              <Text style={[styles.tableCellFlex1Center, styles.greenText]}>
                {p.present}
              </Text>
              <Text style={[styles.tableCellFlex1Center, styles.redText]}>
                {p.absent}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <LineChart points={points} height={200} />
      )}
    </View>
  );
}

function YearAttendance({ year }) {
  const total = Number(year?.total) || 0;
  const present = Number(year?.present) || 0;
  const absent = Number(year?.absent) || 0;
  const missedPercent = total ? Math.round((absent / total) * 100) : 0;

  return (
    <View style={styles.sectionPanel}>
      <View style={styles.sectionHeaderWithIcon}>
        <View style={styles.sectionTitleIcon}>
          <MaterialCommunityIcons
            name="clock-outline"
            size={18}
            color={COLORS.navy}
          />
        </View>
        <Text style={styles.sectionTitle}>My Last 52 Weeks</Text>
      </View>

      <View style={styles.yearContentContainer}>
        <View style={styles.leaderBoxLeft}>
          <Text style={styles.leaderBoxText}>
            Present{' '}
            <Text style={styles.leaderBoxCount}>{numberText(present)}</Text>
          </Text>
        </View>

        <View style={styles.ringContainer}>
          <View style={styles.ringOuter}>
            <Svg width={100} height={100} style={styles.ringSvg}>
              <Circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke={COLORS.green}
                strokeWidth="12"
              />
              {missedPercent > 0 ? (
                <Circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke={COLORS.softRed}
                  strokeWidth="12"
                  strokeDasharray={`${(missedPercent / 100) * 2 * Math.PI * 44} ${2 * Math.PI * 44}`}
                  strokeLinecap="butt"
                  transform={`rotate(${-(missedPercent * 1.8)} 50 50)`}
                />
              ) : null}
            </Svg>
            <View style={styles.ringInner}>
              <Text style={styles.ringPercentText}>{missedPercent}%</Text>
              <Text style={styles.ringMissedLabel}>MISSED</Text>
            </View>
          </View>
        </View>

        <View style={styles.leaderBoxRight}>
          <Text style={styles.leaderBoxText}>
            Absent{' '}
            <Text style={styles.leaderBoxCount}>{numberText(absent)}</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

function OverallDashboard({ data, live, birthdays }) {
  const lastWeek = data?.attendance_last_4_week?.at(-1);
  const todayBirthdaysCount = (birthdays?.users || []).filter(
    user => user?.contact,
  ).length;

  const lastWeekRange = lastWeek ? weekRange(lastWeek.week_date) : null;
  const liveWeekRange = live?.week_date
    ? weekRange(live.week_date, { live: true })
    : null;

  return (
    <>
      <View style={styles.grid}>
        <MetricCard
          icon="account-group-outline"
          label="Total Users"
          value={numberText(data?.total_users?.number)}
          detail={
            data?.total_users_last_week != null
              ? `last week ${numberText(data.total_users_last_week)}`
              : null
          }
        />
        <MetricCard
          icon="clipboard-check-outline"
          label="Last week"
          value={
            lastWeek ? (
              <PairValue
                present={lastWeek.present_count}
                absent={lastWeek.absent_count}
              />
            ) : (
              '—'
            )
          }
          detail={lastWeekRange || 'Present | Absent'}
        />
        <MetricCard
          icon="pulse"
          label="This week"
          value={
            live?.current_week ? (
              <PairValue
                present={live.current_week.present}
                absent={live.current_week.absent}
              />
            ) : (
              '—'
            )
          }
          detail={liveWeekRange || 'Present | Absent'}
        />
        <MetricCard
          icon="calendar-check-outline"
          label="Monthly Once | Most Regular"
          value={
            <MonthlyValue
              monthly={data?.monthly_once?.number}
              regular={data?.most_regular?.number}
            />
          }
          detail={
            data?.monthly_once?.percentage != null
              ? `${Number(data.monthly_once.percentage).toFixed(0)}% attend monthly`
              : null
          }
          tone="green"
        />
        <MetricCard
          icon="account-cog-outline"
          label="Untouched User"
          value={numberText(data?.untouched_yuvak)}
          detail="Follow up"
          tone="orange"
          action
        />
        <MetricCard
          icon="cake-variant"
          label="Follow-up Birthdays"
          value={birthdays?.error ? '—' : numberText(todayBirthdaysCount)}
          detail="Send wishes"
          tone="orange"
          action
        />
      </View>

      <WeeklyAttendanceCard
        last4={data?.attendance_last_4_week}
        last12={data?.attendance_last_12_week}
        title="Weekly Attendance"
        allowWindowToggle
      />
    </>
  );
}

function SelfDashboard({ data, me, birthdays, events, thought }) {
  const attendance = data?.total_sabha_present;
  const recent = data?.present_in_last_4w;
  const lastSabha = data?.last_sabha;
  const lastSabhaDay = formatLastSabhaDay(lastSabha?.date);
  const sabhaAge = formatSabhaAge(data?.sabha_age);

  return (
    <>
      {canSeeNotLoggedIn(me?.role_id) ? <SearchBar /> : null}
      <ThoughtCard thought={thought} />

      <View style={styles.grid}>
        <MetricCard
          icon="timer-sand"
          label="Sabha Age"
          value={sabhaAge || '—'}
          detail={sabhaAge ? null : 'Joining date not recorded'}
        />
        <MetricCard
          icon="calendar-clock"
          label="Total Sabha Attended"
          value={
            attendance ? (
              <RatioValue
                part={attendance.attended}
                whole={attendance.total_sabha}
              />
            ) : (
              '—'
            )
          }
          detail={attendance?.total_sabha ? null : 'No attendance recorded yet'}
          tone="orange"
        />
        <MetricCard
          icon="calendar-check-outline"
          label="Last 4 Weeks"
          value={
            recent ? (
              <RatioValue part={recent.attended} whole={recent.total} />
            ) : (
              '—'
            )
          }
          tone="green"
        />
        <MetricCard
          icon="check-circle-outline"
          label="Last Sabha"
          value={
            lastSabha ? (
              <Text numberOfLines={2}>
                <Text style={styles.metricValue}>
                  {lastSabha.attended ? 'Attended' : 'Not Attended'}
                </Text>
                {lastSabhaDay ? (
                  <Text style={styles.metricDateSub}> · {lastSabhaDay}</Text>
                ) : null}
              </Text>
            ) : (
              '—'
            )
          }
          detail={
            lastSabha
              ? lastSabha.attended
                ? 'One step ahead in spiritual growth.'
                : 'Your next step in spiritual growth awaits.'
              : null
          }
          tone={lastSabha?.attended ? 'goodText' : 'orange'}
        />
        <MetricCard
          icon="gift-outline"
          label="Birthdays Today"
          value={birthdays?.users ? numberText(birthdays.users.length) : '—'}
          detail="Send wishes"
          tone="orange"
          iconBg={COLORS.redBg}
          iconColor={COLORS.red}
          action
        />
        <MetricCard
          icon="calendar-month-outline"
          label="Upcoming Sabha"
          value={
            data?.upcoming_sabha
              ? [data.upcoming_sabha.day, readClock(data.upcoming_sabha.time)]
                  .filter(Boolean)
                  .join(' ')
              : '—'
          }
          detail={data?.upcoming_sabha?.location || null}
        />
      </View>

      <EventsCard events={events} />
      <FriendsCard me={me} />
      <WeeklyAttendanceCard weeks={data?.last_8w} title="My Last 8 Weeks" />
      <YearAttendance year={data?.last_52w} />
    </>
  );
}

export default function DashboardPage() {
  const { signOut, activeUserId } = useAuth();
  const queryClient = useQueryClient();
  const [overview, setOverview] = useState(null);
  const [live, setLive] = useState(null);
  const [me, setMe] = useState(null);
  const [birthdays, setBirthdays] = useState(null);
  const [events, setEvents] = useState([]);
  const [thought, setThought] = useState(null);
  const [tab, setTab] = useState('overall');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDownloading, setQrDownloading] = useState(false);

  const load = async ({ refresh = false } = {}) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [
        overviewResult,
        liveResult,
        meResult,
        birthdaysResult,
        eventsResult,
        thoughtResult,
      ] = await Promise.allSettled([
        dashboardService.overview(),
        dashboardService.presentAbsent(),
        dashboardService.me(),
        dashboardService.birthdays(),
        dashboardService.events(),
        dashboardService.todayThought(),
      ]);

      if (overviewResult.status === 'rejected') throw overviewResult.reason;

      setOverview(overviewResult.value);
      setLive(liveResult.status === 'fulfilled' ? liveResult.value : null);
      setMe(meResult.status === 'fulfilled' ? meResult.value : null);
      setBirthdays(
        birthdaysResult.status === 'fulfilled' ? birthdaysResult.value : null,
      );
      setEvents(
        eventsResult.status === 'fulfilled'
          ? Array.isArray(eventsResult.value)
            ? eventsResult.value
            : eventsResult.value?.items || []
          : [],
      );
      setThought(
        thoughtResult.status === 'fulfilled' && thoughtResult.value
          ? thoughtResult.value
          : null,
      );
    } catch (caught) {
      setError(caught?.message || 'Unable to load dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const data = overview?.data || {};
  const roleId = me?.role_id;
  const mayReadOverall = canReadOverallDashboard(roleId);
  const activeTab = mayReadOverall ? tab : 'self';
  const displayName = me?.user_name || me?.full_name || 'Saurabh';

  const downloadQr = async () => {
    const image = qrUrl(activeUserId || me?.id || me?.user_id);
    if (!image || qrDownloading) return;
    setQrDownloading(true);
    // Named after the member, as on the web, minus characters a file name
    // cannot hold.
    const cleaned = String(me?.full_name || me?.user_name || '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    try {
      const res = await saveRemoteImage(
        image,
        `${cleaned || 'Akshar Connect'} QR.jpeg`,
      );
      if (res.ok) {
        Alert.alert(
          'My QR Code',
          res.mode === 'share'
            ? 'QR code shared.'
            : 'QR code saved to your gallery.',
        );
      } else if (res.reason !== 'cancelled') {
        Alert.alert('My QR Code', res.reason);
      }
    } finally {
      setQrDownloading(false);
    }
  };

  return (
    <View style={styles.safe}>
      <TopBar onMenu={() => setDrawerOpen(true)} />

      <ScrollView
        style={styles.flex1}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              // SevaRing reads through React Query, outside `load`.
              queryClient.invalidateQueries({ queryKey: ['khardo', 'me'] });
              load({ refresh: true });
            }}
            tintColor={COLORS.navy}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>
            Jai Swaminarayan, {displayName.trim().split(/\s+/)[0]}
          </Text>
        </View>

        <QrBar
          userId={activeUserId || me?.id || me?.user_id}
          expanded={qrOpen}
          onToggle={() => setQrOpen(value => !value)}
          onDownload={downloadQr}
          downloading={qrDownloading}
        />

        {/* Seva */}
        <SevaRing />

        {canSeeNotLoggedIn(roleId) ? <NotLoginCard /> : null}

        {mayReadOverall ? (
          <View style={styles.tabs}>
            <Pressable
              onPress={() => setTab('overall')}
              style={[styles.tab, activeTab === 'overall' && styles.activeTab]}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'overall' && styles.activeTabText,
                ]}
              >
                User Dashboard
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab('self')}
              style={[styles.tab, activeTab === 'self' && styles.activeTab]}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'self' && styles.activeTabText,
                ]}
              >
                My Dashboard
              </Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={COLORS.navy} />
            <Text style={styles.loadingText}>Loading dashboard...</Text>
          </View>
        ) : error ? (
          <ErrorPanel message={error} onRetry={() => load()} />
        ) : activeTab === 'overall' ? (
          <OverallDashboard
            data={data.overall}
            live={live}
            birthdays={birthdays}
          />
        ) : (
          <SelfDashboard
            data={data.self}
            me={me}
            birthdays={birthdays}
            events={events}
            thought={thought}
          />
        )}

        <View style={styles.footerBleed}>
          <SiteFooter />
        </View>
      </ScrollView>

      <Drawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSignOut={signOut}
        roleName={me?.role_name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  safe: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    height: 56,
    backgroundColor: COLORS.navy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  topButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  drawerLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  drawerBackdropButton: {
    flex: 1,
  },
  drawer: {
    width: '82%',
    maxWidth: 320,
    height: '100%',
    backgroundColor: COLORS.navy,
    paddingHorizontal: 18,
    paddingVertical: 20,
    zIndex: 1,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 20,
    width: '100%',
  },
  drawerLogo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,

    // Subtle white shadow
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.35,
    shadowRadius: 4,

    // Android
    elevation: 8,
  },
  drawerLogoText: {
    color: COLORS.accent,
    fontSize: 28,
    fontWeight: '800',
    fontStyle: 'italic',
  },
  drawerTitle: { color: COLORS.surface, fontSize: 18, fontWeight: '800' },
  drawerSub: { color: '#BBD0E0', fontSize: 11, letterSpacing: 1.5 },
  drawerClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  roleBadgeText: { color: '#D9E7F0', fontSize: 13, fontWeight: '700' },
  drawerItem: {
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  drawerItemActive: { backgroundColor: COLORS.background },
  drawerItemText: {
    flex: 1,
    color: '#C5D8E8',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
  },
  drawerItemTextActive: { color: COLORS.navy, fontWeight: '800' },
  drawerLogout: {
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,134,42,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 10,
    marginTop: 10,
  },
  drawerLogoutText: { color: '#FFD0B0', fontSize: 14, fontWeight: '800' },
  scroll: { padding: 16, paddingTop: 16, paddingBottom: 0 },
  footerBleed: { marginHorizontal: -16, paddingTop: 14 },
  header: { marginBottom: 16 },
  title: { color: COLORS.navy, fontSize: 24, fontWeight: '800' },
  qrBar: {
    borderRadius: 18,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  qrBarExpanded: { paddingVertical: 16 },
  qrBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  qrBarTitle: {
    flex: 1,
    color: COLORS.surface,
    fontSize: 18,
    fontWeight: '800',
  },
  qrBarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qrShowButton: {
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6285A0',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrShowText: { color: COLORS.surface, fontSize: 13, fontWeight: '800' },
  qrDownloadButton: {
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  qrDownloadText: { color: COLORS.navy, fontSize: 13, fontWeight: '800' },
  qrBusy: { opacity: 0.6 },
  qrContent: { alignItems: 'center', marginTop: 14 },
  qrInlineImage: {
    width: 220,
    height: 220,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 8,
  },
  qrMissingBox: {
    width: 220,
    height: 220,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrMissingText: { color: '#C5D8E8', fontSize: 13, marginTop: 8 },
  qrInlineHint: {
    color: '#C5D8E8',
    textAlign: 'center',
    fontSize: 13,
    marginTop: 10,
  },
  notLoginCard: {
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  notLoginIcon: { width: 28, alignItems: 'center' },
  notLoginText: {
    flex: 1,
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 8,
  },
  searchCard: {
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: COLORS.navy,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#D7E3EC',
    marginBottom: 18,
  },
  tab: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: COLORS.accent },
  tabText: { color: COLORS.muted, fontSize: 15, fontWeight: '700' },
  activeTabText: { color: COLORS.navy },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 14,
  },
  metricCard: {
    width: '48.2%',
    minHeight: 90,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    justifyContent: 'space-between',
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    flex: 1,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  metricValueContainer: {
    marginVertical: 2,
  },
  metricValue: {
    color: COLORS.navy,
    fontSize: 20,
    fontWeight: '800',
  },
  metricRatioSub: {
    color: COLORS.faint,
    fontSize: 14,
    fontWeight: '600',
  },
  metricDateSub: {
    color: COLORS.faint,
    fontSize: 12,
    fontWeight: '600',
  },
  metricDetail: {
    color: COLORS.faint,
    fontSize: 11,
    marginTop: 4,
  },
  greenDetailText: {
    color: COLORS.green,
    fontWeight: '700',
  },
  metricAction: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '800',
    textDecorationLine: 'underline',
    marginTop: 4,
  },
  loading: { minHeight: 280, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: COLORS.muted, marginTop: 12, fontSize: 14 },
  errorPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F4C7C7',
  },
  errorTitle: {
    color: COLORS.red,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
  },
  errorText: { color: COLORS.muted, textAlign: 'center', marginTop: 4 },
  retryButton: {
    backgroundColor: COLORS.navy,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 10,
    marginTop: 16,
  },
  retryText: { color: COLORS.surface, fontWeight: '800', fontSize: 13 },
  sectionPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitleIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#E5EEF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { color: COLORS.navy, fontSize: 15, fontWeight: '800' },
  sevaPanel: { alignItems: 'center' },
  sevaTitle: { alignSelf: 'flex-start', marginBottom: 8 },
  sevaRing: { width: 150, height: 150 },
  sevaCenter: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sevaPercent: { fontSize: 34, lineHeight: 40, fontWeight: '800' },
  sevaSubmitted: { color: '#64748b', fontSize: 13, marginTop: 2 },
  sevaCaption: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  sectionLink: { color: COLORS.accent, fontSize: 12, fontWeight: '800' },
  thoughtHeader: { alignItems: 'center', marginBottom: 12 },
  thoughtPanel: {
    padding: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  thoughtHeaderLandscape: { marginBottom: 4 },
  thoughtLandscape: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },
  thoughtPortrait: {
    width: '100%',
    height: 430,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },
  thoughtActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  thoughtActionsLandscape: { marginTop: 4 },
  thoughtDownloadBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.navy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  thoughtShareBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.whatsApp,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  thoughtBtnText: { color: COLORS.surface, fontSize: 13, fontWeight: '800' },
  thoughtBtnBusy: { opacity: 0.6 },
  orientation: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: 18,
    padding: 3,
  },
  orientationBtn: {
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  orientationActive: { backgroundColor: COLORS.navy },
  orientationText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  orientationTextActive: {
    color: COLORS.surface,
    fontSize: 11,
    fontWeight: '700',
  },
  friendRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  friendIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendCopy: { flex: 1, marginLeft: 10, marginRight: 8 },
  friendName: { color: COLORS.navy, fontSize: 14, fontWeight: '800' },
  friendActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  friendActionCall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendActionWhatsApp: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.whatsApp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  eventIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFF0E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  eventTitle: { color: COLORS.navy, fontSize: 13, fontWeight: '800' },
  eventDate: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 13,
  },
  chartControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  togglePillGroup: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 3,
  },
  togglePillBtn: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4 },
  togglePillBtnActive: { backgroundColor: COLORS.surface, elevation: 1 },
  togglePillText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  togglePillTextActive: { color: COLORS.navy, fontSize: 11, fontWeight: '800' },
  showTableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  showTableText: { color: COLORS.navy, fontSize: 11, fontWeight: '700' },
  lineChartContainer: {
    marginTop: 8,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  chartLineSegment: {
    position: 'absolute',
    height: 2,
    backgroundColor: COLORS.chartBlue,
    transformOrigin: '0% 50%',
  },
  chartGridLineRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chartYLabel: {
    width: 22,
    fontSize: 9,
    color: COLORS.faint,
    textAlign: 'right',
    marginRight: 4,
  },
  chartGridLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2EBF2',
  },
  chartPointDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.chartBlue,
    borderWidth: 1.5,
    borderColor: COLORS.surface,
  },
  chartPointLabelBox: {
    position: 'absolute',
    width: 60,
    alignItems: 'center',
  },
  chartRatioText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.navy,
  },
  chartPctText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.chartBlue,
  },
  chartXLabel: {
    position: 'absolute',
    width: 48,
    textAlign: 'center',
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: '600',
  },
  tableContainer: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F5F8FA',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableHeadCellFlex2: {
    flex: 2,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  tableHeadCellFlex1Center: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableCellFlex2: {
    flex: 2,
    color: COLORS.navy,
    fontSize: 12,
    fontWeight: '600',
  },
  tableCellFlex1Center: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.navy,
    fontSize: 12,
    fontWeight: '600',
  },
  chartWrapper: { marginTop: 4 },
  chartRows: { gap: 4 },
  weekRow: { flexDirection: 'row', alignItems: 'center', height: 28 },
  weekLabel: { width: 48, color: COLORS.muted, fontSize: 11 },
  weekTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8EFF4',
    overflow: 'hidden',
  },
  weekFill: { height: '100%', borderRadius: 4 },
  weekFillAttended: { width: '100%', backgroundColor: COLORS.green },
  weekFillMissed: { width: '12%', backgroundColor: COLORS.softRed },
  weekStatus: {
    width: 24,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '800',
  },
  yearContentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  leaderBoxLeft: {
    borderWidth: 1,
    borderColor: COLORS.green,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.surface,
  },
  leaderBoxRight: {
    borderWidth: 1,
    borderColor: COLORS.softRed,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.surface,
  },
  leaderBoxText: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  leaderBoxCount: { color: COLORS.navy, fontWeight: '800' },
  ringContainer: { alignItems: 'center', justifyContent: 'center' },
  ringOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: { position: 'absolute' },
  ringInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercentText: { color: COLORS.navy, fontSize: 18, fontWeight: '800' },
  ringMissedLabel: {
    color: COLORS.faint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  greenText: { color: COLORS.green, fontWeight: '800', fontSize: 18 },
  redText: { color: COLORS.red, fontWeight: '800', fontSize: 18 },
  navyText: { color: COLORS.navy, fontWeight: '800', fontSize: 18 },
});
