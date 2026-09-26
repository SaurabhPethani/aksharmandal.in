import { api } from '../api/client';

// Dropdown sources for the user form, and the generic CRUD the Master Data
// screen drives by `path` (`user-categories`, `relations`, …).

const lookup = (path, params) => api.get(`/api/v1/${path}`, { params });

export const masterDataService = {
  categories: () => lookup('user-categories'),
  roles: () => api.get('/api/v1/role-permissions/roles'),
  educationLevels: () => lookup('education-levels'),
  jobIndustries: () => lookup('job-industries'),
  naturesOfBusiness: () => lookup('nature-of-business'),
  relations: () => lookup('relations'),
  mandalUsers: () => api.get('/api/v1/users/get-all-mandal-users'),

  followupPersons: sabhaId =>
    api.get('/api/v1/users/get-followup-person-list', {
      params: sabhaId ? { sabha_id: sabhaId } : undefined,
    }),

  checkMobile: mobileNumber =>
    api.get(`/api/v1/users/check-mobile/${mobileNumber}`),

  // The collection filtered by PIN code, NOT `/address-master/pincode/{pin}/areas`
  // — that nested route 404s against the live API, while this is what the web
  // has always called. Its rows nest suburbs, which nest areas; see
  // `toAddressRows`, which is what flattens them into one row per area.
  addressByPincode: pincode =>
    api.get('/api/v1/address-master', { params: { pincode } }),

  addressMaster: ({ includeInactive } = {}) =>
    api.get('/api/v1/address-master', {
      params: includeInactive ? { include_inactive: true } : undefined,
    }),

  list: (path, { includeInactive } = {}) =>
    lookup(path, includeInactive ? { include_inactive: true } : undefined),
  create: (path, payload) =>
    api.post(`/api/v1/${path}`, payload, { envelope: true }),
  update: (path, id, payload) =>
    api.patch(`/api/v1/${path}/${id}`, payload, { envelope: true }),

  createPincode: payload =>
    api.post('/api/v1/address-master/pincodes', payload, { envelope: true }),
  updatePincode: (pincodeId, payload) =>
    api.patch(`/api/v1/address-master/pincodes/${pincodeId}`, payload, {
      envelope: true,
    }),
  createArea: payload =>
    api.post('/api/v1/address-master/areas', payload, { envelope: true }),
  updateArea: (areaId, payload) =>
    api.patch(`/api/v1/address-master/areas/${areaId}`, payload, {
      envelope: true,
    }),
};
