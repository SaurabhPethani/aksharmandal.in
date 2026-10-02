import { PermissionsAndroid, Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';
import { apiUrl, getAccessToken } from '../api/client';

// Pulling an authenticated file (Excel, PDF, …) out of the API and onto the
// device. Fetched outside axios, which has no reliable binary response on RN.
//
// Returns `{ ok, mode?, reason? }` rather than throwing, like utils/saveImage.js.
// `mode` is 'download' when the file landed in the Downloads folder and 'share'
// when it went through the share sheet; `reason: 'cancelled'` means the user
// dismissed that sheet.

const MIME_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

const mimeTypeOf = filename =>
  MIME_TYPES[filename.split('.').pop().toLowerCase()] ??
  'application/octet-stream';

/** Android only: copy a fetched file into the public Downloads folder. */
async function saveToDownloads(source, filename, mimeType) {
  if (Platform.Version >= 29) {
    await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
      { name: filename, parentFolder: '', mimeType },
      'Download',
      source,
    );
    return;
  }

  // Android 9 and below write the file themselves, and need permission to.
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
  );
  if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('Storage access was denied.');
  }
  const target = `${ReactNativeBlobUtil.fs.dirs.LegacyDownloadDir}/${filename}`;
  await ReactNativeBlobUtil.fs.cp(source, target);
  // Lists it in the Downloads app; the file is saved whether or not this works.
  await ReactNativeBlobUtil.android
    .addCompleteDownload({
      title: filename,
      description: 'Akshar Connect',
      mime: mimeType,
      path: target,
      showNotification: true,
    })
    .catch(() => {});
}

/**
 * Download `path` (a relative API path) as `filename`.
 *
 * Android saves it to the Downloads folder. iOS has no such folder for an app
 * to write to, so there — and on Android if the save is refused — the file goes
 * to the share sheet instead, where "Save to Files" is one of the targets.
 */
export async function downloadFile(path, filename) {
  const cached = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;
  const mimeType = mimeTypeOf(filename);
  const token = getAccessToken();

  try {
    const res = await ReactNativeBlobUtil.config({ path: cached }).fetch(
      'GET',
      apiUrl(path),
      token ? { Authorization: `Bearer ${token}` } : undefined,
    );
    const { status } = res.info();
    if (status < 200 || status >= 300) {
      await ReactNativeBlobUtil.fs.unlink(cached).catch(() => {});
      return { ok: false, reason: `The file could not be read (${status}).` };
    }

    if (Platform.OS === 'android') {
      try {
        await saveToDownloads(res.path(), filename, mimeType);
        await ReactNativeBlobUtil.fs.unlink(cached).catch(() => {});
        return { ok: true, mode: 'download' };
      } catch {
        // fall through to the share sheet rather than stranding the user.
      }
    }

    const result = await Share.open({
      url: `file://${res.path()}`,
      type: mimeType,
      filename,
      failOnCancel: false,
    });
    if (result?.dismissedAction) return { ok: false, reason: 'cancelled' };
    return { ok: true, mode: 'share' };
  } catch (err) {
    return {
      ok: false,
      reason: err?.message || 'Could not download the file.',
    };
  }
}
