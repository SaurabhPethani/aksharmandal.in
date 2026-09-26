import { api } from '../api/client';

export const groupsService = {
  myLeaderships: () => api.get('/api/v1/groups/my-leaderships'),
};
