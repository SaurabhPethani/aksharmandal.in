import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from './Typography';

/**
 * @typedef {Object} ScrollViewWithTopProps
 * @property {React.ReactNode} [children]
 * @property {(event: any) => void} [onScroll]
 * @property {any} [style]
 * @property {any} [contentContainerStyle]
 * @property {string} [keyboardShouldPersistTaps]
 * @property {boolean} [nestedScrollEnabled]
 * @property {boolean} [showsHorizontalScrollIndicator]
 * @property {boolean} [horizontal]
 */

const ScrollViewWithTop = forwardRef(function ScrollViewWithTop(
  /** @type {ScrollViewWithTopProps & Record<string, any>} */
  { children, onScroll, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const localRef = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      scrollTo: options => localRef.current?.scrollTo(options),
    }),
    [],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        {...props}
        ref={localRef}
        onScroll={event => {
          setVisible(event.nativeEvent.contentOffset.y > 350);
          onScroll?.(event);
        }}
        scrollEventThrottle={100}
      >
        {children}
      </ScrollView>
      {visible ? (
        <Pressable
          accessibilityLabel="Back to top"
          accessibilityRole="button"
          onPress={() => localRef.current?.scrollTo({ y: 0, animated: true })}
          style={styles.button}
        >
          <MaterialCommunityIcons name="arrow-up" size={17} color="#FFFFFF" />
          <Text style={styles.label}>Top</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

export default ScrollViewWithTop;

const styles = StyleSheet.create({
  container: { flex: 1 },
  button: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: 22,
    backgroundColor: '#003158',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    elevation: 4,
    shadowColor: '#003158',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
  },
  label: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
