import { api } from '../api/client';

/**
 * The Approvals screen — two unrelated queues that share one page.
 *
 *   Transfers        moving a member between Sabhas / Mandals, reviewed by the
 *                    DESTINATION side. Three lists, three verbs.
 *   Info changes     a member editing their own profile, reviewed by whoever
 *                    holds USERS:APPROVE_USER_INFO over them.
 *
 * They stay separate services-wise because they are separate resources with
 * different verbs (PATCH vs POST) and different payloads; only the screen
 * combines them.
 */
export const approvalsService = {
  // ── Transfers ─────────────────────────────────────────────────────────────
  /** Requests pointed AT the caller, awaiting their decision. */
  pendingTransfers: () => api.get('/api/v1/notifications/transfer/pending'),
  /** Resolved requests across the caller's jurisdiction — an audit view. */
  transferHistory: () => api.get('/api/v1/notifications/transfer/history'),
  /** Requests the caller RAISED, whatever their state. */
  myTransferRequests: () => api.get('/api/v1/notifications/transfer/my-requests'),

  /**
   * `sabha_id` is MANDATORY for a Mandal transfer — the reviewer picks the
   * landing Sabha — and must be OMITTED for a Sabha transfer, where the
   * destination is already final. `followup_id` is optional either way.
   */
  acceptTransfer: (id, { sabhaId, followupId } = {}) =>
    api.patch(
      `/api/v1/notifications/transfer/${id}/accept`,
      {
        ...(sabhaId == null ? {} : { sabha_id: Number(sabhaId) }),
        ...(followupId == null ? {} : { followup_id: Number(followupId) }),
      },
      { envelope: true }
    ),

  // Both take `{ reason }`, and the backend rejects a blank one outright.
  rejectTransfer: (id, reason) =>
    api.patch(`/api/v1/notifications/transfer/${id}/reject`, { reason }, { envelope: true }),
  cancelTransfer: (id, reason) =>
    api.patch(`/api/v1/notifications/transfer/${id}/cancel`, { reason }, { envelope: true }),

  // ── Information change requests ───────────────────────────────────────────
  infoRequests: (params) => api.get('/api/v1/information-requests', { params }),
  infoRequest: (id) => api.get(`/api/v1/information-requests/${id}`),

  /**
   * Approve, optionally correcting what was submitted.
   *
   * `overrides` carries ONLY the fields the approver changed — the endpoint
   * applies them relative to the requester's submission, so sending the whole
   * form back would overwrite fields nobody touched.
   */
  approveInfoRequest: (id, { overrides, remarks } = {}) =>
    api.post(
      `/api/v1/information-requests/${id}/approve`,
      {
        ...(overrides && Object.keys(overrides).length ? { overrides } : {}),
        ...(remarks ? { remarks } : {}),
      },
      { envelope: true }
    ),

  /** `remarks` is the rejection reason and is required by the endpoint. */
  rejectInfoRequest: (id, remarks) =>
    api.post(`/api/v1/information-requests/${id}/reject`, { remarks }, { envelope: true }),

  cancelInfoRequest: (id, remarks) =>
    api.post(
      `/api/v1/information-requests/${id}/cancel`,
      remarks ? { remarks } : {},
      { envelope: true }
    ),
};

/**
 * Address-master fields are resolved server-side from the pincode, so an
 * approver must not retype them — a hand-edited city would disagree with the
 * pincode it came from. Shown as read-only context in the edit dialog.
 */
export const READ_ONLY_INFO_FIELDS = new Set(['country', 'state', 'city']);
