// The web app's design tokens, as React Native values.
//
// Read from the web's tailwind.config.js and src/index.css — do not "improve"
// these, they exist to match. The web sets its root font size to 15px, and
// Tailwind sizes everything in rem, so every length here is rem × 15.

export const REM = 15;
export const rem = value => value * REM;
/** Tailwind spacing step: `p-4` is space(4), `gap-1.5` is space(1.5). */
export const space = step => (step / 4) * REM;

export const COLORS = {
  primary: '#003158',
  primaryHover: '#002849',
  primary50: '#E5EEF5',
  primary100: '#B8D1E5',
  accent: '#FF862A',
  accentHover: '#CC6B22',
  bg: '#EBF0F6',
  surface: '#FFFFFF',
  line: '#D8E5F0',
  lineSoft: '#DDE9F3',
  lineStrong: '#C5D8E8',
  lineInput: '#D0DCF0',
  text: '#003158',
  textMuted: '#5C7A96',
  textFaint: '#9BB5CB',
  successBg: '#DCFCE7',
  successFg: '#15803D',
  dangerBg: '#FEE2E2',
  dangerFg: '#B91C1C',
  toggleOff: '#CBD5E1',
  white: '#FFFFFF',
};

export const RADII = {
  card: rem(1),
  control: rem(0.75),
  lg: rem(0.5),
  xl: rem(0.75),
  '2xl': rem(1),
  full: 9999,
};

// The content area's type scale: each Tailwind size plus exactly 1pt
// (see `.content-type` in the web's index.css).
export const TEXT = {
  xs: rem(0.83889),
  sm: rem(0.96389),
  base: rem(1.08889),
  lg: rem(1.21389),
  xl: rem(1.33889),
  '2xl': rem(1.58889),
  stat: rem(1.98889),
};

export const WEIGHT = {
  medium: '500',
  semibold: '600',
  bold: '700',
};

/** `.tnum` — tabular figures, so numbers do not jitter as they change. */
export const TNUM = { fontVariant: ['tabular-nums'] };

export const SHADOWS = {
  // 0 2px 16px #00315812, 0 1px 4px #0031580a
  card: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  // .panel: 0 1px 8px rgba(0,49,88,0.06)
  panel: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
};
