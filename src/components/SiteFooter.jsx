import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { APP_VERSION } from '../config/appConfig';

/**
 * @typedef {Object} SiteFooterProps
 * @property {boolean} [transparent]
 * @property {boolean} [light]
 * @property {(() => void) | undefined} [onPrivacy]
 * @property {(() => void) | undefined} [onTerms]
 * @property {(() => void) | undefined} [onDeleteAccount]
 */

/**
 * @param {SiteFooterProps} props
 */
export default function SiteFooter({
  transparent = false,
  light = false,
  onPrivacy,
  onTerms,
  onDeleteAccount,
}) {
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
        {`© ${new Date().getFullYear()} Akshar Connect. All rights reserved.`}
        {APP_VERSION ? (
          // Tabular digits, and a non-breaking space so "v" can never wrap
          // away from the number it labels on a narrow phone.
          <Text style={styles.version}>{` · v${APP_VERSION}`}</Text>
        ) : null}
      </Text>
      {onPrivacy || onTerms || onDeleteAccount ? (
        <View style={styles.links}>
          <Pressable onPress={onPrivacy} disabled={!onPrivacy}>
            <Text style={[styles.link, textColor]}>Privacy Policy</Text>
          </Pressable>
          <Text style={[styles.linkSeparator, textColor]}> · </Text>
          <Pressable onPress={onTerms} disabled={!onTerms}>
            <Text style={[styles.link, textColor]}>Terms & Conditions</Text>
          </Pressable>
          <Text style={[styles.linkSeparator, textColor]}> · </Text>
          <Pressable onPress={onDeleteAccount} disabled={!onDeleteAccount}>
            <Text style={[styles.link, textColor]}>Delete Account</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 },
  link: { fontSize: 12 },
  linkSeparator: { fontSize: 12 },
  bgTransparent: { backgroundColor: 'transparent' },
  bgSolid: { backgroundColor: '#003158' },
  bgLight: { backgroundColor: '#E6EEF5' },
  text: { fontSize: 12, textAlign: 'center' },
  textMuted: { color: '#7894AA' },
  textOnSolid: { color: '#D8E5EF' },
  textOnLight: { color: '#56758D' },
  version: { fontVariant: ['tabular-nums'] },
});
