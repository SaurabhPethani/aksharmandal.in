import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOverlay } from '../contexts/OverlayContext';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from './Typography';
import { FONT_DISPLAY } from '../constants/typography';
import {
  COLORS,
  RADII,
  SHADOWS,
  TEXT,
  WEIGHT,
  rem,
  space,
} from '../constants/theme';

const MAX_HEIGHT = 0.7;

// How far down (dp), or how fast (dp/ms), a drag on the top of the card has to
// go to close it. Anything less springs back.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 1.2;

// The card rises this far (dp) into place as it opens.
const ENTER_RISE = 24;
const ENTER_MS = 180;
// A card pulled down slides off the screen for this long before it closes.
const LEAVE_MS = 160;
// How long an owner has to close a dialog that took itself down, before the
// dialog is put back.
const REOPEN_MS = 300;

// `2xl` exists for dialogs that lay content out in columns.
const SIZES = {
  sm: rem(24),
  md: rem(32),
  lg: rem(42),
  xl: rem(56),
  '2xl': rem(64),
};

const CloseContext = createContext(null);

/**
 * Closes the dialog this is rendered in, the way its ✕ does: the card goes at
 * once and `onClose` follows. For a dialog's own Cancel button.
 */
export const useModalClose = () => useContext(CloseContext);

/**
 * Starts the entrance once the card is on the overlay layer. The layer mounts
 * it a render after the Modal, so an animation started from the Modal itself
 * can finish before the views exist.
 */
function Arrive({ value }) {
  useEffect(() => {
    Animated.timing(value, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [value]);
  return null;
}

export function Modal({
  isOpen,
  onClose,
  title,
  titleStyle,
  description,
  footer,
  size = 'md',
  dismissible = true,
  scrollable = true,
  children,
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const overlay = useOverlay();

  // How far below its place the card sits while it is pulled down.
  const drag = useRef(new Animated.Value(0)).current;
  // 0 → 1 as the card arrives.
  const shown = useRef(new Animated.Value(0)).current;
  // Set from the moment the dialog takes itself down until its owner answers:
  // a token, so that an old close cannot answer for a newer one.
  const dismissed = useRef(null);
  const entry = useRef(null);
  // The responder and the callbacks are created once, so they read the
  // current props through this.
  const latest = useRef({ isOpen, dismissible, onClose, height });
  latest.current = { isOpen, dismissible, onClose, height };

  // ✕, Cancel, the backdrop, Android's back button and a pull down all end
  // here. The dialog is taken down first and its owner told a tick later, so
  // the owner's re-render cannot hold the close up. Nothing here waits on an
  // animation: on a phone one does not always report that it finished.
  const close = useCallback(() => {
    const now = latest.current;
    if (!now.isOpen || !now.dismissible || dismissed.current) return;
    const mine = {};
    dismissed.current = mine;
    overlay.remove();
    setTimeout(() => {
      latest.current.onClose?.();
      // An owner that keeps it open gets the dialog back.
      setTimeout(() => {
        if (dismissed.current !== mine || !latest.current.isOpen) return;
        dismissed.current = null;
        drag.setValue(0);
        overlay.show(entry.current);
      }, REOPEN_MS);
    }, 0);
  }, [drag, overlay]);

  useEffect(() => {
    dismissed.current = null;
    if (!isOpen) {
      overlay.remove();
      return;
    }
    // Every opening starts at rest, and comes in from below.
    drag.setValue(0);
    shown.setValue(0);
    // A card opened over a keyboard would sit behind it: the keyboard wrapper
    // only learns of a keyboard that opens after it mounts. So the keyboard
    // goes first, before the card's own fields can take focus.
    Keyboard.dismiss();
  }, [isOpen, drag, shown, overlay]);

  const swipe = useRef(
    PanResponder.create({
      // Only a mostly-vertical pull downward, so a tap still reaches ✕.
      onMoveShouldSetPanResponder: (_, g) =>
        latest.current.dismissible &&
        g.dy > 6 &&
        Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          // The slide is only for show: the close is on a timer of its own.
          Animated.timing(drag, {
            toValue: latest.current.height,
            duration: LEAVE_MS,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }).start();
          setTimeout(close, LEAVE_MS);
        } else {
          Animated.spring(drag, {
            toValue: 0,
            bounciness: 4,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, {
          toValue: 0,
          bounciness: 4,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  // The backdrop fades in with the card, and out as it is pulled away.
  const backdropOpacity = useMemo(
    () =>
      Animated.multiply(
        shown,
        drag.interpolate({
          inputRange: [0, height],
          outputRange: [1, 0],
          extrapolate: 'clamp',
        }),
      ),
    [drag, shown, height],
  );
  const offset = useMemo(
    () =>
      Animated.add(
        drag,
        shown.interpolate({ inputRange: [0, 1], outputRange: [ENTER_RISE, 0] }),
      ),
    [drag, shown],
  );

  const content = (
    <View style={styles.fill}>
      <Arrive value={shown} />
      {/* `padding` on both platforms: the overlap is measured, so where the
          window has already been resized for the keyboard it comes out as 0.
          It REPLACES this view's own paddingBottom, so the safe-area padding
          lives on the layer inside; the offset stops the bottom inset being
          counted a second time while the keyboard is up. */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={-insets.bottom}
        style={styles.fill}
      >
        {/* Keeps clear of the status bar and the navigation bar, so the card
            never runs under either. */}
        <View
          style={[
            styles.layer,
            {
              paddingTop: insets.top + space(4),
              paddingBottom: insets.bottom + space(4),
            },
          ]}
        >
          <Animated.View
            style={[styles.backdrop, { opacity: backdropOpacity }]}
          >
            <Pressable
              style={styles.fill}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close"
            />
          </Animated.View>

          {/*
          A flex column, and the scroll lives on the body alone: the header and
          footer never shrink, so the confirm button cannot be pushed off the
          bottom of a tall dialog. Capped at MAX_HEIGHT of the screen, and
          shrinks further to the space the layer has left, which is what keeps
          it in view above the keyboard.
        */}
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.panel,
              {
                maxWidth: SIZES[size] ?? SIZES.md,
                maxHeight: height * MAX_HEIGHT,
                transform: [{ translateY: offset }],
              },
            ]}
          >
            {/* The drag handle: grab bar + title row. */}
            <View {...(dismissible ? swipe.panHandlers : {})}>
              {dismissible ? (
                <View
                  style={styles.grabber}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <View style={styles.grabberBar} />
                </View>
              ) : null}
              <View
                style={[
                  styles.header,
                  dismissible && styles.headerUnderGrabber,
                ]}
              >
                <View style={styles.headerCopy}>
                  <Text
                    style={[styles.title, titleStyle]}
                    accessibilityRole="header"
                  >
                    {title}
                  </Text>
                  {description ? (
                    <Text style={styles.description}>{description}</Text>
                  ) : null}
                </View>
                {dismissible && (
                  <Pressable
                    onPress={close}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    style={({ pressed }) => [
                      styles.close,
                      pressed && styles.closePressed,
                    ]}
                  >
                    {({ pressed }) => (
                      <MaterialCommunityIcons
                        name="close"
                        size={space(5)}
                        color={pressed ? COLORS.primary : COLORS.textMuted}
                      />
                    )}
                  </Pressable>
                )}
              </View>
            </View>

            {/* A dialog whose content is dragged rather than read opts out: a
              scroll view competes with the gesture inside it for the
              responder, and the photo cropper always lost the vertical half
              of a drag to it. */}
            {scrollable ? (
              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : (
              <View style={[styles.body, styles.bodyContent]}>{children}</View>
            )}

            {/* `flex-wrap`, so two long button labels drop a line on a narrow
              phone instead of pushing the action off the edge. */}
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  // Rendered on the app's own overlay layer, not in a window of its own — see
  // contexts/OverlayContext. Nothing is drawn here.
  // No dependency list: the content is fresh on every render while open.
  entry.current = {
    content: (
      <CloseContext.Provider value={close}>{content}</CloseContext.Provider>
    ),
    onRequestClose: close,
  };
  useEffect(() => {
    if (isOpen && !dismissed.current) overlay.show(entry.current);
  });
  return null;
}

/**
 * A photo at full size over a dark backdrop, under a back arrow and `title`.
 * A tap anywhere closes it.
 */
export function PhotoViewer({ uri, title, onClose }) {
  const insets = useSafeAreaInsets();
  const overlay = useOverlay();
  const shown = useRef(new Animated.Value(0)).current;
  const open = Boolean(uri);

  useEffect(() => {
    if (!open) {
      overlay.remove();
      return;
    }
    shown.setValue(0);
    Keyboard.dismiss();
  }, [open, shown, overlay]);

  const entry = {
    content: (
      <Animated.View
        style={[
          styles.viewer,
          {
            opacity: shown,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <Arrive value={shown} />
        {/* Sized and placed like the app header, so it sits over it. */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.viewerBar}
        >
          <View style={styles.viewerBack}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={COLORS.white}
            />
          </View>
          {title ? (
            <Text numberOfLines={1} style={styles.viewerTitle}>
              {title}
            </Text>
          ) : null}
        </Pressable>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          style={styles.viewerBody}
        >
          <Image
            source={{ uri }}
            resizeMode="contain"
            accessibilityLabel={title ? `${title} photo` : 'Photo'}
            style={styles.fill}
          />
        </Pressable>
      </Animated.View>
    ),
    onRequestClose: onClose,
  };
  useEffect(() => {
    if (open) overlay.show(entry);
  });
  return null;
}

const styles = StyleSheet.create({
  // Anchored to the bottom with a margin all round, so a height cap only ever
  // takes space from the top.
  layer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: space(4),
  },
  // `absoluteFillObject` is gone in React Native 0.87 — spreading it silently
  // left this view with a colour and no position, so it covered nothing.
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10,15,40,0.55)',
  },
  fill: { flex: 1 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  viewerBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: 16,
  },
  viewerBack: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerTitle: {
    flex: 1,
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.base,
    fontWeight: WEIGHT.bold,
    color: COLORS.white,
  },
  viewerBody: {
    flex: 1,
    paddingHorizontal: space(4),
    paddingBottom: space(4),
  },
  grabber: { alignItems: 'center', paddingTop: space(2) },
  grabberBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.lineStrong,
  },
  // The grab bar already spaces the top of the card.
  headerUnderGrabber: { paddingTop: space(2) },
  panel: {
    width: '100%',
    flexShrink: 1,
    overflow: 'hidden',
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space(4),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    padding: space(4),
  },
  headerCopy: { flex: 1, minWidth: 0 },
  // .section-title
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.base,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  description: {
    marginTop: space(1),
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
  },
  close: { padding: space(1.5), borderRadius: RADII.control },
  closePressed: { backgroundColor: COLORS.primary50 },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { padding: space(4) },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space(2),
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    padding: space(4),
  },
});
