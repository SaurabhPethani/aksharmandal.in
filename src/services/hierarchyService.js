import { api } from '../api/client';

// The envelope is kept on the list calls: useHierarchy reads `member_count`
// from beside `data`.
export const hierarchyService = {
  pradeshList: params =>
    api.get('/api/v1/pradesh', { params, envelope: true }),
  pradeshById: pradeshId => api.get(`/api/v1/pradesh/${pradeshId}`),

  mandalList: params => api.get('/api/v1/mandal', { params, envelope: true }),
  mandalsOfPradesh: pradeshId =>
    api.get(`/api/v1/pradesh/${pradeshId}/mandals`, { envelope: true }),
  mandalById: mandalId => api.get(`/api/v1/mandal/${mandalId}`),

  sabhaList: params => api.get('/api/v1/sabha', { params, envelope: true }),
  sabhasOfMandal: mandalId =>
    api.get(`/api/v1/mandal/${mandalId}/sabhas`, { envelope: true }),
  sabhaById: sabhaId => api.get(`/api/v1/sabha/${sabhaId}`),
};
