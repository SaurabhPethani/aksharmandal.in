import { api } from '../api/client';

export const approvalsService = {
  pendingTransfers: () => api.get('/api/v1/notifications/transfer/pending'),
  transferHistory: () => api.get('/api/v1/notifications/transfer/history'),
  myTransferRequests: () =>
    api.get('/api/v1/notifications/transfer/my-requests'),
  acceptTransfer: (id, { sabhaId, followupId } = {}) =>
    api.patch(
      `/api/v1/notifications/transfer/${id}/accept`,
      {
        ...(sabhaId == null ? {} : { sabha_id: Number(sabhaId) }),
        ...(followupId == null ? {} : { followup_id: Number(followupId) }),
      },
      { envelope: true },
    ),
  rejectTransfer: (id, reason) =>
    api.patch(
      `/api/v1/notifications/transfer/${id}/reject`,
      { reason },
      { envelope: true },
    ),
  cancelTransfer: (id, reason) =>
    api.patch(
      `/api/v1/notifications/transfer/${id}/cancel`,
      { reason },
      { envelope: true },
    ),
  infoRequests: params => api.get('/api/v1/information-requests', { params }),
  approveInfoRequest: (id, { overrides, remarks } = {}) =>
    api.post(
      `/api/v1/information-requests/${id}/approve`,
      {
        ...(overrides && Object.keys(overrides).length ? { overrides } : {}),
        ...(remarks ? { remarks } : {}),
      },
      { envelope: true },
    ),
  rejectInfoRequest: (id, remarks) =>
    api.post(
      `/api/v1/information-requests/${id}/reject`,
      { remarks },
      { envelope: true },
    ),
  cancelInfoRequest: (id, remarks) =>
    api.post(
      `/api/v1/information-requests/${id}/cancel`,
      remarks ? { remarks } : {},
      { envelope: true },
    ),
};
