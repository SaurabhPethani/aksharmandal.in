import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from './Typography';

const COLORS = {
  navy: '#003158',
  accent: '#FF862A',
  surface: '#FFFFFF',
};

/**
 * @typedef {Object} AppHeaderProps
 * @property {(() => void)} [onMenu]
 * @property {(() => void)} [onHelp]
 * @property {(() => void)} [onNotifications]
 * @property {(() => void)} [onBack]
 * @property {string[]} [breadcrumbs]
 */

/**
 * @param {AppHeaderProps} props
 */
export default function AppHeader({
  onMenu = () => {},
  onHelp,
  onNotifications = () => {},
  onBack,
  breadcrumbs = /** @type {string[]} */ ([]),
}) {
  return (
    <>
      <View style={styles.topBar}>
        <Pressable
          onPress={onBack || onMenu}
          accessibilityRole="button"
          accessibilityLabel={onBack ? 'Go back' : 'Open navigation'}
          style={styles.topButton}
        >
          <MaterialCommunityIcons
            name={onBack ? 'arrow-left' : 'menu'}
            size={24}
            color={COLORS.surface}
          />
        </Pressable>
        <View style={styles.topActions}>
          {onHelp ? (
            <Pressable
              onPress={onHelp}
              accessibilityRole="button"
              accessibilityLabel="Help and FAQ"
              style={styles.topButton}
            >
              <MaterialCommunityIcons
                name="book-open-page-variant"
                size={22}
                color={COLORS.surface}
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onNotifications}
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
      {breadcrumbs.length ? (
        <View style={styles.breadcrumbBar}>
          {breadcrumbs.map((item, index) => (
            <React.Fragment key={`${item}-${index}`}>
              {index > 0 ? (
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={16}
                  color="#7894AA"
                />
              ) : null}
              <Text
                style={[
                  styles.breadcrumb,
                  index === breadcrumbs.length - 1 && styles.breadcrumbCurrent,
                ]}
              >
                {item}
              </Text>
            </React.Fragment>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
  breadcrumbBar: {
    minHeight: 36,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E6EEF5',
  },
  breadcrumb: { color: '#7894AA', fontSize: 12, fontWeight: '600' },
  breadcrumbCurrent: { color: COLORS.navy, fontWeight: '800' },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});
