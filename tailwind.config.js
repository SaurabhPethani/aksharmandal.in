/** @type {import('tailwindcss').Config} */
// Palette, fonts and radii below are the live site's actual values, read from
// https://aksharmandal.in/aksharconnect/assets/index-BUwmXP6z.css (its :root block
// and component classes). Do not "improve" these — they exist to match.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#003158', // --primary
          hover: '#002849', // .btn-primary:hover
          50: '#E5EEF5', // .bg-primary-50
          100: '#B8D1E5', // .bg-primary-100
          600: '#002849',
        },
        accent: {
          DEFAULT: '#FF862A', // --accent
          hover: '#CC6B22', // .btn-accent:hover
        },
        bg: '#EBF0F6', // --bg  (page background)
        surface: '#FFFFFF', // --surface
        line: {
          DEFAULT: '#D8E5F0', // --border
          soft: '#DDE9F3', // .card border
          strong: '#C5D8E8', // .btn-outline border
          input: '#D0DCF0', // .input-field border
        },
        text: {
          DEFAULT: '#003158', // --text
          muted: '#5C7A96', // --text-muted
          faint: '#9BB5CB', // .input-field::placeholder
        },
        // .badge-green / .badge-red
        success: { bg: '#DCFCE7', fg: '#15803D' },
        danger: { bg: '#FEE2E2', fg: '#B91C1C' },
        // NOT from the live bundle — additive, like `warning` below. The Reports
        // KPI row needs a third state between `danger` and `success` (Lapsed /
        // Retain / New), and `warning` is already spoken for by the approval
        // notices AND reads orange, not yellow.
        //
        // A DARK yellow, because the value is white text on this colour as its
        // card header. A literal yellow (#FACC15) carries about 1.7:1 against
        // white — the label would be unreadable. This one is ~4.9:1, still a
        // yellow hue rather than the brown you get by darkening further.
        caution: { fg: '#A16207' },
        // NOT from the live bundle — the live site has no "awaiting approval"
        // state, and the notices on the self-edit form are the first thing to
        // need one. Additive: nothing above changes, so the palette still matches.
        //
        // Four values rather than the usual bg/fg pair, because the notice is
        // built from three surfaces that are deliberately not the same colour:
        //
        //   bg      the notice and pending-request panels — LIGHT ORANGE.
        //   badge   the pill beside a field label, a shade deeper than `bg` so
        //           it still separates when it sits ON one of those panels.
        //   border  an orange hairline. Not `fg` at low opacity, which mutes to
        //           brown; a real orange, lighter than the text it frames.
        //   fg      the text. Orange, in the same family as `accent` (#FF862A)
        //           but darkened from it for contrast — the accent itself is
        //           about 2:1 on this ground, legible as a block of colour
        //           rather than as words.
        warning: {
          bg: '#FFF4E9',
          badge: '#FDEBD8',
          border: '#F3C08A',
          fg: '#C2410C',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'], // html, body
        display: ['Sora', 'sans-serif'], // h1-h6, .page-title, .section-title
      },
      borderRadius: {
        card: '1rem', // .card
        control: '0.75rem', // .btn-*, .input-field
      },
      boxShadow: {
        card: '0 2px 16px #00315812, 0 1px 4px #0031580a',
        primary: '0 4px 14px #00315859',
        'primary-hover': '0 6px 20px #00315873',
        accent: '0 4px 14px #ff862a61',
        'accent-hover': '0 6px 20px #ff862a7a',
        input: 'inset 0 1px 3px #0031580f',
        'input-focus': '0 0 0 3px #00315814, inset 0 1px 3px #0031580a',
        glow: '0 0 24px rgba(255,134,42,.4)', // .shadow-glow
      },
      spacing: {
        // Sidebar rail widths taken from the live bundle's lg:ml-[320px] / lg:ml-[72px].
        sidebar: '320px',
        rail: '72px',
      },
      // The app-wide request indicator (components/GlobalLoader.jsx). An
      // indeterminate sweep rather than a percentage: request progress is not
      // knowable, and a fake percentage bar that stalls reads as a hang.
      keyframes: {
        'loader-sweep': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'loader-sweep': 'loader-sweep 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
