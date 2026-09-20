import { api } from '../api/client';

/**
 * Khardo — members' Seva % (matched by Sampark ID).
 *
 *   member : GET  /api/v1/khardo/me       my own % (null if I have no row)
 *   admin  : GET    /api/v1/khardo             current rows (+ names)  [KHARDO:DOWNLOAD]
 *            GET    /api/v1/khardo/export      the data as .xlsx (blob) [KHARDO:DOWNLOAD]
 *            POST   /api/v1/khardo/upload      MERGE data from Excel    [KHARDO:BULK_UPLOAD]
 *            DELETE /api/v1/khardo/{id}        delete one member's row  [KHARDO:BULK_UPLOAD]
 *            DELETE /api/v1/khardo             clear ALL data           [KHARDO:BULK_UPLOAD]
 */
export const khardoService = {
  /** The signed-in member's own Seva percentage. */
  me: () => api.get('/api/v1/khardo/me', { envelope: true }),

  /** Admin: current rows with names. */
  list: () => api.get('/api/v1/khardo', { envelope: true }),

  /** Admin: MERGE an uploaded Excel/CSV into the existing data (upsert by Sampark ID). */
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/api/v1/khardo/upload', form, { envelope: true, timeout: 60_000 });
  },

  /** Admin: delete one member's Seva row by Sampark ID. */
  deleteRow: (samparkId) => api.delete(`/api/v1/khardo/${samparkId}`, { envelope: true }),

  /** Admin: clear ALL Khardo data (fresh start). */
  clearAll: () => api.delete('/api/v1/khardo', { envelope: true }),

  /**
   * Admin: download the current data as .xlsx. Returns a Blob (the client passes
   * blobs through untouched); the caller wraps it in an object URL to save it.
   */
  exportFile: () => api.get('/api/v1/khardo/export', { responseType: 'blob' }),
};
