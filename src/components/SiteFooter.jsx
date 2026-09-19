import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { APP_VERSION } from '../config/appConfig';

export default function SiteFooter({ transparent = false, light = false }) {
  const background = light
    ? styles.bgLight
    : transparent
      ? styles.bgTransparent
      : styles.bgSolid;
  const textColor = light
    ? styles.textOnLight
    : transparent
      ? styles.textMuted
      : styles.textOnSolid;

  return (
    <View style={[styles.footer, background]}>
      <Text style={[styles.text, textColor]}>
        {'© 2026 Akshar Connect. All rights reserved.'}
        {APP_VERSION ? (
          // Tabular digits, and a non-breaking space so "v" can never wrap
          // away from the number it labels on a narrow phone.
          <Text style={styles.version}>{` · v${APP_VERSION}`}</Text>
        ) : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  bgTransparent: { backgroundColor: 'transparent' },
  bgSolid: { backgroundColor: '#003158' },
  bgLight: { backgroundColor: '#E6EEF5' },
  text: { fontSize: 12, textAlign: 'center' },
  textMuted: { color: '#7894AA' },
  textOnSolid: { color: '#D8E5EF' },
  textOnLight: { color: '#56758D' },
  version: { fontVariant: ['tabular-nums'] },
});
