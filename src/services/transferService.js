import { api } from '../api/client';

const blank = value => value == null || String(value).trim() === '';

export const transferService = {
  // The envelope is kept on the two lists: useHierarchy reads `data` off it.
  destinationMandals: () =>
    api.get('/api/v1/notifications/transfer/destination-mandals', {
      envelope: true,
    }),
  destinationSabhas: mandalId =>
    api.get('/api/v1/notifications/transfer/destination-sabhas', {
      params: { mandal_id: Number(mandalId) },
      envelope: true,
    }),
  createTransferRequest: ({
    userId,
    type,
    toPradeshId,
    toMandalId,
    toSabhaId,
  }) =>
    api.post(
      '/api/v1/notifications/transfer-request',
      {
        user_id: Number(userId),
        type,
        to_pradesh_id: Number(toPradeshId),
        ...(blank(toMandalId) ? {} : { to_mandal_id: Number(toMandalId) }),
        ...(blank(toSabhaId) ? {} : { to_sabha_id: Number(toSabhaId) }),
      },
      { envelope: true },
    ),
  quickTransfer: payload =>
    api.post('/api/v1/notifications/quick-transfer', payload, {
      envelope: true,
    }),
  pending: () => api.get('/api/v1/notifications/transfer/pending'),
  myRequests: () => api.get('/api/v1/notifications/transfer/my-requests'),
};
