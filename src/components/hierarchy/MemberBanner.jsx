import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

/** Who a dialog is about: the member's name over one line of what is current. */
export default function MemberBanner({ name, meta }) {
  return (
    <View style={styles.banner}>
      <View style={styles.icon}>
        <MaterialCommunityIcons
          name="account"
          size={space(6)}
          color={COLORS.white}
        />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>
          {name || '—'}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {meta}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    borderRadius: RADII.control,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  icon: {
    width: space(11),
    height: space(11),
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  name: {
    fontSize: TEXT.base,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  meta: { fontSize: TEXT.sm, color: COLORS.textMuted },
});
