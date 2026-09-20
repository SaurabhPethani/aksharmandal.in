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
import Svg, { Circle, G, Polyline, Text as SvgText } from 'react-native-svg';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import SiteFooter from '../components/SiteFooter';
import AppHeader from '../components/AppHeader';
import { Text } from '../components/Typography';
import { Modal } from '../components/Overlays';
import { Skeleton } from '../components/ui';
import MemberStatsSearch from '../components/dashboard/MemberStatsSearch';
import TrendChart from '../components/charts/TrendChart';
import { dashboardService } from '../services/dashboardService';
import { API_BASE } from '../config/appConfig';
import { useAuth } from '../hooks/core';
import {
  canReadHelp,
  canReadOverallDashboard,
  canSeeNotLoggedIn,
} from '../constants/roles';
import { nextWeekdayDate, readWeekDate } from '../utils/dates';
import { useMyKhardo } from '../hooks/useKhardo';
import { useMemberStats } from '../hooks/useMemberStats';
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

  // `week_date` NAMES THE WEEK'S SUNDAY, so the Monday is six days back — the
  // same reading as the web's `weekRange`, which is what makes "7-Sep to
  // 13-Sep" on one screen mean the week it means on the other.
  const sunStr = `${d}-${MONTHS[mo - 1]}`;
  const monDate = new Date(Date.UTC(y, mo - 1, d - 6));
  const monStr = `${monDate.getUTCDate()}-${MONTHS[monDate.getUTCMonth()]}`;

  if (live) return `${monStr} to today`;
  return `${monStr} to ${sunStr}`;
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
  const value = String(dateStr).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${Number(iso[3])} ${MONTHS[Number(iso[2]) - 1]}`;
  const indian = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (indian) return `${Number(indian[1])} ${MONTHS[Number(indian[2]) - 1]}`;
  return value;
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

/**
 * The rows TrendChart plots, in the shape the web's chart reads:
 * `present` IS THE PERCENTAGE (the plotted series), and the counts ride
 * alongside it for the labels and the tooltip.
 */
function buildChartPoints(weeks) {
  const rows = Array.isArray(weeks) ? weeks : [];
  return rows
    .map(w => {
      const read = readWeekDate(w?.week_date);
      const presentCount = Number(w?.present_count) || (w?.attended ? 1 : 0);
      const absentCount =
        Number(w?.absent_count) || (w?.attended === false ? 1 : 0);
      const total = presentCount + absentCount;
      // THREE STATES on a personal week: present | absent | upcoming. An
      // upcoming week has no percentage at all — see the null below.
      const status =
        w?.status ??
        (w?.attended == null ? null : w.attended ? 'present' : 'absent');
      const pct =
        w?.present_percentage != null
          ? Number(w.present_percentage)
          : w?.attended != null
            ? w.attended
              ? 100
              : 0
            : total > 0
              ? (presentCount / total) * 100
              : 0;

      return {
        sortKey: read?.key || String(w?.week_date || ''),
        label: read?.label || String(w?.week_date || '').slice(0, 5),
        rangeLabel: weekRange(w?.week_date),
        // `null` lifts the pen: a week whose Sabha has not been held is not a
        // miss, so the line breaks rather than diving to the baseline.
        present: status === 'upcoming' ? null : Math.round(pct * 10) / 10,
        absentPercentage: w?.absent_percentage,
        presentCount,
        absentCount,
        status,
        total,
      };
    })
    .sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
}

// THE YEAR AS ONE RING — the web's YearDonut, value for value. The viewBox is
// much wider than the ring because the labels sit OUTSIDE it on leader lines:
// the box has to hold ring, ticks and words, or the text clips at the card's
// edge. Wide enough for the longest label the data can produce ("Present 100").
const VB_W = 404;
const VB_H = 214;
const CX = 202;
const CY = 104;
const RING_STROKE = 30;
const RING_RADIUS = 62;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
/** The divider between the two arcs, as a gap in the stroke. */
const RING_GAP = 3;
const LEADER_START = RING_RADIUS + RING_STROKE / 2;
/** How far out the tick ends — the label box begins exactly here. */
const LABEL_X = LEADER_START + 18;
/** The label box is a view (see YearAttendance) and hugs its own text; only its
 *  height is fixed, so it can be centred on the ring's middle line. */
const DONUT_LABEL_H = 28;
const PRESENT_COLOUR = '#15803D';
/** A LIGHTER red than danger-fg: it differs from the green in LIGHTNESS as well
 *  as hue, which is the channel colour blindness leaves alone. The labels carry
 *  the counts in text, which is what allows a colour this light. */
const ABSENT_COLOUR = '#E9878A';

/** `label: 'Sabha'` pairs with the Present/Absent wording in the tooltip. */
const SELF_SERIES = [
  { key: 'present', label: 'Sabha', color: COLORS.chartBlue },
];

/** "13 (31.0%)" — the count with the share the API reported for it. */
const countWithShare = (count, percentage) =>
  percentage == null || percentage === ''
    ? numberText(count)
    : `${numberText(count)} (${Number(percentage).toFixed(1)}%)`;

/**
 * The week-on-week change beside a figure — "↑3", green up and red down.
 *
 * Drawn only when there IS a change: a zero delta, or an unknown previous
 * figure, leaves the number on its own rather than claiming "↑0".
 */
const DeltaBadge = ({ delta }) => {
  if (!delta) return null;
  return (
    <Text style={delta > 0 ? styles.deltaUp : styles.deltaDown}>
      {' '}
      {delta > 0 ? '↑' : '↓'}
      {numberText(Math.abs(delta))}
    </Text>
  );
};

/** A count with its week-on-week change — "1,484 ↑3". */
const CountWithDelta = ({ now, last }) => (
  <Text numberOfLines={1}>
    <Text style={styles.metricValue}>{numberText(now)}</Text>
    <DeltaBadge delta={now == null || last == null ? null : now - last} />
  </Text>
);

/**
 * Present | Absent, green and red. `presentDelta` adds the week-to-date arrow
 * beside PRESENT only — the comparison is deliberately present-only, as on the
 * web.
 */
const PairValue = ({ present, absent, presentDelta }) => (
  <Text numberOfLines={1}>
    <Text style={styles.greenText}>{numberText(present)}</Text>
    <DeltaBadge delta={presentDelta} />
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

export function Drawer({
  visible,
  onClose,
  onSignOut,
  onDashboard,
  onOpenEvents,
  onOpenNotifications,
  activeRoute = 'dashboard',
  roleName,
}) {
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
          <View style={styles.drawerLogoFrame}>
            <Image
              source={require('../assets/logo-square.png')}
              style={styles.drawerLogo}
              resizeMode="contain"
              fadeDuration={0}
            />
          </View>
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
          {[
            [
              'view-dashboard-outline',
              'Dashboard',
              activeRoute === 'dashboard',
            ],
            ['calendar-star', 'Events', activeRoute === 'events'],
          ].map(([icon, label, active]) => (
            <Pressable
              key={label}
              onPress={() => {
                if (label === 'Dashboard') onDashboard?.();
                else if (label === 'Events') onOpenEvents?.();
                onClose();
              }}
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
          ))}
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
  // Folded away by default, like the QR code.
  const [expanded, setExpanded] = useState(false);
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
      <View style={styles.sevaHeader}>
        <Text style={styles.sectionTitle}>Seva</Text>
        <Pressable
          onPress={() => setExpanded(open => !open)}
          style={styles.showTableBtn}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide Seva' : 'Show Seva'}
        >
          <MaterialCommunityIcons
            name={expanded ? 'eye-off-outline' : 'eye-outline'}
            size={15}
            color={COLORS.navy}
          />
          <Text style={styles.showTableText}>{expanded ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>

      {expanded ? (
        <>
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
        </>
      ) : null}
    </View>
  );
}

function NotLoginCard({ onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.notLoginCard,
        pressed && styles.metricCardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View members who have not logged in"
    >
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

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = 'navy',
  action = false,
  iconBg,
  iconColor,
  onPress,
}) {
  // Tiles with somewhere to go are buttons; the rest stay plain views.
  const Card = onPress ? Pressable : View;
  const cardProps = onPress
    ? {
        onPress,
        accessibilityRole: 'button',
        style: ({ pressed }) => [
          styles.metricCard,
          pressed && styles.metricCardPressed,
        ],
      }
    : { style: styles.metricCard };

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
    <Card {...cardProps}>
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
    </Card>
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

function FriendsCard({ me, title = 'My Spiritual Friend' }) {
  const people = [
    {
      role: 'Follow-up',
      name: me?.followup_by_id_name,
      mobile: me?.followup_id_mobile,
      whatsapp: me?.followup_id_whatsapp,
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
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {people.map(
        ({ role, name, mobile, whatsapp, icon, iconBg, iconColor }) => (
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
                  onPress={() => handleWhatsApp(whatsapp || mobile)}
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
        ),
      )}
    </View>
  );
}

function EventsCard({ events, onViewAll }) {
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
        <Pressable onPress={onViewAll} hitSlop={8}>
          <Text style={styles.sectionLink}>View All</Text>
        </Pressable>
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

function WeeklyAttendanceCard({
  last4,
  last12,
  weeks,
  title = 'Weekly Attendance',
  allowWindowToggle = false,
}) {
  const [showTable, setShowTable] = useState(false);
  const [windowSize, setWindowSize] = useState('4');
  // The personal 8-week card: one member's present/absent weeks rather than a
  // Sabha's turnout, so it reads P / A instead of a percentage.
  const selfMode = !allowWindowToggle;

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

      <TrendChart
        points={points}
        series={selfMode ? SELF_SERIES : undefined}
        height={selfMode ? 220 : 240}
        // The percentage scale is furniture on a personal chart: the P / A on
        // each point already says what the position encodes.
        hideYAxis={selfMode}
        pointLabel={
          selfMode
            ? p =>
                p.status === 'present'
                  ? 'P'
                  : p.status === 'upcoming'
                    ? 'U'
                    : 'A'
            : p => {
                if (!p.total) return null;
                const share =
                  p.present == null ? null : `${Number(p.present).toFixed(1)}%`;
                const ratio = `${numberText(p.presentCount)}/${numberText(p.total)}`;
                return share ? [ratio, share] : [ratio];
              }
        }
        // A personal week reads as a word, never as the "100.0%" the axis
        // encodes.
        formatSeriesValue={
          selfMode
            ? p =>
                p.status === 'present'
                  ? 'Present'
                  : p.status === 'upcoming'
                    ? 'Upcoming'
                    : 'Absent'
            : null
        }
        tooltipExtras={
          selfMode
            ? null
            : p => {
                const present = Number(p.presentCount) || 0;
                const absent = Number(p.absentCount) || 0;
                // Nothing recorded that week: three zeroes say less than not
                // asking.
                if (!present && !absent) return [];
                return [
                  { label: 'Total', value: numberText(present + absent) },
                  {
                    label: 'Present',
                    value: countWithShare(present, p.present),
                  },
                  {
                    label: 'Absent',
                    value: countWithShare(absent, p.absentPercentage),
                  },
                ];
              }
        }
        showTable={showTable}
        // The count column the web puts beside the percentage, so the table
        // reads "2 / 7" and "29.0%" for the same week.
        extraColumns={
          selfMode
            ? null
            : [
                {
                  header: 'Present / Total',
                  cell: p =>
                    p.total
                      ? `${numberText(p.presentCount)} / ${numberText(p.total)}`
                      : '—',
                },
              ]
        }
      />
    </View>
  );
}

function YearAttendance({ year, title = 'My Last 52 Weeks' }) {
  // The drawing's own width, so the labels beside the ring can be placed on the
  // same scale the SVG is drawn at.
  const [drawnWidth, setDrawnWidth] = useState(0);
  const scale = drawnWidth ? drawnWidth / VB_W : 0;

  const total = Number(year?.total) || 0;
  const present = Number(year?.present) || 0;
  const absent = Number(year?.absent) || 0;

  // Drawn from the ARC LENGTHS rather than from percentages the API did not
  // send, and taken over `total`: if the two ever fail to sum to the year, the
  // ring shows the shortfall as unfilled track instead of quietly rescaling.
  const arcFor = n => (total > 0 ? (n / total) * RING_LENGTH : 0);
  const presentArc = arcFor(present);
  const absentArc = arcFor(absent);

  // THE DIVIDER ONLY EXISTS WHERE THERE IS SOMETHING TO DIVIDE — a whole year
  // on one side draws as one closed ring, not a ring with a nick in it.
  const gap = presentArc > 0 && absentArc > 0 ? RING_GAP : 0;

  // WHERE THE RING STARTS is the one free choice on a donut, spent here on
  // putting both wedge midpoints on the horizontal: present lands at nine
  // o'clock and absent at three, whatever the split, so each label is a short
  // straight tick out of the ring's own side.
  const startDeg = 270 - (total > 0 ? present / total : 0) * 180;

  // THE CENTRE IS THE MISS RATE, not the size of the year — the one figure a
  // member would repeat to somebody, and what the ring is a picture of.
  const missed = total > 0 ? `${Math.round((absent / total) * 100)}%` : '—';

  return (
    <View style={styles.sectionPanel}>
      <View style={styles.sectionHeaderWithIcon}>
        <View style={styles.sectionTitleIcon}>
          <MaterialCommunityIcons
            name="chart-donut"
            size={18}
            color={COLORS.navy}
          />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      {!year ? (
        <Text style={styles.yearEmpty}>
          No attendance recorded in the last year.
        </Text>
      ) : (
        <View
          style={styles.donut}
          onLayout={e => setDrawnWidth(e.nativeEvent.layout.width)}
        >
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            accessibilityRole="image"
            accessibilityLabel={`Last 52 weeks: ${present} present and ${absent} absent of ${total} Sabhas.`}
          >
            {/* THE ARCS ARE ROTATED, THE WORDS ARE NOT. `-90` because a dash
                pattern starts at three o'clock. */}
            <G transform={`rotate(${startDeg - 90} ${CX} ${CY})`}>
              {/* The unfilled track, visible only where present and absent
                  together fall short of the year. */}
              <Circle
                cx={CX}
                cy={CY}
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(0,49,88,0.06)"
                strokeWidth={RING_STROKE}
              />
              <Circle
                cx={CX}
                cy={CY}
                r={RING_RADIUS}
                fill="none"
                stroke={PRESENT_COLOUR}
                strokeWidth={RING_STROKE}
                strokeLinecap="butt"
                strokeDasharray={`${Math.max(0, presentArc - gap)} ${RING_LENGTH}`}
              />
              <Circle
                cx={CX}
                cy={CY}
                r={RING_RADIUS}
                fill="none"
                stroke={ABSENT_COLOUR}
                strokeWidth={RING_STROKE}
                strokeLinecap="butt"
                strokeDasharray={`${Math.max(0, absentArc - gap)} ${RING_LENGTH}`}
                strokeDashoffset={-presentArc}
              />
            </G>

            <SvgText
              x={CX}
              y={CY + 1}
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
              fill={COLORS.navy}
            >
              {missed}
            </SvgText>
            <SvgText
              x={CX}
              y={CY + 17}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              letterSpacing="0.6"
              fill={COLORS.faint}
            >
              MISSED
            </SvgText>

            {/* Each label's leader: a horizontal tick straight out of the
                ring's side, stopping where its box begins. */}
            <Polyline
              points={`${CX - LEADER_START},${CY} ${CX - LABEL_X},${CY}`}
              fill="none"
              stroke={PRESENT_COLOUR}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <Polyline
              points={`${CX + LEADER_START},${CY} ${CX + LABEL_X},${CY}`}
              fill="none"
              stroke={ABSENT_COLOUR}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </Svg>

          {scale ? (
            <>
              <View
                style={[
                  styles.donutLabel,
                  styles.donutLabelPresent,
                  {
                    right: drawnWidth - (CX - LABEL_X) * scale,
                    top: CY * scale - (DONUT_LABEL_H * scale) / 2,
                    height: DONUT_LABEL_H * scale,
                    // Never wider than the room between the card's edge and the
                    // tick this box hangs off.
                    maxWidth: (CX - LABEL_X) * scale - 1,
                  },
                ]}
              >
                {/* Word and count are ONE line of text inside the box. If the
                    room is tight the whole label shrinks, so the count is never
                    the part that gets cut. */}
                <Text
                  style={[styles.donutLabelText, { fontSize: 12 * scale }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  Present{' '}
                  <Text style={styles.donutLabelCount}>
                    {numberText(present)}
                  </Text>
                </Text>
              </View>

              <View
                style={[
                  styles.donutLabel,
                  styles.donutLabelAbsent,
                  {
                    left: (CX + LABEL_X) * scale,
                    top: CY * scale - (DONUT_LABEL_H * scale) / 2,
                    height: DONUT_LABEL_H * scale,
                    maxWidth: drawnWidth - (CX + LABEL_X) * scale - 1,
                  },
                ]}
              >
                <Text
                  style={[styles.donutLabelText, { fontSize: 12 * scale }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  Absent{' '}
                  <Text style={styles.donutLabelCount}>
                    {numberText(absent)}
                  </Text>
                </Text>
              </View>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

function OverallDashboard({
  data,
  live,
  birthdays,
  onOpenBirthdays,
  onOpenUntouchedUsers,
}) {
  const lastWeek = data?.attendance_last_4_week?.at(-1);
  const todayBirthdaysCount = (birthdays?.users || []).filter(
    user => user?.contact,
  ).length;

  const lastWeekRange = lastWeek ? weekRange(lastWeek.week_date) : null;
  // The week lives INSIDE `current_week` here: `live` is the whole
  // /dashboard/present-absent payload, where the web passes that block down as
  // `live`. Read off the wrong level, the tile fell back to a bare
  // "Present | Absent" instead of naming the week.
  const liveWeekRange = live?.current_week?.week_date
    ? weekRange(live.current_week.week_date, { live: true })
    : null;

  return (
    <>
      <View style={styles.grid}>
        <MetricCard
          icon="account-group-outline"
          label="Total Users"
          value={
            <CountWithDelta
              now={data?.total_users?.number}
              last={data?.total_users_last_week}
            />
          }
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
          detail={lastWeekRange ? `Week ${lastWeekRange}` : 'Present | Absent'}
        />
        <MetricCard
          icon="pulse"
          label="This week"
          value={
            live?.current_week ? (
              <PairValue
                present={live.current_week.present}
                absent={live.current_week.absent}
                presentDelta={live.current_week.present_delta}
              />
            ) : (
              '—'
            )
          }
          detail={liveWeekRange ? `Week ${liveWeekRange}` : 'Present | Absent'}
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
          onPress={onOpenUntouchedUsers}
        />
        <MetricCard
          icon="cake-variant"
          label="Follow-up Birthdays"
          value={birthdays?.error ? '—' : numberText(todayBirthdaysCount)}
          detail="Send wishes"
          tone="orange"
          action
          onPress={onOpenBirthdays}
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

function SelfDashboard({
  data,
  me,
  birthdays,
  events,
  thought,
  onOpenBirthdays,
  onPickMember,
  onOpenEvents,
}) {
  const attendance = data?.total_sabha_present;
  const recent = data?.present_in_last_4w;
  const lastSabha = data?.last_sabha;
  const lastSabhaDay = formatLastSabhaDay(lastSabha?.date);
  const sabhaAge = formatSabhaAge(data?.sabha_age);

  // WHICH four weeks the "3 / 4" is over — "(24-Aug - 20-Sep)". Read off the
  // 8-week series' last four OCCURRED rows, so the span names the same weeks
  // the ratio counts and the chart below plots. The not-yet-held week is left
  // out: the backend slides the window past it.
  const last4Range = (() => {
    const weeks = (Array.isArray(data?.last_8w) ? data.last_8w : [])
      .map(w => ({ w, key: readWeekDate(w?.week_date)?.key }))
      .filter(x => x.key && x.w?.status !== 'upcoming')
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .slice(-4);
    if (!weeks.length) return null;
    const start = weekRange(weeks[0].w.week_date)?.split(' to ')[0];
    const end = weekRange(weeks[weeks.length - 1].w.week_date)?.split(
      ' to ',
    )[1];
    return start && end ? `(${start} - ${end})` : null;
  })();

  return (
    <>
      {/* Rank >= 20 (canSeeNotLoggedIn) can pull up any member in their scope;
          the picked member's stats open in MemberStatsDialog. */}
      {canSeeNotLoggedIn(me?.role_id) ? (
        <View style={styles.searchPanel}>
          <MemberStatsSearch onPick={onPickMember} />
        </View>
      ) : null}
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
          detail={last4Range}
          tone="green"
        />
        <MetricCard
          // The date of that last Sabha rides in the LABEL — "Last Sabha
          // (18-Sep)" — leaving the value line to the one word that matters.
          icon={
            lastSabha?.attended
              ? 'check-circle-outline'
              : 'close-circle-outline'
          }
          iconBg={lastSabha?.attended ? COLORS.greenBg : COLORS.redBg}
          iconColor={lastSabha?.attended ? COLORS.green : COLORS.red}
          label={
            lastSabhaDay
              ? `Last Sabha\n(${lastSabhaDay.replace(' ', '-')})`
              : 'Last Sabha'
          }
          value={
            lastSabha ? (lastSabha.attended ? 'Attended' : 'Not Attended') : '—'
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
          onPress={onOpenBirthdays}
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
          // The coming occurrence of that weekday — "25-Sep-2026". The payload
          // holds a standing weekly slot and no date, so the day is worked out
          // here; location is deliberately not shown (it is null for most).
          detail={
            data?.upcoming_sabha
              ? (nextWeekdayDate(data.upcoming_sabha.day)?.date.replace(
                  / /g,
                  '-',
                ) ?? null)
              : 'No schedule set for your Sabha'
          }
        />
      </View>

      <EventsCard events={events} onViewAll={onOpenEvents} />
      <FriendsCard me={me} />
      <WeeklyAttendanceCard weeks={data?.last_8w} title="My Last 8 Weeks" />
      <YearAttendance year={data?.last_52w} />
    </>
  );
}

// Friendly, status-aware wording — never the raw backend/404 text. The API
// client throws an ApiError carrying the HTTP `status`.
function friendlyMemberError(error) {
  const status = error?.status;
  if (status === 403) {
    return "You don't have access to this member's dashboard — they may be outside your Sabha/Mandal.";
  }
  if (status === 404) {
    return "We couldn't find this member's records. They may have been moved or removed.";
  }
  if (status === 401) return 'Your session has expired. Please sign in again.';
  return 'Something went wrong loading the stats. Please check your connection and try again.';
}

/**
 * A member's "My Dashboard" figures, shown to a rank >= 20 leader for anyone in
 * their hierarchy — the web's MemberStatsDialog. Backed by
 * GET /dashboard-overview/member/{id}, which enforces scope + rank.
 *
 * Built from the same cards as SelfDashboard, minus the self-only ones
 * (birthdays, upcoming Sabha, events, today's thought).
 */
export function MemberStatsDialog({ userId, isOpen, onClose }) {
  // Only fetch while open, and re-fetch per member (the hook keys on userId).
  const query = useMemberStats(userId, isOpen);
  const d = query.data;
  const stats = d?.stats;
  const total = stats?.total_sabha_present;
  const last4 = stats?.present_in_last_4w;
  const lastSabha = stats?.last_sabha;
  const lastSabhaDay = formatLastSabhaDay(lastSabha?.date);
  const age = formatSabhaAge(stats?.sabha_age);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={d?.full_name || 'Member'}
      description={d?.sabha_name || undefined}
      size="lg"
    >
      {query.isLoading ? (
        <View style={styles.memberLoading}>
          <Skeleton style={styles.memberSkeletonTiles} />
          <Skeleton style={styles.memberSkeletonCard} />
        </View>
      ) : query.error ? (
        <View style={styles.memberError}>
          <Text style={styles.memberErrorTitle}>
            Couldn&apos;t load this member&apos;s stats
          </Text>
          <Text style={styles.memberErrorText}>
            {friendlyMemberError(query.error)}
          </Text>
          <Pressable
            onPress={() => query.refetch()}
            accessibilityRole="button"
            style={styles.memberRetry}
          >
            <Text style={styles.memberRetryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.grid}>
            <MetricCard
              icon="timer-sand"
              label="Sabha Age"
              value={age || '—'}
              detail={age ? null : 'Joining date not recorded'}
            />
            <MetricCard
              icon="calendar-clock"
              label="Total Sabha Attended"
              value={
                total ? (
                  <RatioValue part={total.attended} whole={total.total_sabha} />
                ) : (
                  '—'
                )
              }
              detail={total?.total_sabha ? null : 'No attendance recorded yet'}
              tone="orange"
            />
            <MetricCard
              icon="calendar-check-outline"
              label="Last 4 Weeks"
              value={
                last4 ? (
                  <RatioValue part={last4.attended} whole={last4.total} />
                ) : (
                  '—'
                )
              }
              tone="green"
            />
            <MetricCard
              icon={
                lastSabha?.attended
                  ? 'check-circle-outline'
                  : 'close-circle-outline'
              }
              label="Last Sabha"
              value={
                lastSabha ? (
                  <View style={styles.lastSabhaValue}>
                    <Text style={styles.metricValue} numberOfLines={1}>
                      {lastSabha.attended ? 'Attended' : 'Not Attended'}
                    </Text>
                    {lastSabhaDay ? (
                      <Text style={styles.metricDateSub} numberOfLines={1}>
                        {lastSabhaDay}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  '—'
                )
              }
              iconBg={lastSabha?.attended ? COLORS.greenBg : COLORS.redBg}
              iconColor={lastSabha?.attended ? COLORS.green : COLORS.red}
            />
          </View>

          {/* Spiritual friend (follow-up person) with Call + WhatsApp — the
              member's own card, keyed on the fields this endpoint returns. */}
          <FriendsCard
            title="Spiritual Friend"
            me={{
              followup_by_id_name: d?.spiritual_friend_name || null,
              followup_id_mobile: d?.spiritual_friend_mobile || null,
              followup_id_whatsapp: d?.spiritual_friend_whatsapp || null,
            }}
          />
          <WeeklyAttendanceCard weeks={stats?.last_8w} title="Last 8 Weeks" />
          <YearAttendance year={stats?.last_52w} title="Last 52 Weeks" />
        </>
      )}
    </Modal>
  );
}

export default function DashboardPage({
  onOpenHelp,
  onOpenMenu,
  onOpenBirthdays,
  onOpenNotLoggedIn,
  onOpenUntouchedUsers,
  onOpenEvents,
  onOpenNotifications,
  onRoleNameChange,
  onRoleIdChange,
}) {
  const { activeUserId } = useAuth();
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
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDownloading, setQrDownloading] = useState(false);

  useEffect(() => {
    if (me?.role_name) onRoleNameChange?.(me.role_name);
    if (me?.role_id != null) onRoleIdChange?.(me.role_id);
  }, [me?.role_id, me?.role_name, onRoleIdChange, onRoleNameChange]);
  /** The member whose stats modal is open, if any. */
  const [statsUserId, setStatsUserId] = useState(null);

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
        dashboardService.events('active'),
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
  const displayName = me?.user_name || me?.full_name || 'Bhoolku';

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
      <AppHeader
        onMenu={onOpenMenu}
        onHelp={canReadHelp(roleId) ? onOpenHelp : null}
        onNotifications={onOpenNotifications}
      />

      <View style={styles.flex1}>
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={styles.scroll}
          // A tap on a search result must reach it rather than only close the
          // keyboard.
          keyboardShouldPersistTaps="handled"
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

          {canSeeNotLoggedIn(roleId) ? (
            <NotLoginCard onPress={onOpenNotLoggedIn} />
          ) : null}

          {mayReadOverall ? (
            <View style={styles.tabs}>
              <Pressable
                onPress={() => setTab('overall')}
                style={[
                  styles.tab,
                  activeTab === 'overall' && styles.activeTab,
                ]}
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
              onOpenBirthdays={onOpenBirthdays}
              onOpenUntouchedUsers={onOpenUntouchedUsers}
            />
          ) : (
            <SelfDashboard
              data={data.self}
              me={me}
              birthdays={birthdays}
              events={events}
              thought={thought}
              onOpenBirthdays={onOpenBirthdays}
              onPickMember={setStatsUserId}
              onOpenEvents={onOpenEvents}
            />
          )}

          <View style={styles.footerBleed}>
            <SiteFooter />
          </View>
        </ScrollView>
      </View>

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
  drawerLogoFrame: {
    width: 80,
    height: 80,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 8,
  },
  drawerLogo: {
    width: 64,
    height: 64,
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
  // The web's `.panel` around the member search.
  searchPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E8EEF6',
    padding: 15,
    marginBottom: 16,
    elevation: 1,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  memberLoading: { gap: 15 },
  memberSkeletonTiles: { height: 105, width: '100%' },
  memberSkeletonCard: { height: 150, width: '100%' },
  memberError: { alignItems: 'center', paddingVertical: 38 },
  memberErrorTitle: {
    color: COLORS.navy,
    fontSize: 14.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  memberErrorText: {
    marginTop: 6,
    maxWidth: 300,
    color: COLORS.muted,
    fontSize: 14.5,
    textAlign: 'center',
  },
  memberRetry: {
    marginTop: 15,
    height: 34,
    paddingHorizontal: 19,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberRetryText: { color: COLORS.navy, fontSize: 14.5, fontWeight: '600' },
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
  metricCardPressed: { opacity: 0.75 },
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
  lastSabhaValue: {
    minWidth: 0,
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
  // The drawing keeps the web's proportions and scales with the card.
  donut: {
    width: '100%',
    maxWidth: VB_W,
    aspectRatio: VB_W / VB_H,
    alignSelf: 'center',
  },
  yearEmpty: {
    paddingVertical: 38,
    textAlign: 'center',
    fontSize: 14.5,
    color: COLORS.muted,
  },
  // Sized by its text, so the count can never sit on the border. The outline is
  // the wedge's own colour, faint enough not to compete with the ring.
  donutLabel: {
    position: 'absolute',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: COLORS.surface,
  },
  donutLabelPresent: { borderColor: 'rgba(21,128,61,0.45)' },
  donutLabelAbsent: { borderColor: 'rgba(233,135,138,0.45)' },
  donutLabelText: { fontWeight: '600', color: COLORS.muted },
  donutLabelCount: { fontWeight: '800', color: COLORS.navy },
  sevaPanel: { alignItems: 'center' },
  sevaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: 10,
    marginBottom: 2,
  },
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
  greenText: { color: COLORS.green, fontWeight: '800', fontSize: 18 },
  redText: { color: COLORS.red, fontWeight: '800', fontSize: 18 },
  // The change badge rides a size below the figure it qualifies.
  deltaUp: { color: COLORS.green, fontWeight: '700', fontSize: 13 },
  deltaDown: { color: COLORS.red, fontWeight: '700', fontSize: 13 },
  navyText: { color: COLORS.navy, fontWeight: '800', fontSize: 18 },
});
