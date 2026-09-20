import React, { useContext } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from './Typography';
import { AuthContext } from '../contexts/AuthContext';
import { useProfileImage } from '../hooks/useProfileExtras';

const COLORS = {
  navy: '#003158',
  accent: '#FF862A',
  surface: '#FFFFFF',
};

function HeaderAvatar() {
  const auth = useContext(AuthContext);
  const userId = auth?.activeUserId ?? null;
  const { data } = useProfileImage(userId, Boolean(userId));
  const photo = data?.image_url;

  if (photo) {
    return (
      <Image
        source={{ uri: photo }}
        style={styles.avatarImage}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <MaterialCommunityIcons name="account" size={22} color={COLORS.surface} />
  );
}

export default function AppHeader({
  onMenu,
  onHelp = () => {},
  onNotifications = () => {},
  // No default: a screen that passes nothing leaves the avatar inert, and a
  // `null` default would narrow the prop's inferred type for TS callers.
  onProfile,
  onBack = null,
  breadcrumbs = [],
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
            onPress={onProfile ?? undefined}
            disabled={!onProfile}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            style={({ pressed }) => [
              styles.avatar,
              pressed && onProfile && styles.avatarPressed,
            ]}
          >
            <HeaderAvatar />
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
  avatarPressed: { opacity: 0.8 },
  avatarImage: { width: '100%', height: '100%' },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    // Android does not clip a child to a rounded parent without this.
    overflow: 'hidden',
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});
