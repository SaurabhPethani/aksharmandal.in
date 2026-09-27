import ReactNativeBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';
import { apiUrl, getAccessToken } from '../api/client';

// Pulling an authenticated file (Excel, PDF, …) out of the API and onto the
// device — the mobile equivalent of the web's blob→object-URL→anchor-click
// pattern (see reportService.download / useReportDownload), which does not
// exist here: there is no Blob, no URL.createObjectURL and no DOM to click an
// anchor in. Same idea as utils/saveImage.js's image fetch, generalised to any
// file the API hands back with `Content-Disposition: attachment`.
//
// Returns `{ ok, reason? }` rather than throwing, so a caller can word the
// outcome itself. `reason: 'cancelled'` means the user dismissed the share
// sheet — a decision, not a failure.

/**
 * Download `path` (a relative API path) as `filename`, and hand it to the OS
 * share sheet so the user can save it wherever they like (Drive, WhatsApp, a
 * local Files app). Sent with the caller's own access token, exactly as `api`
 * would attach it — this is the one file fetch that does not go through axios,
 * since axios/RN has no reliable binary (Blob) response type.
 */
export async function downloadAndShareFile(path, filename) {
  const url = apiUrl(path);
  const token = getAccessToken();
  const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${filename}`;

  try {
    const res = await ReactNativeBlobUtil.config({ path: dest }).fetch(
      'GET',
      url,
      token ? { Authorization: `Bearer ${token}` } : undefined,
    );
    const { status } = res.info();
    if (status < 200 || status >= 300) {
      await ReactNativeBlobUtil.fs.unlink(dest).catch(() => {});
      return { ok: false, reason: `The file could not be read (${status}).` };
    }

    const result = await Share.open({
      url: `file://${res.path()}`,
      filename,
      failOnCancel: false,
    });
    if (result?.dismissedAction) return { ok: false, reason: 'cancelled' };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err?.message || 'Could not download the file.',
    };
  }
}
