import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VITE_APP_VERSION } from '@env';

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
    // The footer owns the bottom safe area so its background reaches the
    // bottom edge of the screen instead of stopping above the home indicator.
    <SafeAreaView edges={['bottom']} style={background}>
      <View style={styles.footer}>
        <Text style={[styles.text, textColor]}>
          {'© 2026 Akshar Connect. All rights reserved.'}
          {VITE_APP_VERSION ? (
            // Tabular digits, and a non-breaking space so "v" can never wrap
            // away from the number it labels on a narrow phone.
            <Text style={styles.version}>
              {` · v${VITE_APP_VERSION}`}
            </Text>
          ) : null}
        </Text>
      </View>
    </SafeAreaView>
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
