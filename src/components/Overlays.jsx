import React, { useEffect, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOverlayPortal } from '../contexts/OverlayContext';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from './Typography';
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

// `2xl` exists for dialogs that lay content out in columns.
const SIZES = {
  sm: rem(24),
  md: rem(32),
  lg: rem(42),
  xl: rem(56),
  '2xl': rem(64),
};

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
  const dismiss = () => {
    if (dismissible) onClose?.();
  };

  const drag = useRef(new Animated.Value(0)).current;
  // The responder is created once, so it reads the current props through this.
  const latest = useRef({ dismissible, onClose, height });
  latest.current = { dismissible, onClose, height };

  // Every opening starts at rest, not where the last drag left the card.
  useEffect(() => {
    if (isOpen) drag.setValue(0);
  }, [isOpen, drag]);

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
          Animated.timing(drag, {
            toValue: latest.current.height,
            duration: 180,
            useNativeDriver: true,
          }).start(() => latest.current.onClose?.());
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

  // The backdrop fades as the card is pulled away.
  const backdropOpacity = drag.interpolate({
    inputRange: [0, height],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // No entrance animation: the card is mounted by the overlay layer a render
  // after this one, so an animation started here can finish before the view
  // exists, leaving it stuck at its starting value.
  const content = (
    <View style={styles.fill}>
      {/* `padding` on both platforms: the overlap is measured, so where the
          window has already been resized for the keyboard it comes out as 0.
          The layer keeps clear of the status bar and gesture bar, so the card
          never runs under either. */}
      <KeyboardAvoidingView
        behavior="padding"
        style={[
          styles.layer,
          {
            paddingTop: insets.top + space(4),
            paddingBottom: insets.bottom + space(4),
          },
        ]}
      >
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={styles.fill}
            onPress={dismiss}
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
              transform: [{ translateY: drag }],
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
              style={[styles.header, dismissible && styles.headerUnderGrabber]}
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
                  onPress={onClose}
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
      </KeyboardAvoidingView>
    </View>
  );

  // Rendered on the app's own overlay layer, not in a window of its own — see
  // contexts/OverlayContext. Nothing is drawn here.
  useOverlayPortal(Boolean(isOpen), content, dismiss);
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
