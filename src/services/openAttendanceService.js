import { api } from '../api/client';

// SuperAdmin-only: open/close a past Sabha sitting for attendance marking.
export const openAttendanceService = {
  byDate: (date) => api.get('/api/v1/open-attendance/by-date', { params: { date } }),
  toggle: (sabhaDetailId, open) =>
    api.post('/api/v1/open-attendance/toggle', { sabha_detail_id: sabhaDetailId, open }, { envelope: true }),
};
