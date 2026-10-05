import { absoluteUrl, api } from '../api/client';

export const profileService = {
  /** `{ user_id, user_name, image_url }` — `image_url` is null until one is set. */
  profileImage: async (userId) => {
    const res = await api.get(`/api/v1/profile-image/users/${userId}`);
    // Resolved here so every screen showing the photo gets a loadable URL.
    return res ? { ...res, image_url: absoluteUrl(res.image_url) } : res;
  },

  updateMe: (payload) => api.patch('/api/v1/users/me', payload, { envelope: true }),

  submitInformationRequest: (payload) =>
    api.post('/api/v1/information-requests', payload, { envelope: true }),

  uploadProfileImage: (userId, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/api/v1/profile-image/users/${userId}`, form, { envelope: true });
  },

  // Remove the uploaded photo — deletes the file and clears users.profile_image,
  // so the app falls back to the initials avatar.
  removeProfileImage: (userId) =>
    api.delete(`/api/v1/profile-image/users/${userId}`, { envelope: true }),

  myResumes: () => api.get('/api/v1/resume/my-resumes'),

  createResume: () => api.post('/api/v1/resume', {}, { envelope: true }),

  deleteResume: (resumeId) => api.delete(`/api/v1/resume/${resumeId}`, { envelope: true }),

  /**
   * GET /api/v1/qr/users/{user_id} -> `{ user_id, public_url, filename }`.
   *
   * The QR image URL now carries a per-user RANDOM TOKEN in its filename
   * (`akshar-connect-<id>-<token>.jpeg`) so the public code set can't be walked
   * id-by-id. The filename is therefore NO LONGER derivable from the id, so the
   * old id-built `/qr/codes/akshar-connect-{id}.jpeg` path has been dropped —
   * the app asks the backend for `public_url` and loads that. The image itself
   * stays public (200, no Authorization header), so a plain `<Image>` works.
   * Lazily creates the QR on first read; self needs no grant.
   */
  qrInfo: (userId) => api.get(`/api/v1/qr/users/${userId}`),

  regenerateQr: (userId) =>
    api.post(`/api/v1/qr/users/${userId}/regenerate`, null, { envelope: true }),

  regenerateAllQr: () =>
    api.post('/api/v1/qr/users/regenerate-all', null, { envelope: true }),
};
