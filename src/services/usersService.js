import { api } from '../api/client';

export const usersService = {
  list: params => api.get('/api/v1/users/list', { params }),
  byId: userId => api.get(`/api/v1/users/${userId}`),

  create: payload => api.post('/api/v1/users/', payload, { envelope: true }),
  createChild: (parentId, payload) =>
    api.post(`/api/v1/users/${parentId}/children`, payload, {
      envelope: true,
    }),
  update: (userId, payload) =>
    api.patch(`/api/v1/users/${userId}`, payload, { envelope: true }),

  updateStatusBulk: (userIds, status) =>
    api.patch(
      '/api/v1/users/status/bulk',
      { user_ids: userIds, status },
      { envelope: true },
    ),
  updateRole: (userId, roleId) =>
    api.patch(
      `/api/v1/users/${userId}/role`,
      { role_id: roleId },
      { envelope: true },
    ),
  updateFollowup: (userId, followupById) =>
    api.patch(
      `/api/v1/users/${userId}/followup`,
      { followup_id: followupById },
      { envelope: true },
    ),
  assignableRoles: userId =>
    api.get(`/api/v1/role-permissions/user/${userId}/assignable-roles`),

  todayBirthdays: () => api.get('/api/v1/users/today-birthdays'),
  myBirthdayWishes: () => api.get('/api/v1/users/my-birthday-wishes'),
  sendBirthdayWish: ({ userId, message }) =>
    api.post(
      '/api/v1/users/send-birthday-wish',
      { user_id: userId, message },
      { envelope: true },
    ),

  educations: userId => api.get(`/api/v1/users/${userId}/educations`),
  createEducation: (userId, payload) =>
    api.post(`/api/v1/users/${userId}/educations`, payload, {
      envelope: true,
    }),
  updateEducation: (userId, educationId, payload) =>
    api.patch(`/api/v1/users/${userId}/educations/${educationId}`, payload, {
      envelope: true,
    }),
  deleteEducation: (userId, educationId) =>
    api.delete(`/api/v1/users/${userId}/educations/${educationId}`, {
      envelope: true,
    }),

  jobs: userId => api.get(`/api/v1/users/${userId}/jobs`),
  createJob: (userId, payload) =>
    api.post(`/api/v1/users/${userId}/jobs`, payload, { envelope: true }),
  updateJob: (userId, jobId, payload) =>
    api.patch(`/api/v1/users/${userId}/jobs/${jobId}`, payload, {
      envelope: true,
    }),
  deleteJob: (userId, jobId) =>
    api.delete(`/api/v1/users/${userId}/jobs/${jobId}`, { envelope: true }),

  family: userId => api.get(`/api/v1/users/${userId}/family`),
  // No `family_id` founds a new family with this member as its head.
  joinFamily: (userId, { relationId, familyId } = {}) =>
    api.post(
      `/api/v1/users/${userId}/family-member`,
      familyId ? { relation_id: relationId, family_id: familyId } : { relation_id: relationId },
      { envelope: true },
    ),
  leaveFamily: userId =>
    api.delete(`/api/v1/users/${userId}/family-member`, { envelope: true }),
};
