import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../components/Typography';
import { COLORS, RADII, SHADOWS, TEXT, WEIGHT, rem, space } from '../constants/theme';

export const ToastContext = createContext(null);

const TONES = {
  success: { icon: 'check-circle', bg: '#15803D' },
  error: { icon: 'close-circle', bg: '#B91C1C' },
  warning: { icon: 'alert', bg: '#B45309' },
  info: { icon: 'information', bg: COLORS.primary },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const timers = useRef(new Map());

  const dismiss = useCallback(id => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts(list => list.filter(t => t.id !== id));
  }, []);

  const push = useCallback(
    (message, { tone = 'info', duration = 4000 } = {}) => {
      if (message == null || String(message).trim() === '') return null;
      const id = ++seq.current;
      setToasts(list => [...list, { id, message: String(message), tone }]);
      if (duration) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (m, o) => push(m, { ...o, tone: 'success' }),
      error: (m, o) => push(m, { ...o, tone: 'error' }),
      warning: (m, o) => push(m, { ...o, tone: 'warning' }),
      info: (m, o) => push(m, { ...o, tone: 'info' }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastStack({ toasts, onDismiss }) {
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.stack, { top: insets.top + space(4) }]}
    >
      {toasts.map(toast => (
        <ToastRow key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

function ToastRow({ toast, onDismiss }) {
  const tone = TONES[toast.tone] ?? TONES.info;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        { backgroundColor: tone.bg },
        {
          opacity: enter,
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [-12, 0],
              }),
            },
          ],
        },
      ]}
    >
      <MaterialCommunityIcons
        name={tone.icon}
        size={20}
        color={COLORS.white}
        style={styles.toastIcon}
      />
      <Text style={styles.toastText}>{toast.message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={() => onDismiss(toast.id)}
        style={styles.toastClose}
      >
        <MaterialCommunityIcons name="close" size={16} color={COLORS.white} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    right: space(4),
    left: space(4),
    zIndex: 80,
    alignItems: 'flex-end',
    gap: space(2),
  },
  toast: {
    maxWidth: rem(24),
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(3),
    borderRadius: RADII.card,
    padding: space(3.5),
    ...SHADOWS.card,
  },
  toastIcon: { marginTop: space(0.5) },
  toastText: {
    flex: 1,
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.medium,
    color: COLORS.white,
  },
  toastClose: { borderRadius: RADII.lg, padding: space(1) },
});
