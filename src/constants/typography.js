import { Platform } from 'react-native';

export const FONT_FAMILY = Platform.select({
  ios: 'System',
  android: 'sans-serif',
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
