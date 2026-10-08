import { api } from '../api/client';

export const transferService = {
  destinationMandals: params =>
    api.get('/api/v1/notifications/transfer/destination-mandals', { params }),
  destinationSabhas: params =>
    api.get('/api/v1/notifications/transfer/destination-sabhas', { params }),
  createTransferRequest: payload =>
    api.post('/api/v1/notifications/transfer-request', payload, {
      envelope: true,
    }),
  quickTransfer: payload =>
    api.post('/api/v1/notifications/quick-transfer', payload, {
      envelope: true,
    }),
  pending: () => api.get('/api/v1/notifications/transfer/pending'),
  myRequests: () => api.get('/api/v1/notifications/transfer/my-requests'),
};
