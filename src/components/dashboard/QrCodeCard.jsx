import { useId, useState } from 'react';
import { Download, QrCode } from 'lucide-react';
import { saveRemoteImage } from '../../utils/saveImage';
import { useToast } from '../../hooks';

// QR images are served as static files under the API, not via a JSON endpoint:
//   {API}/api/v1/qr/codes/akshar-connect-{userId}.jpeg
// Going through the same origin means the dev proxy handles it like any other
// /api call. A member whose QR has not been generated yet 404s, so the card
// falls back to a message instead of a broken image.
const qrFileName = (userId) => `akshar-connect-${userId}.jpeg`;
const qrUrlForUser = (userId) =>
  `${import.meta.env.VITE_API_BASE ?? ''}/api/v1/qr/codes/${qrFileName(userId)}`;

/**
 * Buttons, not text links — the links read as part of the card's own wording
 * and were easy to miss entirely.
 *
 * `.btn-*` are component-layer classes carrying `px-6 py-3`, which is a page
 * action rather than something that fits beside a panel title. The padding and
 * size utilities here override that: Tailwind emits utilities after components,
 * so no `!` is needed.
 *
 * SIZED TO SHARE THE TITLE'S LINE. Both buttons and the heading sit on one row
 * inside a 19rem rail, which at the previous `px-3 py-1.5 text-xs` was a few
 * pixels too wide — the pair wrapped underneath and the card's header became two
 * lines. Trimmed rather than allowed to wrap: a stacked Show / Download reads as
 * a second section of the card, and the rail is short enough that the extra line
 * pushed the code itself down.
 *
 * `whitespace-nowrap` because these labels must never break mid-word, and
 * `shrink-0` because the heading beside them is the thing that gives, not these.
 *
 * A FIXED `h-7` RATHER THAN VERTICAL PADDING, and that is what makes the two
 * match. With `py-1` each button was as tall as its own contents: Show is a line
 * of 11px text, Download (from `sm` up) is a bare 14px mark, and the two boxes
 * came out different heights sitting side by side. One height, set once, and the
 * contents centre inside it whatever they are.
 */
const BTN_COMPACT =
  'inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap px-2.5 text-[11px]';

/**
 * THE CARD SITS ON BRAND NAVY, so both buttons are inverted from their normal
 * form. `.btn-outline` and `.btn-primary` are still applied underneath — they
 * carry the radius, the transition, the `active:scale` and the disabled
 * handling, and none of that changes. Only the colours are overridden, which
 * works without `!` because Tailwind emits utilities after components (the same
 * mechanism the padding override above relies on).
 *
 * Without this both buttons would be navy on navy: `.btn-outline`'s hover state
 * fills with `bg-primary`, and `.btn-primary` is `bg-primary` to begin with — so
 * Show would vanish on hover and Download would be invisible at rest.
 */
// Secondary. A tinted glass panel rather than a solid fill, so it reads as the
// quieter of the two without needing a second colour on the card.
const BTN_ON_NAVY_OUTLINE =
  'border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/20 hover:text-white';
// Primary. Solid white is the strongest thing available on navy, and it keeps
// the card to two colours — introducing `accent` here would make the QR panel
// the only place on the dashboard with three.
const BTN_ON_NAVY_SOLID = 'bg-white text-primary hover:bg-primary-50';

/**
 * @param alwaysCollapsible  fold it away at EVERY width, not just on a phone —
 *   and START folded there, on every screen. The dashboard passes this: the QR
 *   has a column of its own, and a reader who is not standing at the Sabha door
 *   wants that column back rather than a code they have to look past. It is one
 *   press from the header when they do need it.
 *
 *   Everywhere else the card keeps its original behaviour — a phone-only
 *   accordion, folded on a narrow screen where the QR is the tallest thing on
 *   the page, and simply always open from `sm` up.
 */
export default function QrCodeCard({
  userId, fullName, className = '', hint, alwaysCollapsible = false,
}) {
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  /**
   * Load the QR as a credentials-less CORS request — the same reason as on the
   * profile page, and this card has the same two readers of one URL: the <img>
   * below, and the Download button's fetch. A plain image load sends no
   * `Origin`, so the reply it caches carries no `Access-Control-Allow-Origin`,
   * and the fetch handed that copy cannot read it. Falls back to an ordinary
   * load if the header is ever absent, so a header problem costs the download
   * and not the picture.
   */
  const [qrCors, setQrCors] = useState(true);
  const toast = useToast();

  /**
   * DOWNLOAD VIA FETCH-AND-BLOB, not `<a href download>`.
   *
   * On prod the SPA is served from `aksharmandal.in` and the QR image
   * from `api.aksharmandal.in` — a different origin. The `download`
   * attribute on a link is honoured only for same-origin URLs, so
   * clicking a cross-origin link simply NAVIGATES to the image (the
   * user lands on a bare JPEG with the app gone). `saveRemoteImage`
   * fetches the file first, wraps it in a blob URL this origin owns,
   * and hands it to the browser as a proper download — the OS Save
   * dialog opens (or the file lands in the default Downloads folder,
   * per the user's browser setting).
   *
   * The saved filename matches the profile page's convention — "Amit
   * Limbasia QR.jpeg" — rather than the deterministic server name, so
   * a member sharing the file has something readable to send.
   */
  const download = async () => {
    if (!userId || saving) return;
    setSaving(true);
    const url = qrUrlForUser(userId);
    const cleaned = String(fullName || '')
      .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const filename = `${cleaned || 'Akshar Connect'} QR.jpeg`;
    const res = await saveRemoteImage(url, filename);
    setSaving(false);
    if (res.ok) {
      toast.success(res.mode === 'share' ? 'QR code shared.' : 'QR code downloaded.');
      return;
    }
    if (res.reason !== 'cancelled') toast.error(res.reason);
  };
  /**
   * Folded or not — and ALWAYS FOLDED ON ARRIVAL, whatever the screen.
   *
   * Not remembered between visits either, deliberately: the card is opened to
   * be scanned and the scan is over in seconds, so "open" is a state for right
   * now rather than a preference to carry around. Every load of the page starts
   * with the column closed and the header offering Show.
   *
   * `false` means two different things depending on `alwaysCollapsible`, and the
   * panel's own classes are where that is resolved — see the render.
   */
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const toggle = () => setOpen((v) => !v);

  /**
   * THE WHOLE CARD IS THE TOGGLE, and the Show button stays beside it.
   *
   * The two are not redundant. The card is the big, obvious pointer target — a
   * thumb anywhere on the panel opens the code — while the button is what NAMES
   * the action ("Show" / "Hide"), what a keyboard reaches, and what carries
   * `aria-expanded` for a screen reader. Dropping either one costs something the
   * other does not provide.
   *
   * Deliberately NOT `role="button"` + `tabIndex` on the wrapper, which is how
   * EventCard does its whole-card control. That card has no inner button to
   * speak for it; this one does. Adding the role here would nest two real
   * `<button>`s inside a third button (invalid ARIA) and give the keyboard a
   * second tab stop that does exactly what the first one does. So the card is a
   * pointer convenience and the button is the accessible control.
   */
  const cardCanToggle = () => {
    // Nothing to fold — the empty state has no panel and no Show button either.
    if (failed) return false;
    if (alwaysCollapsible) return true;
    /*
     * Without `alwaysCollapsible` the panel is `hidden sm:block`, so from `sm`
     * up it is on screen whatever `open` says. A click there would flip the
     * state and change nothing anyone can see. This is the same rule the Show
     * button already applies to itself with `sm:hidden` — a control that toggles
     * nothing should not be offered.
     */
    return typeof window === 'undefined' || !window.matchMedia('(min-width: 640px)').matches;
  };

  const onCardClick = () => { if (cardCanToggle()) toggle(); };

  /**
   * For the controls INSIDE the card that must not also toggle it.
   *
   * Download is the one the brief named: saving the image and hiding it in the
   * same tap would be two unrelated things from one press. Show needs it for a
   * different reason — its own handler toggles, and letting the click bubble to
   * the card would toggle a SECOND time, so the two cancel out and the button
   * appears dead.
   *
   * Same shape as `only()` in components/events/EventCard.jsx.
   */
  const withoutToggling = (fn) => (e) => { e.stopPropagation(); fn(); };

  if (!userId) return null;

  return (
    /*
     * BRAND NAVY, not the panel's white. `.panel` still supplies the radius and
     * the padding; `bg-primary` and the border/shadow beside it override its
     * white ground the same way the buttons override theirs.
     *
     * `border-white/10` rather than the panel's `#E8EEF6`: that hairline is a
     * light border meant to separate a white card from a light page, and on navy
     * it read as a bright outline drawn around the card. `shadow-card` replaces
     * the panel's own much softer shadow, which was tuned to lift white off the
     * page background and is not enough to seat a dark block on it.
     *
     * `text-white` is set HERE rather than on each child, so anything added to
     * this card later inherits a legible colour instead of defaulting to the
     * body's navy — which on this ground would be invisible.
     */
    /*
     * `onClick` here is the whole-card toggle — see `cardCanToggle`. The cursor
     * follows the SAME rule the handler does, so the card never invites a press
     * that would do nothing: `sm:cursor-default` restores the arrow at exactly
     * the width where the panel stops folding, and the empty state (which has
     * nothing to fold) gets no pointer at all.
     */
    <div
      onClick={onCardClick}
      className={`panel border-white/10 bg-primary text-white shadow-card ${
        failed ? '' : alwaysCollapsible ? 'cursor-pointer' : 'cursor-pointer sm:cursor-default'
      } ${className}`}
    >
      {/* ONE LINE, NEVER TWO. No `flex-wrap`: the title and its two buttons are
          one header, and on a narrow rail wrapping turned that header into a
          heading with a button bar under it. The heading truncates instead —
          it is three known words, so `min-w-0` here is insurance for a longer
          one rather than something this title will ever need. */}
      <div className="flex items-center justify-between gap-2">
        {/* `.panel-title` is `text-primary`, which is this card's own background. */}
        <h3 className="panel-title min-w-0 truncate text-white">My QR Code</h3>

        {failed ? (
          <QrCode className="h-4 w-4 shrink-0 text-white/50" />
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* `sm:hidden` unless the card folds at every width: without
                `alwaysCollapsible` the code is on screen from `sm` up whatever
                this button says, so showing it there would be a control that
                toggles nothing. */}
            <button
              type="button"
              onClick={withoutToggling(toggle)}
              aria-expanded={open}
              aria-controls={panelId}
              className={`btn-outline ${BTN_COMPACT} ${BTN_ON_NAVY_OUTLINE} ${alwaysCollapsible ? '' : 'sm:hidden'}`}
            >
              {open ? 'Hide' : 'Show'}
            </button>

            {/* Fetch-and-blob download (see `download` helper above).
                A plain `<a href download>` navigates to the image on prod
                because the API is cross-origin — this route bypasses that
                and hands the OS a real download.

                THE WORD GOES ON A WIDE SCREEN, THE MARK STAYS. A download
                arrow beside a QR code is unambiguous, and the label was the
                widest thing in this header — dropping it from `sm` up is what
                buys the title its line back on the rail.

                It is not dropped on a phone: there is no hover there, so the
                mark would have to explain itself and could not. Below `sm` the
                button reads "Download" as it always has.

                `title` gives the wide screen its explanation on hover;
                `aria-label` is the same words for a screen reader, which needs
                them at EVERY width since the visible text disappears at one of
                them. `sm:w-7 sm:px-0` makes it a square once the word is gone —
                the same 28px the Show button beside it is tall. */}
            <button
              type="button"
              // Excluded from the card-wide toggle: saving the image and hiding
              // it in the same tap would be two unrelated things from one press.
              onClick={withoutToggling(download)}
              disabled={saving}
              title="Download QR"
              aria-label="Download QR"
              className={`btn-primary ${BTN_COMPACT} ${BTN_ON_NAVY_SOLID} sm:w-7 sm:px-0`}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="sm:hidden">Download</span>
            </button>
          </div>
        )}
      </div>

      {failed ? (
        // The empty state inverts with the rest of the card. Its plate was
        // `bg-primary-50` — a pale blue chosen to sit on white — which on navy
        // became the brightest thing in the card, and the `text-primary/30`
        // glyph inside it all but disappeared. A translucent white plate keeps
        // the same "quiet placeholder" weight it had on the light ground.
        <div className="flex flex-col items-center justify-center py-8 text-center mt-4">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <QrCode className="h-7 w-7 text-white/50" />
          </div>
          <p className="text-sm font-semibold text-white">QR code not generated yet</p>
          <p className="mt-1 max-w-[220px] text-xs text-white/65">
            Ask an administrator to generate QR codes for your Mandal.
          </p>
        </div>
      ) : (
        // The accordion is a class swap rather than a conditional render, so the
        // <img> stays mounted: unmounting it would re-request the file on every
        // Show, and a 404 that had already set `failed` would be re-tried from
        // scratch each time.
        //
        // CAPPED, not just `w-full`. The image is square, so an uncapped width
        // is also its height: in a full-width card on a tablet that is a ~700px
        // QR code filling the screen, and on a phone one taller than the
        // viewport. 260px is comfortably scannable and stops the card growing
        // with whatever column it happens to be placed in.
        //
        // CLOSED READS TWO WAYS: `hidden` alone when the card folds at every
        // width, and `hidden sm:block` otherwise — the second is what keeps the
        // original card open on a desktop whatever the state says.
        <div
          id={panelId}
          className={open ? 'block mt-4' : `hidden${alwaysCollapsible ? '' : ' sm:block'}`}
        >
          <img
            // Changes only when the CORS attempt falls back, which forces the
            // one re-request that retry needs — swapping `crossOrigin` on a
            // mounted element is not reliably a reason for the browser to fetch
            // again. It does not disturb the "stays mounted" note above: the key
            // is stable for the life of the card unless that fallback happens.
            key={qrCors ? 'cors' : 'plain'}
            src={qrUrlForUser(userId)}
            crossOrigin={qrCors ? 'anonymous' : undefined}
            alt={`QR code for ${fullName || 'your account'}`}
            /*
             * ⚠ THE TILE STAYS WHITE, AND THAT IS NOT A STYLING OVERSIGHT.
             *
             * `bg-white` and `p-2` are what give the code its quiet zone — the
             * light margin a scanner needs to find the symbol's edges. Painting
             * this navy to match the card would leave dark modules on a dark
             * ground with no border, which is the one change on this card that
             * would stop the QR being readable at the Sabha door.
             *
             * The border went with the navy, though: `#E2EAF4` was a hairline
             * separating a white tile from a white card, and the tile now sits
             * on navy, which separates it far better than a pale blue ring can.
             */
            className="mx-auto aspect-square w-full max-w-[260px] rounded-2xl bg-white object-contain p-2"
            // A missing file and a CORS refusal are indistinguishable here, so
            // the CORS attempt is spent first and only a plain load may conclude
            // the code was never generated.
            onError={() => (qrCors ? setQrCors(false) : setFailed(true))}
          />
          {hint && <p className="mt-3 text-center text-xs text-white/70">{hint}</p>}
        </div>
      )}
    </div>
  );
}
