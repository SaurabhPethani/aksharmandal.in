// Getting a picture out of the app and onto the user's device.
//
// The primitives only — no idea what the picture is OF. `reportImage.js` builds
// its images by snapshotting a DOM node and brings them here to be saved; the
// profile's QR code is a file that already exists on the API and comes here to
// be fetched and saved. Both want the same two routes out, and when each had its
// own copy of them only one of the two would have been fixed.
//
// Functions return `{ ok, mode?, reason? }` rather than throwing, so a caller can
// word each outcome itself. `reason: 'cancelled'` means the user dismissed the
// share sheet — a decision, not a failure, and never an error toast.

/**
 * A touch device, as far as the share sheet is concerned.
 *
 * `navigator.share` with a file exists on desktop Chrome too but opens a share
 * target list nobody wants for this; on a phone it is the ONLY route to the
 * camera roll, which is where these end up. userAgentData first, then the UA
 * string, then the iPad-pretending-to-be-a-Mac case (Macintosh + touch points).
 */
export function isTouchDevice() {
  try {
    const mobile = navigator.userAgentData?.mobile;
    if (mobile === true) return true;
    if (mobile === false) return false;
  } catch {
    // userAgentData is absent or throws in some embedded webviews.
  }
  const ua = navigator.userAgent || '';
  return (
    /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile Safari/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

/**
 * Decode a `data:` URL to a Blob IN PROCESS — no `fetch`.
 *
 * `fetch(dataUrl)` was the obvious way to do this, but this zone's CSP
 * `connect-src` does not list the `data:`/`blob:` schemes, so the browser
 * refuses the request with a bare "Failed to fetch". That silently broke every
 * report/thought capture (the share `File` could never be built). Parsing the
 * base64 ourselves touches no network and is not subject to `connect-src`.
 */
export function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(5, comma); // between 'data:' and the comma
  const mime = header.split(';')[0] || 'application/octet-stream';
  const data = dataUrl.slice(comma + 1);
  if (/;base64/i.test(header)) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(data)], { type: mime });
}

/**
 * A URL as a File to hand `share`. `data:` URLs are decoded locally (CSP blocks
 * fetching them — see `dataUrlToBlob`); anything else is fetched.
 */
export const asFile = async (url, name, type = 'image/png') => {
  const blob = url.startsWith('data:')
    ? dataUrlToBlob(url)
    : await (await fetch(url)).blob();
  return new File([blob], name, { type: blob.type || type });
};

/**
 * Save a URL the browser can already read — a `data:` or `blob:` URL.
 *
 * NOT for a remote address. `download` is honoured only for same-origin URLs, so
 * on a cross-origin one the browser ignores the attribute and NAVIGATES to the
 * image instead, leaving the user on a bare JPEG with the app gone. Remote
 * pictures go through `saveRemoteImage`, which fetches first.
 */
export function saveDataUrl(dataUrl, name) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Save a picture that lives at a URL — fetched, then handed to the share sheet
 * on a phone or downloaded anywhere else.
 *
 * FETCHED RATHER THAN LINKED TO, for the reason above: in production the API is
 * a different origin from the app, so `<a href={apiUrl(...)} download>` would
 * navigate rather than save. Fetching turns it into a blob this origin owns, and
 * the download attribute is honoured again.
 *
 * The blob URL is revoked once the click is through. Without that the image is
 * pinned in memory for the life of the document, which for a QR the user
 * regenerates a few times is a leak with no upper bound.
 */
/**
 * The fetch, with one retry that bypasses the browser's cache.
 *
 * A cached copy can be one this request is not allowed to READ. These images are
 * also rendered as plain `<img>` on the page that offers the download, and a
 * plain image load sends no `Origin`, so the reply it stores carries no
 * `Access-Control-Allow-Origin` — reuse that entry for a CORS fetch and the
 * browser refuses it, as a thrown TypeError rather than a status.
 *
 * The API no longer answers without that header, but a copy stored BEFORE that
 * outlives the fix — for four hours, this zone's browser TTL. `cache: 'reload'`
 * goes past it to the network and replaces the entry, so the second attempt
 * succeeds and the first attempt never happens again. Only worth spending on a
 * throw: a real network failure costs one extra request, and an HTTP error
 * status is not this problem and is returned as-is.
 */
async function fetchImage(url) {
  try {
    return await fetch(url, { credentials: 'omit' });
  } catch {
    return fetch(url, { credentials: 'omit', cache: 'reload' });
  }
}

/**
 * Share an already-rendered image (at a URL) to WhatsApp — the Today's Thought
 * card, which the server pre-renders, so there is NO html-to-image capture here.
 *
 *   share      phone — the OS share sheet with the file attached, pick a chat
 *   clipboard  desktop — copy the PNG, open WhatsApp Web to paste
 *   fallback   neither — download the file, open WhatsApp Web
 *
 * The file is fetched cross-origin (the image lives on the API host); the serve
 * route sends CORS, and `fetchImage`'s cache-busting retry covers the
 * cached-without-CORS case (see [[cors-cacheable-image-responses]]). Returns
 * `{ ok, mode?, reason? }` like the report share; `reason: 'cancelled'` is the
 * user dismissing the sheet, not a failure.
 */
export async function shareRemoteImageOnWhatsApp(url, name) {
  let blob;
  try {
    const res = await fetchImage(url);
    if (!res.ok) return { ok: false, reason: `The image could not be read (${res.status}).` };
    blob = await res.blob();
  } catch (err) {
    return { ok: false, reason: err?.message || 'Could not load the image.' };
  }
  const file = new File([blob], name, { type: blob.type || 'image/png' });

  // Phone: native share sheet (the only route to WhatsApp with the image attached).
  if (isTouchDevice() && navigator.share) {
    try {
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return { ok: true, mode: 'share' };
      }
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
      // else fall through to a download rather than stranding the user.
    }
  }

  // Desktop: copy the PNG and open WhatsApp Web for a paste.
  if (!isTouchDevice() && navigator.clipboard?.write && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([
        new window.ClipboardItem({ [blob.type || 'image/png']: blob }),
      ]);
      window.open('https://web.whatsapp.com/', '_blank', 'noopener');
      return { ok: true, mode: 'clipboard' };
    } catch {
      // fall through to the download fallback.
    }
  }

  // Last resort: save the file so there is something to attach.
  const href = URL.createObjectURL(blob);
  try {
    saveDataUrl(href, name);
  } finally {
    URL.revokeObjectURL(href);
  }
  if (!isTouchDevice()) window.open('https://web.whatsapp.com/', '_blank', 'noopener');
  return { ok: true, mode: 'fallback' };
}

export async function saveRemoteImage(url, name) {
  try {
    const res = await fetchImage(url);
    if (!res.ok) return { ok: false, reason: `The image could not be read (${res.status}).` };
    const blob = await res.blob();

    if (isTouchDevice() && navigator.share) {
      try {
        const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          return { ok: true, mode: 'share' };
        }
      } catch (err) {
        // Dismissing the sheet is a decision, not an error.
        if (err?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
        // Anything else: fall through to the download rather than stranding the
        // user with no picture.
      }
    }

    const href = URL.createObjectURL(blob);
    try {
      saveDataUrl(href, name);
    } finally {
      URL.revokeObjectURL(href);
    }
    return { ok: true, mode: 'download' };
  } catch (err) {
    return { ok: false, reason: err?.message || 'Could not save the image.' };
  }
}
