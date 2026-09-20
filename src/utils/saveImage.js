import { PermissionsAndroid, Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import Share from 'react-native-share';

// Getting a picture out of the app and onto the user's device — the mobile port
// of the web's utils/saveImage.js, with the same two routes out and the same
// results.
//
// The primitives only — no idea what the picture is OF. The Today's Thought card
// is a file that already exists on the API and comes here to be fetched and
// saved or shared.
//
// Functions return `{ ok, mode?, reason? }` rather than throwing, so a caller can
// word each outcome itself. `reason: 'cancelled'` means the user dismissed the
// share sheet — a decision, not a failure, and never an error message.
//
// What the web version needs and this one does not: `isTouchDevice` (this is
// always a phone), the CORS cache-busting retry and blob URLs (native requests
// have no CORS and no browser cache), and the clipboard / WhatsApp Web route
// (there is a real WhatsApp app to hand the file to).

const WHATSAPP = [
  { pkg: 'com.whatsapp', social: Share.Social.WHATSAPP },
  { pkg: 'com.whatsapp.w4b', social: Share.Social.WHATSAPPBUSINESS },
];

/**
 * The fetch — into a file in the app cache, not memory.
 *
 * FETCHED RATHER THAN LINKED TO, like the web: the gallery and the share
 * targets are handed the picture itself, so WhatsApp receives an image rather
 * than a link to one. A failed status leaves an error body in the file, so that
 * file is removed and the status returned for the caller to report.
 */
async function fetchImage(url, name) {
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${name}`;
  const res = await ReactNativeBlobUtil.config({ path }).fetch(
    'GET',
    encodeURI(url.trim()),
  );
  const { status } = res.info();
  const ok = status >= 200 && status < 300;
  if (!ok) await ReactNativeBlobUtil.fs.unlink(path).catch(() => {});
  return { ok, status, uri: `file://${res.path()}` };
}

/** Android 9 and below need storage permission to write to the gallery. */
async function canWriteToGallery() {
  if (Platform.OS !== 'android' || Platform.Version >= 29) return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/** The OS share sheet with the file attached. */
async function openShareSheet(uri, name) {
  const result = await Share.open({
    url: uri,
    type: 'image/png',
    filename: name,
    failOnCancel: false,
  });
  if (result?.dismissedAction) return { ok: false, reason: 'cancelled' };
  return { ok: true, mode: 'share' };
}

/**
 * Share an already-rendered image (at a URL) to WhatsApp — the Today's Thought
 * card, which the server pre-renders.
 *
 *   Android + WhatsApp   straight into WhatsApp's chat picker with the image
 *   otherwise            the OS share sheet with the file attached (WhatsApp is
 *                        listed there when installed — the route on iOS)
 *
 * Both return `mode: 'share'`, as the web's phone route does.
 */
export async function shareRemoteImageOnWhatsApp(url, name) {
  let uri;
  try {
    const res = await fetchImage(url, name);
    if (!res.ok) {
      return {
        ok: false,
        reason: `The image could not be read (${res.status}).`,
      };
    }
    uri = res.uri;
  } catch (err) {
    return { ok: false, reason: err?.message || 'Could not load the image.' };
  }

  if (Platform.OS === 'android') {
    try {
      for (const { pkg, social } of WHATSAPP) {
        const { isInstalled } = await Share.isPackageInstalled(pkg);
        if (isInstalled) {
          await Share.shareSingle({
            url: uri,
            type: 'image/png',
            filename: name,
            social,
          });
          return { ok: true, mode: 'share' };
        }
      }
    } catch {
      // fall through to the share sheet rather than stranding the user.
    }
  }

  try {
    return await openShareSheet(uri, name);
  } catch (err) {
    return { ok: false, reason: err?.message || 'Could not share the image.' };
  }
}

/**
 * Save a picture that lives at a URL — fetched, then written straight into the
 * gallery (Photos on iOS) with `mode: 'download'`.
 *
 * If the gallery refuses (e.g. Photos access denied), fall through to the share
 * sheet with `mode: 'share'` rather than stranding the user with no picture.
 */
export async function saveRemoteImage(url, name) {
  try {
    if (!(await canWriteToGallery())) {
      return { ok: false, reason: 'Allow storage access to save the image.' };
    }
    const res = await fetchImage(url, name);
    if (!res.ok) {
      return {
        ok: false,
        reason: `The image could not be read (${res.status}).`,
      };
    }

    try {
      await CameraRoll.saveAsset(res.uri, { type: 'photo' });
      return { ok: true, mode: 'download' };
    } catch {
      return await openShareSheet(res.uri, name);
    }
  } catch (err) {
    return { ok: false, reason: err?.message || 'Could not save the image.' };
  }
}
