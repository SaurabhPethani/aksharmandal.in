import { api } from '../api/client';

// SuperAdmin-only member administration (change login mobile number).
export const userAdminService = {
  // Find the one member on a number. Resolves to the member; rejects with a 404
  // ApiError when the number is free (which is exactly what the availability
  // check wants to see for a new number).
  lookupByMobile: (mobile) =>
    api.get('/api/v1/user-admin/lookup-by-mobile', { params: { mobile } }),

  changeMobile: (payload) =>
    api.post('/api/v1/user-admin/change-mobile', payload, { envelope: true }),

  // Inverse of Graduate: move a member onto a family member's number — they
  // become a parent-managed child (placeholder number, login disabled).
  // payload: { user_id, parent_id, relation_id }.
  moveToFamily: (payload) =>
    api.post('/api/v1/user-admin/move-to-family', payload, { envelope: true }),

  mobileChangeLog: (limit = 50) =>
    api.get('/api/v1/user-admin/mobile-change-log', { params: { limit } }),
};
