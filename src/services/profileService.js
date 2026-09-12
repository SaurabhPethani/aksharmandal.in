import { api, apiUrl } from '../api/client';

// The two things a member owns about themselves that are not fields on their
// record: the profile photo, and the resumes generated from it.
//
// Verified against the live spec on 2026-08-02.

export const profileService = {
  /** `{ user_id, user_name, image_url }` — `image_url` is null until one is set. */
  profileImage: (userId) => api.get(`/api/v1/profile-image/users/${userId}`),

  /**
   * PATCH /api/v1/users/me — the caller's own record, applied immediately.
   *
   * Body is `UserUpdate`, and only the fields that changed are in it: a missing
   * key means "leave it alone". Restricted fields never come here — see
   * utils/selfUpdate.js.
   */
  updateMe: (payload) => api.patch('/api/v1/users/me', payload, { envelope: true }),

  /**
   * POST /api/v1/information-requests — proposes a change to the caller's own
   * name or address. Nothing is written: the request enters `pending` and an
   * approver applies or rejects it. Any logged-in user may submit one for
   * themselves; it is always tied to the token's user, never another member's.
   */
  submitInformationRequest: (payload) =>
    api.post('/api/v1/information-requests', payload, { envelope: true }),

  /**
   * POST /api/v1/profile-image/users/{user_id} — multipart, field name `file`.
   * JPEG / PNG / WEBP, max 2 MB, per the spec's own description.
   *
   * No Content-Type is set: the browser has to add the multipart boundary, and
   * naming the type by hand omits it and produces a 422 the field cannot
   * explain.
   */
  uploadProfileImage: (userId, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/api/v1/profile-image/users/${userId}`, form, { envelope: true });
  },

  // Remove the uploaded photo — deletes the file and clears users.profile_image,
  // so the app falls back to the initials avatar.
  removeProfileImage: (userId) =>
    api.delete(`/api/v1/profile-image/users/${userId}`, { envelope: true }),

  /**
   * The caller's own resumes, newest first as returned. Each is
   * `{ id, user_id, user_name, version, resume_path, created_at }`.
   */
  myResumes: () => api.get('/api/v1/resume/my-resumes'),

  /**
   * POST /api/v1/resume — builds one from the profile as it stands now.
   * Answers `{ warning, resume }`: `warning` is how the backend says it built
   * something thin (no education, no jobs) rather than refusing.
   */
  createResume: () => api.post('/api/v1/resume', {}, { envelope: true }),

  deleteResume: (resumeId) => api.delete(`/api/v1/resume/${resumeId}`, { envelope: true }),

  /**
   * A member's QR image, as a URL for an `<img>` rather than a request.
   *
   * The filename is **deterministic** — the spec calls it `qr_filename(user.id)`
   * with the pattern `akshar-connect-<id>.jpeg`, "stable so older distributed
   * images keep scanning" — so it is derived from the id, never from the name.
   * ("akshar-connect-123.jpeg" in the docs is user 123, not a name slug: user 1
   * is `akshar-connect-1.jpeg`, not `akshar-connect-sevak-1.jpeg`.)
   *
   * The image itself is public — it answers 200 with no Authorization header —
   * which is what makes a plain `<img src>` work at all.
   *
   * `qr_url` on the member record is NOT used: it stays null even immediately
   * after a regenerate, so it cannot be relied on to decide whether one exists.
   */
  qrCodeUrl: (userId) => apiUrl(`/api/v1/qr/codes/akshar-connect-${userId}.jpeg`),

  /**
   * POST /api/v1/qr/users/{user_id}/regenerate — rewrites the JPEG and answers
   * `{ user_id, public_url, filename }`. Any authenticated user may do this for
   * their **own** QR with no grant at all; `USERS:GENERATE_QR` is needed only
   * for someone else's.
   */
  regenerateQr: (userId) =>
    api.post(`/api/v1/qr/users/${userId}/regenerate`, null, { envelope: true }),

  /**
   * POST /api/v1/qr/users/regenerate-all — SuperAdmin bulk-rewrites every QR
   * JPEG in the caller's scope (whole org for SuperAdmin) with the CURRENT
   * payload, and answers `{ total, regenerated, failed }`. Run once after the
   * `AKC1:` scheme tag was introduced so every distributed code carries it.
   *
   * ⚠ The images are edge-cached — a Cloudflare purge of `/api/v1/qr/codes/*`
   * is still needed afterwards, or members keep fetching the old images.
   */
  regenerateAllQr: () =>
    api.post('/api/v1/qr/users/regenerate-all', null, { envelope: true }),
};
