import { toPng } from 'html-to-image';
import { asFile, dataUrlToBlob, isTouchDevice, saveDataUrl } from './saveImage';

// Saving a report table as a picture, and sending that picture to WhatsApp.
//
// Why a picture at all: the people these reports go to read them in a WhatsApp
// group. A spreadsheet is opened by one person in ten; an image is read by
// everyone in the group without leaving the chat.
//
// Every function here returns `{ ok, mode?, reason? }` rather than throwing, so
// the caller can pick its own wording per outcome. `reason: 'cancelled'` means
// the user dismissed the share sheet — that is not a failure and must not raise
// an error toast.

/** The caption that travels with a shared image. */
const caption = (scope) =>
  `Sabha Report — ${scope || 'Akshar Connect'}\nGenerated ${new Date().toLocaleDateString('en-IN')}`;

/** `sabha-report-navsari-2026-08-05` — a filename that sorts and reads. */
const fileStem = (scope) => {
  const slug = String(scope || 'sabha-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  return `sabha-report-${slug}-${new Date().toISOString().slice(0, 10)}`;
};

// `isTouchDevice`, `asFile` and `saveDataUrl` moved to utils/saveImage.js when
// the profile's QR download needed the same two routes out. Nothing about them
// was report-specific, and two copies would have meant fixing one of them.

// ── How sharp the picture is ────────────────────────────────────────────────
//
// These reports are read by pinch-zooming a phone, so the picture is captured at
// several times the size it is drawn at — at 1× the 12px week columns turn to
// mush the moment anyone zooms in. Every limit below is a real ceiling, not a
// preference:

/** Beyond this on either edge a canvas silently comes back blank or scaled. */
const MAX_EDGE = 16384;

/**
 * Total pixels. A canvas is 4 bytes a pixel, so 40M is ~160MB while it renders —
 * about where mobile Safari starts refusing, and it has to survive being turned
 * into a PNG afterwards.
 */
const MAX_PIXELS = 40e6;

/** Past 4× the file gets big for WhatsApp without looking any better. */
const MAX_RATIO = 4;

/**
 * The sharpest capture this report's own size allows.
 *
 * A short report gets the full 4×. A wide one — many weeks, several Sabhas
 * expanded — steps down only as far as it must, rather than failing: a slightly
 * softer picture beats a blank one, and a Mandal with 40 Sabhas open is exactly
 * when someone wants the picture.
 */
export function pixelRatioFor(width, height, cap = MAX_RATIO) {
  if (!(width > 0) || !(height > 0)) return Math.min(MAX_RATIO, cap);
  const byEdge = MAX_EDGE / Math.max(width, height);
  const byArea = Math.sqrt(MAX_PIXELS / (width * height));
  // Never below 1: at that point the limits are already exceeded by the CSS-size
  // capture itself, and shrinking further would not make it legible anyway.
  return Math.max(1, Math.min(MAX_RATIO, cap, byEdge, byArea));
}

/** Load a data-URL (or same-origin URL) as a decoded HTMLImageElement. */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Measure every `[data-capture-image]` inside `element` — its logo image (read
 * off `background-image`) and its box, relative to the element's top-left.
 *
 * These are painted back onto the snapshot by hand (`compositeCaptureImages`)
 * because phone browsers — iOS Safari especially — drop raster images from an
 * html-to-image capture: it serialises the DOM into an SVG `foreignObject` and
 * renders that to a canvas, and Safari refuses to draw nested raster `data:`
 * URLs through that path. The gradient, text and the vector flower pattern
 * survive; the two PNG logos did not, so the shared card came out logo-less on
 * a phone while the desktop download kept them. A `<canvas>` `drawImage` does
 * not use `foreignObject`, so compositing after the capture works everywhere.
 */
function measureCaptureImages(element) {
  const nodes = [...element.querySelectorAll('[data-capture-image]')];
  if (!nodes.length) return [];
  const base = element.getBoundingClientRect();
  return nodes
    .map((node) => {
      const r = node.getBoundingClientRect();
      const bg = getComputedStyle(node).backgroundImage || '';
      const m = /url\(["']?(data:[^"')]+)["']?\)/.exec(bg);
      if (!m || r.width <= 0 || r.height <= 0) return null;
      return { src: m[1], x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    })
    .filter(Boolean);
}

/**
 * Draw the measured `[data-capture-image]` logos onto the captured PNG.
 *
 * `padding`/`ratio` are the same white-frame border and pixel ratio the capture
 * used, so a logo at element-relative (x, y) lands at ((x + padding) * ratio) in
 * the output — the frame shifts everything by `padding`, and every CSS pixel is
 * `ratio` device pixels. The boxes are square and the source logos are square,
 * so `contain` fills the box exactly and a plain `drawImage` matches.
 *
 * Never sinks the capture: a logo that fails to load or a canvas that refuses to
 * export just hands back the original snapshot (logo-less, but a valid picture).
 */
async function compositeCaptureImages(dataUrl, specs, padding, ratio) {
  if (!specs.length) return dataUrl;
  let base;
  try {
    base = await loadImage(dataUrl);
  } catch {
    return dataUrl;
  }
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(base, 0, 0);
  for (const s of specs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const logo = await loadImage(s.src);
      ctx.drawImage(
        logo,
        Math.round((s.x + padding) * ratio),
        Math.round((s.y + padding) * ratio),
        Math.round(s.w * ratio),
        Math.round(s.h * ratio),
      );
    } catch {
      // A logo that will not load must not lose the whole card.
    }
  }
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}

/**
 * The element as a PNG data URL.
 *
 * The table lives inside a horizontal scroller, so only the visible slice would
 * be captured — every scrolling ancestor is opened up for the duration of the
 * snapshot and put back afterwards, and the full scroll size is passed as the
 * capture size. Without that, a wide report is photographed with its right-hand
 * weeks cut off.
 *
 * Resolution is `pixelRatioFor` — as sharp as the report's own size allows,
 * because these are read by pinch-zooming a phone.
 *
 * Any `[data-capture-image]` elements are painted back on with a canvas after
 * the capture — see `measureCaptureImages`. A capture with none (every Sabha
 * report) returns exactly as before.
 */
async function snapshot(element, { framePadding = 0, maxRatio = MAX_RATIO } = {}) {
  if (!element) throw new Error('Nothing to capture.');

  // One frame, so a just-expanded row is laid out before it is photographed.
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // WAIT FOR EVERY <img> TO DECODE FIRST. html-to-image draws whatever each
  // image has decoded at the instant of capture — an <img> still decoding is
  // photographed blank. Never rejects: an image that genuinely fails to load
  // must not sink the whole capture.
  //
  // The Today's Thought header logos are NOT <img> and do not rely on this —
  // they are painted onto the finished snapshot by compositeCaptureImages,
  // because phone browsers drop raster background-images from the capture
  // regardless of decode timing (see measureCaptureImages).
  await Promise.all(
    [...element.querySelectorAll('img')].map((img) => {
      if (img.complete && img.naturalWidth > 0) return undefined;
      if (typeof img.decode === 'function') return img.decode().catch(() => {});
      return new Promise((resolve) => { img.onload = img.onerror = resolve; });
    }),
  );

  // Remove share controls from the live layout during measurement as well as
  // from the cloned image. Filtering alone can leave the control's margin as
  // an empty gap in the generated image.
  const shareControls = [...element.querySelectorAll('[data-share-control]')];
  const previousDisplay = shareControls.map((node) => node.style.display);
  shareControls.forEach((node) => { node.style.display = 'none'; });

  const clipped = [];
  let dataUrl;
  let logoSpecs = [];
  let padding = 0;
  let ratio = 1;
  try {
    const width = Math.max(element.scrollWidth, element.offsetWidth);
    const height = Math.max(element.scrollHeight, element.offsetHeight);

    padding = Math.max(0, Number(framePadding) || 0);
    ratio = pixelRatioFor(width, height, maxRatio);
    // Logo boxes are positioned relative to the element and are not moved by the
    // overflow/clone tweaks below, so measure them now, off the settled layout.
    logoSpecs = measureCaptureImages(element);

    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      clipped.push({ node, overflow: node.style.overflow, x: node.style.overflowX, y: node.style.overflowY });
      node.style.overflow = 'visible';
      node.style.overflowX = 'visible';
      node.style.overflowY = 'visible';
    }

    dataUrl = await toPng(element, {
      pixelRatio: ratio,
      backgroundColor: '#ffffff',
      cacheBust: true,
      // DO NOT EMBED WEB FONTS. The page pulls DM Sans / Sora from the
      // cross-origin `fonts.googleapis.com` stylesheet. html-to-image's
      // default font step reads that sheet's `cssRules` (throws SecurityError,
      // cross-origin) and then FETCHES the CSS to recover — a fetch the site's
      // CSP `connect-src` blocks ("Failed to fetch"). That rejection propagates
      // out of `toPng`, so every capture failed: the dashboard thought stuck on
      // "Preparing…", the Sabha report share erroring out. We don't need the
      // exact webfont in a shared PNG — the system sans-serif renders fine — so
      // skip the embed entirely and the capture succeeds.
      skipFonts: true,
      filter: (node) => !node?.hasAttribute?.('data-share-control'),
      width: width + padding * 2,
      height: height + padding * 2,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        boxSizing: 'content-box',
        display: 'block',
        margin: '0 auto',
        border: padding ? `${padding}px solid #ffffff` : undefined,
        backgroundColor: padding ? '#ffffff' : undefined,
      },
    });
  } finally {
    for (const c of clipped) {
      c.node.style.overflow = c.overflow;
      c.node.style.overflowX = c.x;
      c.node.style.overflowY = c.y;
    }
    shareControls.forEach((node, index) => {
      node.style.display = previousDisplay[index];
    });
  }

  // Paint the logos onto the finished capture (see measureCaptureImages). No-op
  // for a report with no [data-capture-image] — returns the toPng output as-is.
  return compositeCaptureImages(dataUrl, logoSpecs, padding, ratio);
}

/**
 * Save the report as a PNG.
 *
 * On a phone that means the share sheet — a browser download lands in a Files
 * folder the gallery does not index, and "save the image" is what was meant.
 * On a desktop it is an ordinary download.
 */
export async function saveReportImage({ element, scope }) {
  try {
    const dataUrl = await snapshot(element);
    const name = `${fileStem(scope)}.png`;

    // Try the native file share first on every platform that supports it.
    // The share sheet can hand the PNG directly to WhatsApp without creating
    // a Downloads file first. Browsers without file sharing use the fallbacks
    // below because web pages cannot attach a local file to WhatsApp Web URLs.
    if (navigator.share) {
      try {
        const file = await asFile(dataUrl, name);
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Sabha Report', text: caption(scope) });
          return { ok: true, mode: 'share' };
        }
      } catch (err) {
        // Dismissing the sheet is a decision, not an error.
        if (err?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
        // Anything else: fall through to the download below rather than
        // stranding the user with no picture.
      }
    }

    saveDataUrl(dataUrl, name);
    return { ok: true, mode: 'download' };
  } catch (err) {
    return { ok: false, reason: err?.message || 'Could not save the image.' };
  }
}

/**
 * How big a picture the share sheet will actually accept.
 *
 * `navigator.share` is not a file copy — the PNG is serialised across a process
 * boundary to the OS share service, and past a few megabytes Android and iOS
 * reject it with a bare error carrying no reason. A 4x capture clears that
 * easily, and the rejection lands the user in the download branch they did not
 * ask for. ~1.5MB survives everywhere and is still sharper than WhatsApp's own
 * re-encode of it.
 */
const SHARE_MAX_BYTES = 1.5 * 1024 * 1024;

/** The byte count behind a `data:` URL, without decoding it. */
const dataUrlBytes = (dataUrl) => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

/**
 * A capture small enough for the share sheet to take.
 *
 * Steps the resolution down rather than giving up: sharpness is worth having,
 * but not at the price of the share silently turning back into a download.
 */
async function shareSnapshot(element, { framePadding = 0 } = {}) {
  let dataUrl = await snapshot(element, { framePadding });
  for (const cap of [2, 1.5, 1]) {
    if (dataUrlBytes(dataUrl) <= SHARE_MAX_BYTES) break;
    dataUrl = await snapshot(element, { framePadding, maxRatio: cap });
  }
  return dataUrl;
}

/**
 * Take the picture BEFORE the click that shares it. Call this on mount and hand
 * the result back in as `prepared`.
 *
 * THIS IS THE WHOLE BUG. `navigator.share` requires TRANSIENT USER ACTIVATION —
 * the click must still be "live" when it is called. Capturing this card takes
 * one to three seconds on a phone, and Chrome's activation window is five;
 * iOS Safari drops activation on the FIRST await regardless of the clock. So
 * capturing inside the click handler and then calling `share` means the browser
 * refuses with a NotAllowedError, the catch swallows it, and the picture is
 * downloaded instead of shared — on HTTPS, with a perfectly good share sheet
 * sitting right there. Moving the slow half off the gesture is the fix.
 */
export async function prepareReportShare({ element, scope, text: shareText, imagePadding = 0 }) {
  const dataUrl = await shareSnapshot(element, { framePadding: imagePadding });
  const name = `${fileStem(scope)}.png`;
  return {
    dataUrl,
    name,
    // `??`, not `||`: an explicit empty string is a caller asking for NO caption
    // (Today's Thought — the text is already in the picture). Only `undefined`
    // falls back to the default report caption.
    text: shareText ?? caption(scope),
  };
}

/**
 * Send the report to WhatsApp, best route first:
 *
 *   share      phone — the real share sheet, image attached, pick a chat
 *   clipboard  desktop — copy the PNG, open WhatsApp Web for paste
 *   fallback   neither — open WhatsApp Web with the text, image downloaded
 *
 * There is no way to attach a file to WhatsApp Web from a link, so the desktop
 * routes end in the user pasting or attaching. Each returns its own `mode` so
 * the caller can say which of those just happened.
 */
export async function shareReportOnWhatsApp({
  element,
  scope,
  text: shareText,
  imagePadding = 0,
  title = 'Sabha Report',
  prepared,
}) {
  try {
    // `prepared` short-circuits every await below, so a click that supplies it
    // reaches `navigator.share` with its activation intact. Without it the
    // capture happens here and the share will very likely be refused — see
    // `prepareReportShare`.
    const name = prepared?.name || `${fileStem(scope)}.png`;
    const dataUrl = prepared?.dataUrl || await shareSnapshot(element, { framePadding: imagePadding });
    const file = prepared?.file || await asFile(dataUrl, name);
    // `??` throughout so an explicit '' (Today's Thought: share the image with
    // no caption) is preserved instead of collapsing to the default caption.
    const text = prepared?.text ?? shareText ?? caption(scope);

    // Why the picture could not be handed over, when it could not. Carried out
    // to the caller so it can SAY it: a share that quietly becomes a download
    // is the one bug report that arrives with no information in it.
    let detail = null;

    // Native file sharing must be attempted before any download fallback. On
    // phones this opens the OS share sheet with the PNG already attached, so
    // WhatsApp can receive the image directly.
    //
    // ATTEMPTED WHENEVER `share` EXISTS on a TOUCH device, not only when
    // `canShare` agrees. Some mobile webviews answer false and then share the
    // file perfectly well, and the old `if (canShare)` guard skipped the share
    // WITHOUT throwing — so the code fell through to a download having never
    // asked the OS at all.
    //
    // The `isTouchDevice()` guard is REQUIRED: desktop Chrome/Edge also expose
    // `navigator.share`, but there it opens the Windows/macOS OS share sheet,
    // which has no WhatsApp. Desktop must skip straight to the clipboard route
    // below (copy the PNG, open WhatsApp Web) — that is the path that reaches
    // WhatsApp on a PC.
    if (isTouchDevice() && navigator.share) {
      try {
        // Attach `title`/`text` ONLY when non-empty. WhatsApp shows the share
        // title as the message caption, so a title like "Today's Thought" rides
        // along as unwanted text next to the picture. Today's Thought passes
        // both empty, so the share is the image ALONE — no caption.
        const shareData = { files: [file] };
        if (title) shareData.title = title;
        if (text) shareData.text = text;
        await navigator.share(shareData);
        return { ok: true, mode: 'share' };
      } catch (err) {
        if (err?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
        detail = err?.message || String(err);
      }
    } else if (!navigator.share) {
      // No share sheet at all (and not just a desktop we deliberately skipped).
      // Nearly always the ORIGIN rather than the browser: the API does not exist
      // outside a secure context, so a phone on `http://192.168.x.x` can never
      // share and can only download.
      detail = window.isSecureContext
        ? 'this browser has no share sheet'
        : 'the page is not on HTTPS';
    }

    // Desktop only. On a phone this would copy the image and then strand the
    // user in a WhatsApp Web tab they cannot paste a file into comfortably.
    if (!isTouchDevice() && navigator.clipboard?.write && window.ClipboardItem) {
      try {
        // The blob goes in as a PROMISE rather than being awaited first: Safari
        // spends the click's activation on any await preceding `write` and then
        // refuses. Chrome and Firefox accept either form. Decoded locally rather
        // than `fetch(dataUrl)` — CSP `connect-src` blocks the `data:` scheme on
        // this zone, so fetching it fails with "Failed to fetch".
        await navigator.clipboard.write([
          new window.ClipboardItem({ 'image/png': Promise.resolve(dataUrlToBlob(dataUrl)) }),
        ]);
        window.open('https://web.whatsapp.com/', '_blank', 'noopener');
        return { ok: true, mode: 'clipboard' };
      } catch (err) {
        detail = detail || err?.message || String(err);
      }
    }

    // Last resort: the picture is saved so there is something to attach.
    saveDataUrl(dataUrl, name);
    if (!isTouchDevice()) {
      // Open a plain compose window when there is no caption (Today's Thought),
      // otherwise prefill the report caption.
      const url = text
        ? `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`
        : 'https://web.whatsapp.com/';
      window.open(url, '_blank', 'noopener');
    }
    return { ok: true, mode: 'fallback', detail };
  } catch (err) {
    return { ok: false, reason: err?.message || 'Could not share to WhatsApp.' };
  }
}
