import { api } from '../api/client';

export const featuresService = {
  getAll: () => api.get('/api/v1/features'),
};
