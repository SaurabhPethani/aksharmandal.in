/**
 * The copyright bar that closes every screen, signed-in or not.
 *
 * Rendered in exactly two places — AppShell, below the routed page, and the
 * login screen, which sits outside that shell. One component so the two can
 * never drift into two different years or two different shades of blue.
 *
 * TWO TONES, because the two screens are built on different grounds. Inside the
 * app the footer is `bg-primary`, the header's own dark blue, so the page ends
 * on the colour it began with. Login has no header to answer to — it is one
 * pale panel beside a photograph, and a dark bar across the bottom would read as
 * a third element rather than as a closing line. There it is transparent, and
 * the text carries it.
 *
 * The year is fixed rather than `new Date().getFullYear()`. A copyright year is
 * a claim about when the work was published, not a clock — and deriving it means
 * the notice silently changes on January 1st in whatever timezone the reader
 * happens to be in, on a build nobody touched.
 *
 * THE BUILD VERSION SITS BESIDE IT, and it earns its place. This app is a PWA:
 * the service worker decides which JS a device runs, and a phone holding an old
 * one keeps serving an old build however many times it is reloaded. Without a
 * version on screen there is no way to tell a bug from a stale bundle, and the
 * two look identical — the same screen, behaving the way it did last week.
 *
 * The footer rather than a settings page because it closes EVERY screen,
 * signed-in or not. Someone reporting a problem can read it off whatever they
 * are already looking at, and a screenshot of any screen carries it. HelpPage
 * shows the same value as a pill; both read `VITE_APP_VERSION`, which vite
 * bakes in from package.json, so neither can drift from what was built.
 */
export default function SiteFooter({ transparent = false }) {
  // Absent only if the define were removed from vite.config.js. Rendering
  // "v undefined" in a footer on every screen would be worse than showing
  // nothing, so the whole span drops out instead.
  const version = import.meta.env.VITE_APP_VERSION;

  return (
    <footer className={`shrink-0 px-4 py-4 text-center ${transparent ? '' : 'bg-primary'}`}>
      <p className={`text-xs ${transparent ? 'text-text-muted' : 'text-white/70'}`}>
        © 2026 Akshar Connect. All rights reserved.
        {version && (
          // `tnum` so the digits are the same width as everywhere else numbers
          // appear, and a non-breaking space so "v" can never wrap away from the
          // number it labels on a narrow phone.
          <span className="tnum whitespace-nowrap opacity-80">{' '}· v{version}</span>
        )}
      </p>
    </footer>
  );
}
