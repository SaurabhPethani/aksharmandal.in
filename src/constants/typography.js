import { Platform } from 'react-native';

// The web's two faces, bundled for Android in android/app/src/main/res/font and
// registered in MainApplication. iOS has no copy of them yet.

/** Body text — the web's DM Sans. */
export const FONT_FAMILY = Platform.select({
  ios: 'System',
  android: 'DM Sans',
  default: 'sans-serif',
});

/** Titles and figures — the web's Sora (`font-display`, `.page-title`). */
export const FONT_DISPLAY = Platform.select({
  ios: 'System',
  android: 'Sora',
  default: 'sans-serif',
});

export const FONT_WEIGHTS = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extraBold: '800',
};

export const FONT_SIZES = {
  caption: 11,
  small: 12,
  body: 14,
  bodyLarge: 16,
  heading: 20,
  title: 24,
};
