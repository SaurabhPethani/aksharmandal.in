import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import SiteFooter from '../components/SiteFooter';
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
import { Breadcrumbs, Tabs } from '../components/Navigation';
import { FormField, Textarea } from '../components/form';
import {
  useMyBirthdayWishes,
  useSendBirthdayWish,
  useTodayBirthdays,
} from '../hooks/useBirthdays';
import { DEFAULT_WISH, birthdayMessage } from '../utils/birthdayWish';
import { hasMobile, telUrl, whatsAppUrl } from '../utils/contact';
import { readDate } from '../utils/dates';
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

const todayLabel = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const nameOf = row =>
  String(row?.user_name ?? '').trim() || `Member #${row?.user_id ?? ''}`;

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

/**
 * Filled in by the backend only for callers of rank >= 20, so it is gated by
 * the data being there. The follow-up name shows on every enriched row; the
 * last-Sabha status only on rows the caller may contact.
 */
function LeaderMeta({ row }) {
  const hasFollowup = Boolean(row?.followup_name);
  const hasStatus = row?.contact === true && row?.last_sabha_attended != null;
  if (!hasFollowup && !hasStatus) return null;

  const day = row?.last_sabha_date
    ? readDate(row.last_sabha_date)?.date.replace(/\s\d{4}$/, '') || null
    : null;

  return (
    <View style={styles.meta}>
      {hasFollowup && (
        <Text style={styles.metaText} numberOfLines={1}>
          <Text style={styles.metaLabel}>Follow-up:</Text>{' '}
          <Text style={styles.metaValue}>{row.followup_name}</Text>
        </Text>
      )}
      {hasStatus && (
        <Text style={styles.metaText} numberOfLines={1}>
          <Text style={styles.metaLabel}>Last Sabha:</Text>{' '}
          <Text
            style={row.last_sabha_attended ? styles.attended : styles.absent}
          >
            {row.last_sabha_attended ? 'Attended' : 'Absent'}
          </Text>
          {day ? <Text style={TNUM}> · {day}</Text> : null}
        </Text>
      )}
    </View>
  );
}

/**
 * SPENT FOR THE DAY. `already_wished` is the server's answer, OR'd with the
 * wishes sent from this modal so the button flips before the list is re-read.
 */
function WishButton({ row, sent, onPress }) {
  const done = sent || row?.already_wished === true;
  return (
    <Button
      variant={done ? 'ghost' : 'outline'}
      style={styles.wishButton}
      textStyle={styles.wishButtonText}
      onPress={onPress}
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

function RoundLink({ id, label, url, icon, stops }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
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
function WhatsAppButton({ row, mobile }) {
  if (!hasMobile(mobile)) return null;
  // The member's WhatsApp number, falling back to the calling number.
  const whatsapp = row?.whatsapp_number || mobile;
  return (
    <RoundLink
      id="whatsapp"
      label={`Wish ${nameOf(row)} on WhatsApp`}
      url={whatsAppUrl(whatsapp, birthdayMessage(nameOf(row)))}
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
 * The wish itself — one field and a Send button. The message is the sender's
 * own words, so it is shown and editable rather than sent silently, and Send
 * stays disabled while it is blank. Sealed while sending, so the row can always
 * say whether the wish went.
 */
function WishDialog({ person, isOpen, onClose, onSent, onToast }) {
  const wish = useSendBirthdayWish();
  const [message, setMessage] = useState(DEFAULT_WISH);
  const [failure, setFailure] = useState(null);

  // Back to the default for each person, so a message typed for one member is
  // never sent to the next.
  useEffect(() => {
    if (isOpen) {
      setMessage(DEFAULT_WISH);
      setFailure(null);
    }
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
          <Button variant="ghost" onPress={onClose} disabled={wish.isPending}>
            Cancel
          </Button>
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
          rows={4}
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

/** TAB 1 — today's birthdays in the caller's scope, and the wishes to send them. */
function SendWishes() {
  const { users, isPending, error, refetch } = useTodayBirthdays();
  /** user_ids wished from this modal — see WishButton. */
  const [sent, setSent] = useState(() => new Set());
  const markSent = id => setSent(prev => new Set(prev).add(id));
  /** The member the wish dialog is open for, if any. */
  const [wishing, setWishing] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const hasPersonal = users.some(r => r?.tier === 'personal');
  const hasLeader = users.some(r => r?.is_leader === true);

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
          title="Could not load today’s birthdays"
        />
      </Card>
    );
  } else if (users.length === 0) {
    // The most common view, most days — so it least deserves to look like a
    // failed request.
    content = (
      <View style={styles.noBirthdays}>
        <LinearFill
          id="no-birthdays"
          radius={RADII.card}
          stops={[
            [0, '#FEF3C7'],
            [0.5, '#FFEDD5'],
            [1, '#FFE4CC'],
          ]}
        />
        <View style={styles.noBirthdaysIcon}>
          <MaterialCommunityIcons
            name="cake-variant-outline"
            size={space(7)}
            color="#B45309"
          />
        </View>
        <Text style={styles.noBirthdaysTitle}>No birthdays today</Text>
        <Text style={styles.noBirthdaysText}>
          Nobody in your Mandal is celebrating today, check back tomorrow.
        </Text>
      </View>
    );
  } else {
    content = (
      <>
        {/* A line per symbol that actually appears in the list. */}
        {(hasPersonal || hasLeader) && (
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
        )}

        <View style={styles.table}>
          <View style={styles.tableClip}>
            <View style={styles.thead}>
              <Text style={styles.th}>Member</Text>
              <Text style={styles.th}>Wish them</Text>
            </View>

            {users.map((row, i) => {
              const personal = row?.tier === 'personal';
              const leader = row?.is_leader === true;
              const canContact = row?.contact === true;
              // Only rows the caller may reach carry a number at all.
              const mobile = canContact ? (row?.mobile_number ?? null) : null;
              const name = nameOf(row);

              return (
                <View key={row?.user_id ?? `row-${i}`} style={styles.tr}>
                  <Initial name={name} />

                  <View style={styles.member}>
                    <View style={styles.nameLine}>
                      <Text style={styles.name}>{name}</Text>
                      {personal && <PersonalStar />}
                      {leader && <LeaderCrown />}
                      {row?.sabha_name ? (
                        <Text style={styles.sabha}>({row.sabha_name})</Text>
                      ) : null}
                    </View>
                    {mobile ? (
                      <Text style={styles.mobile}>{mobile}</Text>
                    ) : null}
                    <LeaderMeta row={row} />
                    {canContact && hasMobile(mobile) ? (
                      <View style={styles.contact}>
                        <CallButton row={row} mobile={mobile} />
                        <WhatsAppButton row={row} mobile={mobile} />
                      </View>
                    ) : null}
                  </View>

                  <WishButton
                    row={row}
                    sent={sent.has(row?.user_id)}
                    onPress={() => setWishing(row)}
                  />
                </View>
              );
            })}
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      {toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
      {content}
      {/* One dialog for the whole list — `wishing` carries whose birthday it is. */}
      <WishDialog
        person={wishing}
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
  { value: 'send', label: 'Send Wishes' },
  { value: 'received', label: 'My Wishes' },
];

export default function BirthdaysPage({
  onBack,
  onMenu,
  onHelp,
  onNotifications,
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

      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader
          title="Birthdays"
          subtitle={
            tab === 'received'
              ? 'Wishes sent to you'
              : `Everyone celebrating today, ${todayLabel()}`
          }
          breadcrumbs={
            <Breadcrumbs items={[{ label: 'Birthdays' }]} onHome={onBack} />
          }
        />

        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <View style={styles.tabBody}>
          {tab === 'received' ? <ReceivedWishes /> : <SendWishes />}
        </View>

        <View style={styles.footerBleed}>
          <SiteFooter />
        </View>
      </ScrollView>
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
  // .table-th
  thead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(5),
    paddingVertical: space(3.5),
  },
  th: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    letterSpacing: TEXT.xs * 0.025,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
    paddingHorizontal: space(5),
    paddingVertical: space(3),
  },
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
  sabha: { fontSize: TEXT.sm, color: COLORS.textMuted },
  mobile: {
    ...TNUM,
    marginTop: space(0.5),
    fontSize: TEXT.xs,
    color: COLORS.textMuted,
  },
  meta: { marginTop: space(1), gap: space(0.5) },
  metaText: { fontSize: TEXT.xs, color: COLORS.textMuted },
  metaLabel: { color: COLORS.textFaint },
  metaValue: { fontWeight: WEIGHT.medium },
  attended: { fontWeight: WEIGHT.semibold, color: COLORS.successFg },
  absent: { fontWeight: WEIGHT.semibold, color: COLORS.dangerFg },
  contact: { flexDirection: 'row', gap: space(2), marginTop: space(2) },

  // `!py-2 !text-xs` on the web's Button
  wishButton: { paddingVertical: space(2) },
  wishButtonText: { fontSize: TEXT.xs },

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

  noBirthdays: {
    alignItems: 'center',
    borderRadius: RADII.card,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: space(6),
    paddingVertical: space(12),
    ...SHADOWS.card,
  },
  noBirthdaysIcon: {
    width: space(14),
    height: space(14),
    borderRadius: RADII.full,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noBirthdaysTitle: {
    marginTop: space(4),
    fontSize: TEXT.base,
    fontWeight: WEIGHT.bold,
    color: '#7C2D12',
    textAlign: 'center',
  },
  noBirthdaysText: {
    marginTop: space(1),
    fontSize: TEXT.sm,
    color: '#9A3412',
    textAlign: 'center',
  },

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
