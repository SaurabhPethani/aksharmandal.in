import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';

const COLORS = {
  navy: '#003158',
  accent: '#FF862A',
  surface: '#FFFFFF',
};

export default function AppHeader({ onMenu, onHelp = () => {} }) {
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
