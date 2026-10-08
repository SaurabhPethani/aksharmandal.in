import React, {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  BackHandler,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import SiteFooter from '../components/SiteFooter';
import ScrollViewWithTop from '../components/ScrollToTop';
import AppHeader from '../components/AppHeader';
import { Text } from '../components/Typography';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../components/ui';
import { Modal } from '../components/Overlays';
import { DialogCancel } from '../components/FormDialog';
import { Breadcrumbs, Tabs } from '../components/Navigation';
import { FormField, Textarea } from '../components/form';
import {
  useBirthdaysWeek,
  useMyBirthdayWishes,
  useSendBirthdayWish,
} from '../hooks/useBirthdays';
import { useMyPermissions } from '../hooks/useMyPermissions';
import { birthdayMessage } from '../utils/birthdayWish';
import { hasMobile, telUrl, whatsAppUrl } from '../utils/contact';
import { readDate } from '../utils/dates';
import { FONT_DISPLAY } from '../constants/typography';
import {
  COLORS,
  RADII,
  SHADOWS,
  TEXT,
  TNUM,
  WEIGHT,
  space,
} from '../constants/theme';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
];

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Days either side of today the week spans — the backend's `_BIRTHDAY_WEEK_RADIUS`. */
const WEEK_RADIUS = 3;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

const weekday = d => WEEKDAYS[d.getDay()].slice(0, 3);

/** "Fri, 2 Oct" */
const shortDate = d => `${weekday(d)}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** "02 Oct" */
const dayMonth = d =>
  `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;

/** How a row's day reads against today, from its signed `days_away`. */
function relativeDay(n) {
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  if (n === 1) return 'Tomorrow';
  return n < 0 ? `${-n} days ago` : `in ${n} days`;
}

function ageText(age, zone) {
  if (age == null) return null;
  if (zone === 'today') return `turns ${age} today`;
  if (zone === 'recent') return `turned ${age}`;
  return `turns ${age}`;
}

const nameOf = row =>
  String(row?.user_name ?? '').trim() || `Member #${row?.user_id ?? ''}`;

// The row's buttons are small; this widens what a finger can hit without
// reaching the button beside it.
const ACTION_SLOP = { top: 8, bottom: 8, left: 3, right: 3 };

function LinearFill({ id, stops, radius = 0 }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {stops.map(([offset, color]) => (
              <Stop key={offset} offset={offset} stopColor={color} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect
          width="100%"
          height="100%"
          rx={radius}
          ry={radius}
          fill={`url(#${id})`}
        />
      </Svg>
    </View>
  );
}

/** The avatar disc every row leads with. */
function Initial({ name }) {
  return (
    <View style={styles.initialShadow}>
      <View style={styles.initial}>
        <LinearFill
          id="initial"
          stops={[
            [0, '#FBBF24'],
            [1, '#F97316'],
          ]}
        />
        <Text style={styles.initialText}>
          {String(name ?? '?')
            .charAt(0)
            .toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

/** Filled star — the caller's personal follow-up. */
function PersonalStar() {
  return (
    <MaterialCommunityIcons
      name="star"
      size={space(3.5)}
      color={COLORS.accent}
      accessibilityLabel="Your personal follow-up"
    />
  );
}

/** Crown — the caller's leader (follow-up sevak, Sabha or Mandal Head / DB Manager). */
function LeaderCrown() {
  return (
    <MaterialCommunityIcons
      name="crown"
      size={space(3.5)}
      color={COLORS.primary}
      accessibilityLabel="Your leader"
    />
  );
}

/** The backend sends `followup_name` only to callers of rank >= 20. */
function LeaderMeta({ row }) {
  if (!row?.followup_name) return null;
  return (
    <Text style={[styles.metaText, styles.followup]} numberOfLines={1}>
      <Text style={styles.metaLabel}>Follow-up:</Text>{' '}
      <Text style={styles.metaValue}>{row.followup_name}</Text>
    </Text>
  );
}

/**
 * SPENT FOR THE DAY. `already_wished` is the server's answer, OR'd with the
 * wishes sent from this page so the button flips before the list is re-read.
 */
function WishButton({ row, sent, onPress }) {
  const done = sent || row?.already_wished === true;
  return (
    <Button
      variant={done ? 'ghost' : 'outline'}
      style={styles.wishButton}
      textStyle={styles.wishButtonText}
      onPress={onPress}
      hitSlop={ACTION_SLOP}
      disabled={done || row?.user_id == null}
      accessibilityLabel={
        done
          ? `You have already wished ${nameOf(row)} today`
          : `Wish ${nameOf(row)}`
      }
    >
      <MaterialCommunityIcons
        name={done ? 'check' : 'party-popper'}
        size={space(3.5)}
      />
      {done ? 'Sent' : 'Wish'}
    </Button>
  );
}

/** On a day already gone: the caller did wish this member on their birthday. */
function SentTag() {
  return (
    <View
      style={styles.sentTag}
      accessible
      accessibilityLabel="You wished this member on their birthday"
    >
      <MaterialCommunityIcons
        name="check"
        size={space(3.5)}
        color={COLORS.primary}
      />
      <Text style={styles.sentTagText}>Sent</Text>
    </View>
  );
}

function RoundLink({ id, label, url, icon, stops }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      hitSlop={ACTION_SLOP}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.roundLink,
        pressed && styles.roundLinkPressed,
      ]}
    >
      <LinearFill id={id} stops={stops} />
      <MaterialCommunityIcons
        name={icon}
        size={space(4)}
        color={COLORS.white}
      />
    </Pressable>
  );
}

/** Ring the member and wish them out loud. */
function CallButton({ row, mobile }) {
  if (!hasMobile(mobile)) return null;
  return (
    <RoundLink
      id="call"
      label={`Call ${nameOf(row)}`}
      url={telUrl(mobile)}
      icon="phone"
      stops={[
        [0, '#0A5C96'],
        [1, '#003158'],
      ]}
    />
  );
}

/** Composes the wish and hands it to WhatsApp, from the reader's own number. */
function WhatsAppButton({ row, mobile, sender, belated = false }) {
  if (!hasMobile(mobile)) return null;
  // The member's WhatsApp number, falling back to the calling number.
  const whatsapp = row?.whatsapp_number || mobile;
  return (
    <RoundLink
      id="whatsapp"
      label={`Wish ${nameOf(row)} on WhatsApp`}
      url={whatsAppUrl(
        whatsapp,
        birthdayMessage(nameOf(row), sender, { belated }),
      )}
      icon="whatsapp"
      stops={[
        [0, '#25D366'],
        [1, '#128C7E'],
      ]}
    />
  );
}

const TOAST_TONES = {
  success: { icon: 'check-circle-outline', backgroundColor: COLORS.successFg },
  info: { icon: 'information-outline', backgroundColor: COLORS.primary },
};

/** The web's toast, as a notice at the top of the tab. */
function Toast({ toast, onDismiss }) {
  const tone = TOAST_TONES[toast.tone] ?? TOAST_TONES.info;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.toast, { backgroundColor: tone.backgroundColor }]}
    >
      <MaterialCommunityIcons
        name={tone.icon}
        size={space(5)}
        color={COLORS.white}
        style={styles.toastIcon}
      />
      <Text style={styles.toastText}>{toast.message}</Text>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={({ pressed }) => [
          styles.toastClose,
          pressed && styles.toastClosePressed,
        ]}
      >
        <MaterialCommunityIcons
          name="close"
          size={space(4)}
          color="rgba(255,255,255,0.75)"
        />
      </Pressable>
    </View>
  );
}

/**
 * The wish itself — one field and a Send button. The field starts with the
 * full greeting and stays editable; Send is disabled while it is blank. Sealed
 * while sending, so the row can always say whether the wish went.
 */
function WishDialog({ person, sender, isOpen, onClose, onSent, onToast }) {
  const wish = useSendBirthdayWish();
  const greeting = person
    ? birthdayMessage(nameOf(person), sender, { bold: false })
    : '';
  const [message, setMessage] = useState(greeting);
  const [failure, setFailure] = useState(null);

  // Back to the greeting for each person, so a message typed for one member is
  // never sent to the next. Not on `greeting` itself: that would reset the
  // field mid-edit.
  useEffect(() => {
    if (isOpen) {
      setMessage(greeting);
      setFailure(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, person?.user_id]);

  const text = message.trim();

  const send = async () => {
    if (!text || person?.user_id == null) return;
    setFailure(null);
    try {
      const res = await wish.mutateAsync({
        userId: person.user_id,
        message: text,
      });
      onSent(person.user_id);
      onClose();
      // "Queued", not "delivered": the record comes back `status: pending`.
      onToast({
        tone: 'success',
        message: res?.detail || `Birthday wish queued for ${nameOf(person)}.`,
      });
    } catch (err) {
      // 409 is the API refusing a second wish today — what the member wanted is
      // already true, so the row is marked and the dialog closes as on a send.
      if (err?.status === 409) {
        onSent(person.user_id);
        onClose();
        onToast({
          tone: 'info',
          message:
            err?.detail ||
            err?.message ||
            `You have already wished ${nameOf(person)} today.`,
        });
        return;
      }
      setFailure(err?.detail || err?.message || 'Could not send the wish.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!wish.isPending}
      title="Send Birthday Wish"
      description={person ? `To ${nameOf(person)}` : undefined}
      footer={
        <>
          <DialogCancel variant="ghost" disabled={wish.isPending} />
          <Button
            variant="accent"
            onPress={send}
            busy={wish.isPending}
            disabled={!text}
          >
            <MaterialCommunityIcons name="party-popper" size={space(4)} />
            Send
          </Button>
        </>
      }
    >
      <FormField label="Message" required error={failure}>
        <Textarea
          rows={11}
          value={message}
          onChangeText={setMessage}
          editable={!wish.isPending}
          placeholder="Write your wish…"
          error={Boolean(failure)}
        />
      </FormField>
    </Modal>
  );
}

/** A line per symbol that actually appears in the rows on screen. */
function Legend({ rows }) {
  const hasPersonal = rows.some(r => r?.tier === 'personal');
  const hasLeader = rows.some(r => r?.is_leader === true);
  if (!hasPersonal && !hasLeader) return null;
  return (
    <View style={styles.legend}>
      {hasPersonal && (
        <View style={styles.legendItem}>
          <PersonalStar />
          <Text style={styles.legendText}>= your personal follow-up</Text>
        </View>
      )}
      {hasLeader && (
        <View style={styles.legendItem}>
          <LeaderCrown />
          <Text style={styles.legendText}>= your leader</Text>
        </View>
      )}
    </View>
  );
}

/** The amber card for a day, or a whole week, with no birthdays. */
function Quiet({ title, hint, large = false }) {
  return (
    <View style={[styles.quiet, large && styles.quietLarge]}>
      <LinearFill
        id="quiet"
        stops={[
          [0, '#FEF3C7'],
          [0.5, '#FFEDD5'],
          [1, '#FFE4CC'],
        ]}
      />
      <View style={[styles.quietIcon, large && styles.quietIconLarge]}>
        <MaterialCommunityIcons
          name="cake-variant-outline"
          size={space(large ? 7 : 6)}
          color="#B45309"
        />
      </View>
      <Text style={styles.quietTitle}>{title}</Text>
      <Text style={styles.quietHint}>{hint}</Text>
    </View>
  );
}

/**
 * Seven cells, today-3 .. today+3, each with its count. Also a filter: tapping
 * a day narrows the list to it, tapping it again shows the whole week. A day
 * with no birthdays is not tappable.
 */
function DateStrip({ base, rows, selected, onSelect }) {
  const cells = [];
  for (let n = -WEEK_RADIUS; n <= WEEK_RADIUS; n += 1) {
    cells.push({
      n,
      d: addDays(base, n),
      count: rows.filter(r => r?.days_away === n).length,
    });
  }
  return (
    <View style={styles.strip}>
      {cells.map(({ n, d, count }) => {
        const isToday = n === 0;
        const isSelected = selected === n;
        const tappable = count > 0;
        return (
          <Pressable
            key={n}
            disabled={!tappable}
            onPress={() => onSelect(isSelected ? null : n)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: !tappable }}
            accessibilityLabel={`${WEEKDAYS[d.getDay()]} ${d.getDate()} ${
              MONTHS[d.getMonth()]
            } — ${count} ${count === 1 ? 'birthday' : 'birthdays'}`}
            style={({ pressed }) => [
              styles.cell,
              isToday && styles.cellToday,
              pressed && styles.cellPressed,
              isSelected && styles.cellSelected,
              isSelected && pressed && styles.cellSelectedPressed,
              !tappable && styles.cellQuiet,
            ]}
          >
            <Text
              style={[
                styles.cellDay,
                isToday && styles.inkToday,
                isSelected && styles.inkSelectedSoft,
              ]}
            >
              {weekday(d)}
            </Text>
            <Text
              style={[
                styles.cellDate,
                isToday && styles.inkToday,
                isSelected && styles.inkSelected,
              ]}
            >
              {d.getDate()}
            </Text>
            {/* An em dash on a quiet day: a bare "0" reads as a broken cell. */}
            <Text
              style={[
                styles.cellCount,
                count > 0 && styles.cellCountSome,
                count > 0 && isToday && styles.cellCountToday,
                isSelected && styles.cellCountSelected,
              ]}
            >
              {count || '—'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const ZONES = {
  today: { label: 'Today', icon: 'cake-variant-outline', hint: null },
  upcoming: {
    label: 'Upcoming',
    icon: 'calendar-clock-outline',
    hint: 'coming up — wish ahead by WhatsApp if you like',
  },
  recent: {
    label: 'Recent',
    icon: 'history',
    hint: 'just gone — a belated wish still lands',
  },
};

/**
 * The in-app Wish is a TODAY-only act — the API records it against the
 * birthday itself. Call and WhatsApp carry no date rule, so they stay on every
 * row the caller may reach.
 */
const BirthdayCard = memo(function BirthdayCard({
  row,
  zone,
  base,
  sender,
  sent,
  onWish,
}) {
  const isToday = zone === 'today';
  const personal = row?.tier === 'personal';
  const leader = row?.is_leader === true;
  // Only rows the caller may reach carry a number at all.
  const mobile = row?.contact === true ? (row?.mobile_number ?? null) : null;
  const reachable = hasMobile(mobile);
  const wished = !isToday && row?.already_wished === true;
  const name = nameOf(row);
  const age = ageText(row?.age, zone);

  return (
    <View
      style={[
        styles.row,
        leader && styles.rowLeader,
        personal && styles.rowPersonal,
      ]}
    >
      <Initial name={name} />

      <View style={styles.member}>
        <View style={styles.nameLine}>
          <Text style={styles.name}>{name}</Text>
          {personal && <PersonalStar />}
          {leader && <LeaderCrown />}
        </View>

        <View style={styles.dateLine}>
          <MaterialCommunityIcons
            name="cake-variant-outline"
            size={space(3)}
            color={COLORS.textMuted}
          />
          <Text style={styles.metaText}>
            {shortDate(addDays(base, row.days_away))} ·{' '}
            {relativeDay(row.days_away)}
          </Text>
        </View>

        {row?.sabha_name || age ? (
          <View style={styles.sabhaLine}>
            {row?.sabha_name ? (
              <Text style={styles.metaText}>
                <Text style={styles.metaLabel}>Sabha:</Text>{' '}
                <Text style={styles.metaValue}>{row.sabha_name}</Text>
              </Text>
            ) : null}
            {age ? (
              <View style={styles.agePill}>
                <Text style={styles.ageText}>{age}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {mobile ? <Text style={styles.mobile}>{mobile}</Text> : null}
        <LeaderMeta row={row} />

        {isToday || wished || reachable ? (
          <View style={styles.actions}>
            {isToday && (
              <WishButton
                row={row}
                sent={sent}
                onPress={() => onWish(row)}
              />
            )}
            {wished && <SentTag />}
            {reachable && (
              <>
                <CallButton row={row} mobile={mobile} />
                <WhatsAppButton
                  row={row}
                  mobile={mobile}
                  sender={sender}
                  belated={zone === 'recent'}
                />
              </>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
});

/** One group of rows under its heading. `label` and `hint` override the zone's own. */
function ZoneRows({ zone, rows, label, hint, sent, ...card }) {
  if (rows.length === 0) return null;
  const meta = ZONES[zone];
  const note = hint !== undefined ? hint : meta.hint;

  return (
    <View style={styles.zone}>
      <View style={styles.zoneHead}>
        <View style={styles.zoneTitle}>
          <MaterialCommunityIcons
            name={meta.icon}
            size={space(4)}
            color={COLORS.accent}
          />
          <Text style={styles.zoneLabel}>{label ?? meta.label}</Text>
        </View>
        <Text style={styles.zoneCount}>
          {rows.length} {rows.length === 1 ? 'birthday' : 'birthdays'}
          {note ? ` · ${note}` : ''}
        </Text>
      </View>

      {rows.map((row, i) => (
        <BirthdayCard
          key={row?.user_id ?? `row-${i}`}
          row={row}
          zone={zone}
          sent={sent.has(row?.user_id)}
          {...card}
        />
      ))}
    </View>
  );
}

/** The rows under the strip: one day when `selected` is an offset, else the week. */
const WeekList = memo(function WeekList({
  rows,
  groups,
  selected,
  onSelect,
  ...card
}) {
  const total =
    groups.recent.length + groups.today.length + groups.upcoming.length;

  if (total === 0) {
    return (
      <Quiet
        large
        title="No birthdays this week"
        hint="Nobody in your scope is celebrating in the next few days — check back soon."
      />
    );
  }

  if (selected === null) {
    return (
      <>
        <Legend rows={rows} />
        <ZoneRows zone="recent" rows={groups.recent} {...card} />
        <ZoneRows zone="today" rows={groups.today} {...card} />
        <ZoneRows zone="upcoming" rows={groups.upcoming} {...card} />
      </>
    );
  }

  const dayRows = rows.filter(r => r?.days_away === selected);
  const day = shortDate(addDays(card.base, selected));

  return (
    <>
      <Pressable
        onPress={() => onSelect(null)}
        accessibilityRole="button"
        hitSlop={WEEK_LINK_SLOP}
        style={styles.weekLink}
      >
        {({ pressed }) => (
          <>
            <MaterialCommunityIcons
              name="history"
              size={space(3.5)}
              color={COLORS.accent}
            />
            <Text
              style={[styles.weekLinkText, pressed && styles.weekLinkPressed]}
            >
              Show the whole week
            </Text>
          </>
        )}
      </Pressable>
      {dayRows.length > 0 ? (
        <>
          <Legend rows={dayRows} />
          <ZoneRows
            zone={selected === 0 ? 'today' : selected < 0 ? 'recent' : 'upcoming'}
            rows={dayRows}
            label={day}
            hint={relativeDay(selected)}
            {...card}
          />
        </>
      ) : (
        <Quiet
          title={`No birthdays ${selected === 0 ? 'today' : `on ${day}`}`}
          hint="Pick another day above, or show the whole week."
        />
      )}
    </>
  );
});

/**
 * TAB 1 — the 7-day window, grouped Recent / Today / Upcoming. Opens on today;
 * the whole week is reached from the link or by tapping the selected day again.
 */
function WeekWishes() {
  const { rows, isPending, error, refetch } = useBirthdaysWeek();
  // Signs the greeting: "From Sevak, <name>".
  const sender = useMyPermissions().data?.userName;
  /** user_ids wished from this page — see WishButton. */
  const [sent, setSent] = useState(() => new Set());
  const markSent = id => setSent(prev => new Set(prev).add(id));
  /** The member the wish dialog is open for, if any. */
  const [wishing, setWishing] = useState(null);
  const [toast, setToast] = useState(null);
  /** The day the strip has filtered to — a signed offset, or null for the week. */
  const [selected, setSelected] = useState(0);
  // The strip answers a tap at once; the rows, which are the slow part to
  // draw, follow it.
  const listed = useDeferredValue(selected);
  // Fixed for the life of the view, so the strip does not drift at midnight.
  const base = useMemo(() => startOfToday(), []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const groups = useMemo(() => {
    const dated = rows.filter(r => Number.isFinite(r?.days_away));
    return {
      // Closest day first; the backend's leader-then-tier order breaks ties.
      recent: dated
        .filter(r => r.days_away < 0)
        .sort((a, b) => b.days_away - a.days_away),
      today: dated.filter(r => r.days_away === 0),
      upcoming: dated
        .filter(r => r.days_away > 0)
        .sort((a, b) => a.days_away - b.days_away),
    };
  }, [rows]);

  let content;
  if (isPending) {
    content = (
      <Card style={styles.skeletons}>
        {[0, 1, 2, 3, 4].map(i => (
          <Skeleton key={i} style={styles.skeletonRow} />
        ))}
      </Card>
    );
  } else if (error) {
    content = (
      <Card>
        <ErrorState
          error={error}
          onRetry={refetch}
          title="Could not load this week’s birthdays"
        />
      </Card>
    );
  } else {
    const total =
      groups.recent.length + groups.today.length + groups.upcoming.length;
    const filtered = selected !== null;
    const dayRows = filtered ? rows.filter(r => r?.days_away === selected) : [];
    const card = { base, sender, sent, onWish: setWishing };

    content = (
      <>
        <DateStrip
          base={base}
          rows={rows}
          selected={selected}
          onSelect={setSelected}
        />

        {total === 0 ? (
          <Quiet
            large
            title="No birthdays this week"
            hint="Nobody in your scope is celebrating in the next few days — check back soon."
          />
        ) : filtered ? (
          <>
            <Pressable
              onPress={() => setSelected(null)}
              accessibilityRole="button"
              hitSlop={8}
              style={styles.weekLink}
            >
              {({ pressed }) => (
                <>
                  <MaterialCommunityIcons
                    name="history"
                    size={space(3.5)}
                    color={COLORS.accent}
                  />
                  <Text
                    style={[
                      styles.weekLinkText,
                      pressed && styles.weekLinkPressed,
                    ]}
                  >
                    Show the whole week
                  </Text>
                </>
              )}
            </Pressable>
            {dayRows.length > 0 ? (
              <>
                <Legend rows={dayRows} />
                <ZoneRows
                  zone={
                    selected === 0
                      ? 'today'
                      : selected < 0
                        ? 'recent'
                        : 'upcoming'
                  }
                  rows={dayRows}
                  label={shortDate(addDays(base, selected))}
                  hint={relativeDay(selected)}
                  {...card}
                />
              </>
            ) : (
              <Quiet
                title={`No birthdays ${
                  selected === 0
                    ? 'today'
                    : `on ${shortDate(addDays(base, selected))}`
                }`}
                hint="Pick another day above, or show the whole week."
              />
            )}
          </>
        ) : (
          <>
            <Legend rows={rows} />
            <ZoneRows zone="recent" rows={groups.recent} {...card} />
            <ZoneRows zone="today" rows={groups.today} {...card} />
            <ZoneRows zone="upcoming" rows={groups.upcoming} {...card} />
          </>
        )}
      </>
    );
  }

  return (
    <>
      {toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
      {content}
      {/* One dialog for the whole page — `wishing` carries whose birthday it is. */}
      <WishDialog
        person={wishing}
        sender={sender}
        isOpen={Boolean(wishing)}
        onClose={() => setWishing(null)}
        onSent={markSent}
        onToast={setToast}
      />
    </>
  );
}

/**
 * TAB 2 — the wishes the signed-in member has RECEIVED. The message is the
 * whole point of the row; the sender and the date are the caption under it.
 */
function ReceivedWishes() {
  const { rows, isPending, error, refetch } = useMyBirthdayWishes();

  if (isPending) {
    return (
      <Card style={styles.skeletons}>
        {[0, 1, 2].map(i => (
          <Skeleton key={i} style={styles.skeletonWish} />
        ))}
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <ErrorState
          error={error}
          onRetry={refetch}
          title="Could not load your wishes"
        />
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="gift-outline"
          title="No wishes yet"
          hint="Wishes sent to you on your birthday will appear here."
        />
      </Card>
    );
  }

  return (
    <View style={styles.table}>
      <View style={styles.tableClip}>
        <Text style={styles.wishCount}>
          {rows.length === 1
            ? 'One wish for you'
            : `${rows.length} wishes for you`}
        </Text>
        {rows.map((wish, i) => {
          const from =
            wish?.send_user_name ||
            wish?.sender_name ||
            wish?.from_user_name ||
            wish?.user_name ||
            'A member';
          const when = readDate(wish?.wish_date);

          return (
            <View key={wish?.id ?? i} style={styles.wishRow}>
              <Initial name={from} />
              <View style={styles.member}>
                <Text style={styles.wishMessage}>{wish?.message || '—'}</Text>
                <Text style={styles.wishCaption}>
                  <Text style={styles.wishFrom}>{from}</Text>
                  {when ? <Text style={TNUM}> · {when.date}</Text> : null}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const TABS = [
  { value: 'send', label: 'This week' },
  { value: 'received', label: 'My Wishes' },
];

export default function BirthdaysPage({
  onBack,
  onMenu,
  onHelp,
  onNotifications,
  onOpenPrivacy,
  onOpenTerms,
  onOpenDeleteAccount,
  onProfile,
}) {
  const [tab, setTab] = useState('send');

  // Android's back button goes where the breadcrumb does.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const base = startOfToday();
  const weekRange = `${dayMonth(addDays(base, -WEEK_RADIUS))} – ${dayMonth(
    addDays(base, WEEK_RADIUS),
  )}`;

  return (
    <View style={styles.screen}>
      {/* The app's own bar, as every registered screen carries it. */}
      <AppHeader
        onMenu={onMenu}
        onHelp={onHelp}
        onNotifications={onNotifications}
        onProfile={onProfile}
        onBack={onBack}
        // breadcrumbs={['Dashboard', 'Birthdays']}
      />

      <ScrollViewWithTop
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader
          title="Birthdays"
          subtitle={
            tab === 'received'
              ? 'Wishes sent to you'
              : `This week · ${weekRange}`
          }
          breadcrumbs={
            <Breadcrumbs items={[{ label: 'Birthdays' }]} onHome={onBack} />
          }
        />

        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <View style={styles.tabBody}>
          {tab === 'received' ? <ReceivedWishes /> : <WeekWishes />}
        </View>

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
  screen: { flex: 1, backgroundColor: COLORS.bg },
  // The web's page ground, and the dashboard's own padding and footer bleed.
  page: { flex: 1, backgroundColor: COLORS.bg },
  pageContent: { flexGrow: 1, padding: 16, paddingBottom: 0 },
  footerBleed: { marginTop: 'auto', marginHorizontal: -16, paddingTop: 14 },
  tabBody: { marginTop: space(5), gap: space(5) },

  skeletons: { gap: space(2) },
  skeletonRow: { height: space(12), width: '100%' },
  skeletonWish: { height: space(16), width: '100%' },

  strip: { flexDirection: 'row', gap: space(1.5) },
  cell: {
    flex: 1,
    alignItems: 'center',
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(1),
    paddingVertical: space(2),
  },
  cellToday: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(255,134,42,0.1)',
  },
  cellPressed: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(255,134,42,0.22)',
  },
  cellSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  cellSelectedPressed: {
    borderColor: COLORS.accentHover,
    backgroundColor: COLORS.accentHover,
  },
  cellQuiet: { opacity: 0.6 },
  cellDay: { fontSize: 11, color: COLORS.textFaint },
  cellDate: {
    fontSize: TEXT.base,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  cellCount: { ...TNUM, fontSize: 11, color: COLORS.textFaint },
  cellCountSome: { color: COLORS.textMuted },
  cellCountToday: { fontWeight: WEIGHT.semibold, color: COLORS.accent },
  cellCountSelected: {
    fontWeight: WEIGHT.semibold,
    color: 'rgba(255,255,255,0.9)',
  },
  inkToday: { color: COLORS.accent },
  inkSelected: { color: COLORS.white },
  inkSelectedSoft: { color: 'rgba(255,255,255,0.9)' },

  // Padded to a finger-sized box; the negative margin gives the space back.
  weekLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    paddingVertical: space(3),
    marginVertical: -space(3),
  },
  weekLinkText: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.accent,
  },
  weekLinkPressed: { textDecorationLine: 'underline' },

  zone: { gap: space(2) },
  zoneHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space(2),
    rowGap: space(0.5),
    paddingHorizontal: space(1),
  },
  zoneTitle: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  zoneLabel: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  zoneCount: { fontSize: TEXT.xs, color: COLORS.textMuted },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(3),
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    padding: space(4),
    ...SHADOWS.card,
  },
  rowPersonal: { borderColor: 'rgba(255,134,42,0.4)' },
  rowLeader: { borderColor: 'rgba(0,49,88,0.3)' },
  member: { flex: 1, minWidth: 0 },
  nameLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space(1.5),
  },
  name: {
    flexShrink: 1,
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  dateLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    marginTop: space(1),
  },
  sabhaLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space(2),
    rowGap: space(1),
    marginTop: space(1),
  },
  agePill: {
    borderRadius: RADII.full,
    backgroundColor: 'rgba(255,134,42,0.1)',
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  ageText: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    textTransform: 'capitalize',
    color: COLORS.accent,
  },
  mobile: {
    ...TNUM,
    marginTop: space(1),
    fontSize: TEXT.xs,
    color: COLORS.textMuted,
  },
  followup: { marginTop: space(1) },
  metaText: { fontSize: TEXT.xs, color: COLORS.textMuted },
  metaLabel: { color: COLORS.textFaint },
  metaValue: { fontWeight: WEIGHT.medium },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
    marginTop: space(3),
  },

  // `!py-2 !text-xs` on the web's Button
  wishButton: { paddingVertical: space(2) },
  wishButtonText: { fontSize: TEXT.xs },

  sentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    borderRadius: RADII.control,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(2),
    paddingVertical: space(1),
  },
  sentTagText: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },

  roundLink: {
    width: space(9),
    height: space(9),
    borderRadius: RADII.control,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundLinkPressed: { transform: [{ scale: 1.05 }] },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space(4),
    rowGap: space(1),
    paddingHorizontal: space(1),
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  legendText: { fontSize: TEXT.xs, color: COLORS.textMuted },

  quiet: {
    alignItems: 'center',
    borderRadius: RADII.card,
    overflow: 'hidden',
    paddingHorizontal: space(6),
    paddingVertical: space(10),
  },
  quietLarge: { paddingVertical: space(12) },
  quietIcon: {
    width: space(12),
    height: space(12),
    borderRadius: RADII['2xl'],
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietIconLarge: {
    width: space(14),
    height: space(14),
    marginBottom: space(1),
  },
  quietTitle: {
    marginTop: space(3),
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.base,
    fontWeight: WEIGHT.bold,
    color: '#7C2D12',
    textAlign: 'center',
  },
  quietHint: {
    marginTop: space(1),
    fontSize: TEXT.sm,
    color: '#9A3412',
    textAlign: 'center',
  },

  // .card with p-0 — the shadow on the outer view, the clip on the inner, as
  // `overflow: hidden` would cut the shadow off on iOS.
  table: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  tableClip: { borderRadius: RADII.card - 1, overflow: 'hidden' },

  wishCount: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: '#9A3412',
  },
  wishRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(3),
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  wishMessage: { fontSize: TEXT.sm, color: COLORS.primary },
  wishCaption: {
    marginTop: space(0.5),
    fontSize: TEXT.xs,
    color: COLORS.textMuted,
  },
  wishFrom: { fontWeight: WEIGHT.semibold },

  // box-shadow: 0 4px 10px rgba(251,146,60,0.30)
  initialShadow: {
    width: space(10),
    height: space(10),
    borderRadius: RADII.full,
    backgroundColor: '#F97316',
    shadowColor: '#FB923C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  initial: {
    flex: 1,
    borderRadius: RADII.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    fontSize: TEXT.base,
    fontWeight: WEIGHT.bold,
    color: COLORS.white,
  },

  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(3),
    borderRadius: RADII.card,
    padding: space(3.5),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 6,
  },
  toastIcon: { marginTop: space(0.5) },
  toastText: {
    flex: 1,
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.medium,
    color: COLORS.white,
  },
  toastClose: { padding: space(1), borderRadius: RADII.lg },
  toastClosePressed: { backgroundColor: 'rgba(255,255,255,0.2)' },
});
