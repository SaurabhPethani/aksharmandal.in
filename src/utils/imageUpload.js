// Getting a picture the other way — off the user's device and into the API.
//
// The counterpart to saveImage.js, and the same shape of contract: this never
// throws, because a failure here must not stop the upload. Whatever it cannot
// shrink it hands back untouched, so the worst case is exactly the behaviour
// that existed before it.
//
// WHY A PHONE PHOTO CANNOT BE SENT AS-IS.
//
// A photo off an iPhone is 2–5 MB. The API's own limit is 2 MB, but nothing
// reaches the API to say so: nginx caps a request body at its default 1 MB and
// answers 413 itself, and THAT ANSWER CARRIES NO CORS HEADERS — nginx rejects
// the body before the app that would have added them ever runs. The browser
// blocks the response it cannot read, axios is left with no response at all,
// and the user is told "Network error — check your connection", about a photo
// that was chosen from a working connection and never had anything to do with
// the network. (Measured 2026-08-17: 50 KB → 401, 1.5 MB → 413, 3.5 MB → 413.)
//
// A LIMIT IS THE WRONG FIX ANYWAY. The picture is shown as a 40px chip and a
// 96px disc. Sending four megabytes to render ninety-six pixels is a cost the
// member pays in mobile data for nothing, so this shrinks it rather than
// refusing it — the file lands well under every limit in the chain and nobody
// has to be told about any of them.

/** Longest edge kept. Far beyond any avatar; room for whatever renders one next. */
const MAX_EDGE = 1024;

/**
 * The API's own stated maximum. Shrinking lands a photo two orders of magnitude
 * under this, so it only bites when the shrink could not run at all — a file the
 * browser would not decode, handed on untouched. Saying so plainly beats letting
 * it go and having the 413 come back as "check your connection".
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export function tooLargeMessage(file) {
  const mb = (file.size / (1024 * 1024)).toFixed(1);
  return `That photo is ${mb} MB and could not be resized in this browser. The limit is 2 MB — please choose a smaller one.`;
}

/**
 * Files at or under this are sent untouched. Re-encoding a small photo costs a
 * generation of JPEG quality to save bytes nothing in the chain objects to.
 */
const SHRINK_ABOVE_BYTES = 600 * 1024;

const QUALITY = 0.85;

/**
 * Decode to a bitmap, honouring EXIF orientation.
 *
 * `imageOrientation: 'from-image'` is not optional for this. A photo taken in
 * portrait is stored landscape with an EXIF rotation flag, and a canvas draws
 * the stored pixels — so without it every portrait phone photo would upload
 * lying on its side, which is a worse bug than the one being fixed.
 *
 * `createImageBitmap` also decodes whatever the platform can, so an iPhone that
 * hands over HEIC rather than converting it is decoded by Safari and re-encoded
 * as JPEG here, which is the only reason such a file would be accepted at all.
 */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Older Safari rejects the options argument rather than ignoring it.
      try {
        return await createImageBitmap(file);
      } catch {
        return null;
      }
    }
  }
  return null;
}

const toBlob = (canvas, type, quality) =>
  new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });

/**
 * A chosen file, ready to upload: scaled to `MAX_EDGE` and re-encoded as JPEG.
 *
 * Returns the ORIGINAL file whenever it cannot do better — already small, not
 * decodable, no canvas, or a re-encode that somehow came out bigger. The caller
 * uploads whatever comes back and does not need to know which happened.
 */
export async function prepareProfilePhoto(file) {
  if (!file || file.size <= SHRINK_ABOVE_BYTES) return file;

  const bitmap = await decode(file);
  if (!bitmap) return file;

  try {
    const { width, height } = bitmap;
    if (!width || !height) return file;

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await toBlob(canvas, 'image/jpeg', QUALITY);
    if (!blob || blob.size >= file.size) return file;

    // Renamed to .jpg to match what it now is. The server stores it as JPEG
    // under its own name either way, so this is only for honesty in the
    // multipart part and in anything that logs the filename.
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    // Frees the decoded pixels immediately rather than at the next GC — a
    // full-resolution phone photo is tens of megabytes once decoded.
    bitmap.close?.();
  }
}
