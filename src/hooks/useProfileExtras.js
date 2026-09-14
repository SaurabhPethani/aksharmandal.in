import { useCallback, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { profileService } from '../services/profileService';
import { MAX_UPLOAD_BYTES, prepareProfilePhoto, tooLargeMessage } from '../utils/imageUpload';
import { STORAGE_KEYS } from '../constants/storage';
import { LOOKUP_CACHE } from './cache';

// The signed-in member's own photo and resumes. Both hang off /profile and
// nothing else reads them, so they live apart from useUsers.

/**
 * THE PHOTO'S ADDRESS DOES NOT CHANGE WHEN THE PHOTO DOES.
 *
 * The backend derives the filename from the member id — `user-<id>.jpg`, see
 * profile_image_service.profile_image_filename — so the `image_url` returned
 * after an upload is byte-identical to the one returned before it. Refetching
 * the query was therefore never the missing piece: it already happens (the
 * mutation invalidates, and utils/queryClient invalidates everything besides),
 * and it produces the same string. React re-renders with an unchanged `src`, so
 * the `<img>` is never asked to load anything, and on the occasions it is, the
 * browser answers from its own copy. The old face stayed on screen until a
 * reload.
 *
 * So an upload bumps a version stamp, and the stamp is appended to the URL. That
 * is what actually makes the image reload, and it is the same trick the QR code
 * already uses for the same reason — see `qrNonce` in ProfilePage.
 *
 * THE SERVER'S HALF IS SEPARATE, AND NEITHER HALF REPLACES THE OTHER. The route
 * now states a short freshness lifetime and answers a revalidation with a 304
 * (see the backend's app/core/http_cache.py), which is what stops a shared cache
 * inventing a lifetime of its own and showing a replaced photo to OTHER members
 * for hours. It cannot do this job as well: a lifetime short enough to feel
 * instant would be no cache at all. The stamp is what makes it instant for the
 * person who just uploaded, by asking for an address no cache has ever seen.
 *
 * THE STAMP LIVES OUTSIDE THE QUERY DATA, deliberately. Writing it into the
 * cached response would work until the next refetch replaced it with the
 * server's clean URL — and then the browser's cached bytes would come back,
 * minutes after the upload, with nothing on screen to explain it. Keeping it
 * beside the cache and applying it in `select` means every future refetch is
 * stamped too.
 *
 * AND IT OUTLIVES THE TAB, which an in-memory version did not. Held only in
 * this module, the stamp died with the page: the next load asked for the plain
 * URL, the browser answered from the copy it was still holding, and the photo
 * that had just been replaced came back as the old one. On a phone that is most
 * loads — a PWA is backgrounded and cold-started constantly, which is why this
 * read as "works on desktop, broken on mobile" rather than as one bug.
 *
 * A short `max-age` from the server would have made that window small. It does
 * not arrive: Cloudflare's Browser Cache TTL rewrites every `max-age` on the
 * zone to its own value (4 hours, as of 2026-08-17), so the origin's 300 never
 * reaches anybody. Persisting the stamp is what makes this correct WITHOUT
 * depending on a dashboard setting — the URL is simply one the stale cache has
 * never been asked for.
 *
 * Keyed by user id, so uploading for one member does not reload every avatar.
 */
const stampWatchers = new Set();

/** Enough for an admin working through a list; old entries are of no use. */
const MAX_REMEMBERED = 50;

function readStamps() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.photoStamps) || '{}');
    // Anything but an object of numbers is treated as absent rather than
    // trusted: this is parsed on every cold start, and a hand-edited or
    // half-written value must not be able to throw the module's first render.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const photoStamps = new Map(
  Object.entries(readStamps()).filter(([, at]) => Number.isFinite(at))
);

const stampFor = (userId) => photoStamps.get(String(userId)) ?? null;

function bumpPhotoStamp(userId) {
  photoStamps.set(String(userId), Date.now());
  // Oldest first, so the newest MAX_REMEMBERED survive. Insertion order is
  // enough: `set` on an existing key keeps its original position, and the value
  // is the sort key anyway.
  if (photoStamps.size > MAX_REMEMBERED) {
    const oldest = [...photoStamps.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, photoStamps.size - MAX_REMEMBERED);
    for (const [key] of oldest) photoStamps.delete(key);
  }
  try {
    localStorage.setItem(STORAGE_KEYS.photoStamps, JSON.stringify(Object.fromEntries(photoStamps)));
  } catch { /* private mode — the stamp still works for this tab */ }
  for (const notify of stampWatchers) notify();
}

function watchPhotoStamps(notify) {
  stampWatchers.add(notify);
  return () => stampWatchers.delete(notify);
}

/** `null` in, `null` out — an unset photo stays unset rather than becoming "?v=". */
const withStamp = (url, stamp) =>
  (url && stamp ? `${url}${url.includes('?') ? '&' : '?'}v=${stamp}` : url || null);

/**
 * A member photo URL with the current stamp on it, or the URL untouched when
 * nothing has been uploaded in this session. Exported so a screen holding a
 * photo from somewhere other than this query — the member record's own
 * `photo_url` — can show the same freshly uploaded image rather than the
 * cached one.
 */
export const stampPhotoUrl = (url, userId) => withStamp(url, stampFor(userId));

/** Re-renders the caller whenever this member's photo is replaced. */
export function usePhotoStamp(userId) {
  return useSyncExternalStore(watchPhotoStamps, () => stampFor(userId));
}

/** The stored profile photo. `image_url` is null until one has been uploaded. */
export function useProfileImage(userId, enabled = true) {
  // Subscribed to as state rather than read inside `select`, because a stamp
  // nobody is watching changes nothing: `data` is identical after an upload, so
  // a NEW SELECT IDENTITY is the only thing React Query re-runs the transform
  // for. That identity is what this dependency produces.
  const stamp = usePhotoStamp(userId);
  const select = useCallback(
    (data) => (data ? { ...data, image_url: withStamp(data.image_url, stamp) } : data),
    [stamp]
  );

  return useQuery({
    queryKey: ['profile-image', String(userId)],
    queryFn: () => profileService.profileImage(userId),
    enabled: enabled && Boolean(userId),
    select,
    ...LOOKUP_CACHE,
  });
}

/**
 * Saving your own record: the direct half is applied, the restricted half is
 * requested. Either may be empty; both being empty is a save with nothing in it
 * and is decided by the caller before getting here.
 *
 * The two calls are sequential, not concurrent, and the direct one goes first:
 * if it fails there is no point opening an approval request for the same save,
 * whereas the reverse would leave a pending request whose direct half never
 * landed. Whatever the first call fails with is what the member is told.
 */
export function useSelfSave(userId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ direct, request }) => {
      const applied = Object.keys(direct ?? {}).length
        ? await profileService.updateMe(direct)
        : null;
      const requested = Object.keys(request ?? {}).length
        ? await profileService.submitInformationRequest(request)
        : null;
      return { applied, requested };
    },
    onSuccess: () => {
      // Only the direct half can have changed the record, but re-reading it is
      // how the form and the profile page agree on what was saved.
      queryClient.invalidateQueries({ queryKey: ['user', String(userId)] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useUploadProfileImage(userId) {
  const queryClient = useQueryClient();
  return useMutation({
    /**
     * Shrunk before it is sent. A phone photo is 2–5 MB and nginx caps a body at
     * 1 MB, answering 413 with no CORS headers — so the browser blocked a
     * response it could not read and the member was told their connection had
     * failed. See utils/imageUpload.js; it hands back the original file whenever
     * it cannot do better, so this can only ever help.
     */
    mutationFn: async (file) => {
      const prepared = await prepareProfilePhoto(file);
      // Only reachable when the shrink could not run — a file this browser would
      // not decode, passed through at its original size. Refusing it here is the
      // difference between a sentence that says what to do and a 413 the browser
      // will not let us read.
      if (prepared.size > MAX_UPLOAD_BYTES) throw new Error(tooLargeMessage(prepared));
      return profileService.uploadProfileImage(userId, prepared);
    },
    onSuccess: () => {
      // FIRST, and the only line here that makes the new photo appear: the URL
      // is the same one as before, so without a new stamp the refetches below
      // hand every `<img>` back the address it is already showing. See the note
      // on photoStamps above.
      bumpPhotoStamp(userId);
      queryClient.invalidateQueries({ queryKey: ['profile-image', String(userId)] });
      // The member record carries the photo too, on whichever screens read it.
      queryClient.invalidateQueries({ queryKey: ['user', String(userId)] });
    },
  });
}

/**
 * Remove the caller's uploaded photo. Mirrors the upload's cache handling — bump
 * the photo stamp so every `<img>` re-checks the (now-absent) file, and refresh
 * the profile-image and member queries so the screen falls back to the initials.
 */
export function useRemoveProfileImage(userId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => profileService.removeProfileImage(userId),
    onSuccess: () => {
      bumpPhotoStamp(userId);
      queryClient.invalidateQueries({ queryKey: ['profile-image', String(userId)] });
      queryClient.invalidateQueries({ queryKey: ['user', String(userId)] });
    },
  });
}

/**
 * Resumes are snapshots: each is built from the profile as it stood, and later
 * edits do not change one already generated. That is why they are a list rather
 * than a single current file, and why nothing here tries to keep them in step
 * with the record.
 */
export function useMyResumes(enabled = true) {
  return useQuery({
    queryKey: ['my-resumes'],
    queryFn: profileService.myResumes,
    enabled,
  });
}

/**
 * Rewrites the member's QR JPEG. The image URL does not change — the filename
 * is derived from the id — so the caller busts the browser's cache itself
 * rather than expecting a new address back.
 */
export function useRegenerateQr(userId) {
  return useMutation({ mutationFn: () => profileService.regenerateQr(userId) });
}

export function useResumeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['my-resumes'] });

  const create = useMutation({ mutationFn: profileService.createResume, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: profileService.deleteResume, onSuccess: invalidate });

  return { create, remove, isPending: create.isPending || remove.isPending };
}
