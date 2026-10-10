import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { useOverlay } from '../contexts/OverlayContext';
import { Arrive } from './Overlays';
import { Skeleton } from './ui';
import { Text } from './Typography';
import { useQrInfo } from '../hooks/useProfileExtras';
import { readStored, writeStored } from '../utils/deviceStorage';
import { saveRemoteImage } from '../utils/saveImage';
import { STORAGE_KEYS } from '../constants/storage';
import { FONT_DISPLAY } from '../constants/typography';
import { COLORS, RADII, TEXT, WEIGHT, rem, space } from '../constants/theme';

// "My QR Code", opened for the member on their first dashboard visit of the
// day — the code they show at the Sabha door, without finding the card first.
//
// ONCE A DAY PER MEMBER, AND AGAIN AFTER A FRESH SIGN-IN (AuthContext clears
// the marks on an interactive login). The day is marked when the popup is
// CLOSED, not when it opens: an app killed with it on screen shows it again.
//
// Nothing is drawn while the code's address is on its way, or when there is no
// code or the lookup failed — and the day is not marked, so the next visit
// looks again. The lookup is the dashboard QR card's own query.
//
// `onDone` fires once the popup is out of the way — closed, already seen today,
// or with nothing to show. The dashboard holds the birthday greeting back
// until then, so the two never open on top of each other.

const SHOWN_KEY = STORAGE_KEYS.qrPopupShownOn;

const SHEET_MAX = rem(24);
const TILE_MAX = rem(17.5);

/** Today on this phone's calendar — the member's day, not UTC's. */
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function DailyQrPopup({ userId, fullName, onDone }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const overlay = useOverlay();
  const shownAnim = useRef(new Animated.Value(0)).current;

  // The web's `max-w-sm` card. The tile is sized in numbers: left to
  // `aspectRatio` under a `maxWidth` it came out taller than wide.
  const sheetWidth = Math.min(width, SHEET_MAX);
  const tile = Math.min(TILE_MAX, sheetWidth - 2 * space(6));

  // undefined until the stored days have been read.
  const [marks, setMarks] = useState(undefined);
  const [closed, setClosed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    readStored(SHOWN_KEY).then(stored => {
      if (active) setMarks(stored && typeof stored === 'object' ? stored : {});
    });
    return () => {
      active = false;
    };
  }, []);

  const ready = Boolean(userId) && marks !== undefined;
  const wanted = ready && !closed && marks[String(userId)] !== localDay();

  const qrQ = useQrInfo(userId);
  const qrUrl = qrQ.data || '';
  const failed = qrQ.isError || imgFailed;
  const visible = wanted && !failed && Boolean(qrUrl);

  // Not until the member and their marks are known: before that, "nothing to
  // show" would let the birthday greeting open first and this one over it.
  useEffect(() => {
    if (ready && (!wanted || failed)) onDone?.();
  }, [ready, wanted, failed, onDone]);

  const close = () => {
    const next = { ...(marks || {}), [String(userId)]: localDay() };
    setMarks(next);
    writeStored(SHOWN_KEY, next);
    setClosed(true);
  };
  // Not while a download is handing the file to the share sheet.
  const dismiss = () => {
    if (!saving) close();
  };

  const download = async () => {
    if (saving || !qrUrl) return;
    setSaving(true);
    const cleaned = String(fullName || '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    try {
      const res = await saveRemoteImage(
        qrUrl,
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
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!visible) {
      overlay.remove();
      return;
    }
    shownAnim.setValue(0);
  }, [visible, overlay, shownAnim]);

  const name = String(fullName ?? '').trim();

  const entry = {
    content: (
      <View style={styles.layer}>
        <Arrive value={shownAnim} />
        <Animated.View style={[styles.backdrop, { opacity: shownAnim }]}>
          <Pressable
            style={styles.fill}
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              width: sheetWidth,
              paddingBottom: insets.bottom,
              opacity: shownAnim,
              transform: [
                {
                  translateY: shownAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* The dashboard QR card's navy, lighter towards the top. */}
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <RadialGradient id="qrNavy" cx="50%" cy="0%" rx="120%" ry="70%">
                <Stop offset="0" stopColor="#0A4776" />
                <Stop offset="0.62" stopColor="#003158" />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#qrNavy)" />
          </Svg>

          <Pressable
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={6}
            style={({ pressed }) => [styles.x, pressed && styles.xPressed]}
          >
            <MaterialCommunityIcons
              name="close"
              size={space(5)}
              color="rgba(255,255,255,0.7)"
            />
          </Pressable>

          <View style={styles.body}>
            <Text accessibilityRole="header" style={styles.title}>
              My QR Code
            </Text>
            <Text style={styles.hint}>
              Show this at Sabha to mark your attendance
            </Text>

            {/* The tile stays white: its padding is the quiet zone a scanner
                needs to find the code's edges. Drawn at once, with a pulse
                inside until the image arrives, so the sheet keeps its size. */}
            <View style={[styles.tile, { width: tile, height: tile }]}>
              {!loaded && <Skeleton style={styles.tilePulse} />}
              <Image
                source={{ uri: qrUrl }}
                resizeMode="contain"
                accessibilityLabel={`QR code for ${name || 'your account'}`}
                onLoad={() => setLoaded(true)}
                onError={() => setImgFailed(true)}
                style={[styles.code, !loaded && styles.codeHidden]}
              />
            </View>

            {/* Whose code it is, for the sevak holding the scanner. The line
                keeps its place while the name is on its way. */}
            <Text numberOfLines={1} style={styles.name}>
              {name || ' '}
            </Text>

            <View style={styles.buttons}>
              <Pressable
                onPress={download}
                disabled={saving || !loaded}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving || !loaded, busy: saving }}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnOutline,
                  pressed && styles.btnOutlinePressed,
                  (saving || !loaded) && styles.btnOff,
                ]}
              >
                <MaterialCommunityIcons
                  name="download"
                  size={space(4)}
                  color={COLORS.white}
                />
                <Text style={[styles.btnText, styles.btnOutlineText]}>
                  {saving ? 'Saving…' : 'Download'}
                </Text>
              </Pressable>
              <Pressable
                onPress={dismiss}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnSolid,
                  pressed && styles.btnSolidPressed,
                ]}
              >
                <Text style={[styles.btnText, styles.btnSolidText]}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    ),
    onRequestClose: dismiss,
  };
  useEffect(() => {
    if (visible) overlay.show(entry);
  });
  return null;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  layer: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10,15,40,0.55)',
  },
  sheet: {
    overflow: 'hidden',
    borderTopLeftRadius: RADII.card,
    borderTopRightRadius: RADII.card,
    backgroundColor: COLORS.primary,
  },
  x: {
    position: 'absolute',
    zIndex: 1,
    top: space(3),
    right: space(3),
    width: space(9),
    height: space(9),
    borderRadius: RADII.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  body: {
    alignItems: 'center',
    paddingHorizontal: space(6),
    paddingTop: space(7),
    paddingBottom: space(6),
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.bold,
    color: COLORS.white,
  },
  hint: {
    marginTop: space(1),
    textAlign: 'center',
    fontSize: TEXT.sm,
    color: 'rgba(255,255,255,0.7)',
  },
  tile: {
    marginTop: space(5),
    borderRadius: RADII['2xl'],
    backgroundColor: COLORS.white,
    padding: space(3),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  tilePulse: {
    position: 'absolute',
    top: space(3),
    right: space(3),
    bottom: space(3),
    left: space(3),
    borderRadius: RADII.xl,
  },
  code: { width: '100%', height: '100%' },
  codeHidden: { opacity: 0 },
  name: {
    marginTop: space(4),
    maxWidth: '100%',
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.base,
    fontWeight: WEIGHT.semibold,
    color: COLORS.white,
  },
  buttons: {
    marginTop: space(5),
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: space(2),
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1.5),
    borderRadius: RADII.control,
    borderWidth: 1,
    paddingHorizontal: space(4),
    paddingVertical: space(2.5),
  },
  btnText: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold },
  btnOutline: {
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  btnOutlinePressed: { backgroundColor: 'rgba(255,255,255,0.2)' },
  btnOutlineText: { color: COLORS.white },
  btnSolid: { borderColor: COLORS.white, backgroundColor: COLORS.white },
  btnSolidPressed: { backgroundColor: COLORS.primary50 },
  btnSolidText: { color: COLORS.primary },
  btnOff: { opacity: 0.6 },
});
