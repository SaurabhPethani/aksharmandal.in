import { api } from '../api/client';

export const groupsService = {
  inScope: () => api.get('/api/v1/groups/in-scope'),
  myLeaderships: () => api.get('/api/v1/groups/my-leaderships'),
};
