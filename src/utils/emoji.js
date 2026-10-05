// Emoji, defined by Unicode CODE POINT and never as a raw glyph in source.
//
// WHY THIS FILE EXISTS. A raw emoji character pasted into a .js file is a
// multi-byte UTF-8 sequence. If any step in the pipeline — a file saved as
// ANSI/Latin-1, a build tool, a copy through a non-UTF-8 system — mishandles
// those bytes, the emoji is replaced by U+FFFD, the replacement character `�`.
// That is exactly the broken glyph seen in some WhatsApp messages: not a device
// that lacks the emoji font (that shows an empty box), but the emoji's bytes
// corrupted before they ever reached the phone.
//
// A `\u{...}` escape is PURE ASCII in the source — the code point is written in
// plain digits and letters, reconstructed into the emoji only when the JS is
// parsed. No encoding step can corrupt digits, so an emoji built from here
// cannot become `�`. Every outgoing MESSAGE (WhatsApp text and the like) builds
// its emoji from this map so the whole website sends the same, safe glyphs.
//
// Emoji shown only on screen in JSX are NOT the risk this guards against — the
// browser decodes the UTF-8 bundle correctly, so a display emoji renders (or,
// on an old device, shows a box) but never turns into `�`. This map is for text
// that leaves the app.

export const EMOJI = {
  pray: '\u{1F64F}',            // 🙏  folded hands
  blossom: '\u{1F338}',         // 🌸  cherry blossom
  lotus: '\u{1FAB7}',           // 🪷  lotus
  check: '\u{2705}',            // ✅  white heavy check
  cross: '\u{274C}',            // ❌  cross mark
  whiteBox: '\u{2B1C}',         // ⬜  white large square
  party: '\u{1F389}',           // 🎉  party popper
  cake: '\u{1F382}',            // 🎂  birthday cake
  person: '\u{1F464}',          // 👤  bust in silhouette
  chartUp: '\u{1F4C8}',         // 📈  chart increasing
  barChart: '\u{1F4CA}',        // 📊  bar chart
  phone: '\u{1F4DE}',           // 📞  telephone receiver
  mobile: '\u{1F4F1}',          // 📱  mobile phone
  clipboard: '\u{1F4CB}',       // 📋  clipboard
  calendarSpiral: '\u{1F5D3}\u{FE0F}', // 🗓️  spiral calendar
  calendar: '\u{1F4C5}',        // 📅  calendar
  arrow: '\u{279C}',            // ➜  heavy round-tipped arrow
  target: '\u{1F3AF}',          // 🎯  direct hit
  house: '\u{1F3E0}',           // 🏠  house
  redCircle: '\u{1F534}',       // 🔴  red circle
  brownCircle: '\u{1F7E4}',     // 🟤  brown circle
  orangeCircle: '\u{1F7E0}',    // 🟠  orange circle
  yellowCircle: '\u{1F7E1}',    // 🟡  yellow circle
  greenCircle: '\u{1F7E2}',     // 🟢  green circle
  people: '\u{1F465}',          // 👥  busts in silhouette
  lineHeavy: '\u{2501}',        // ━  heavy horizontal — section rule
  lineDotted: '\u{2508}',       // ┈  light quadruple dash — row divider
  clock5: '\u{1F554}',          // 🕔  five o'clock
  clock930: '\u{1F564}',        // 🕤  nine-thirty
  warning: '\u{26A0}\u{FE0F}',  // ⚠️  warning
};
