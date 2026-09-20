import { api } from '../api/client';
import { API_BASE } from '../config/appConfig';

function resolveThought(res) {
  if (!res || typeof res !== 'object') return null;
  const resolveUrl = url => {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const imageUrl = resolveUrl(res.image_url);
  const portraitUrl = resolveUrl(res.image_url_portrait);

  if (!imageUrl && !portraitUrl) return null;

  return {
    ...res,
    image_url: imageUrl,
    image_url_portrait: portraitUrl,
  };
}

export const dashboardService = {
  overview: () => api.get('/api/v1/dashboard-overview', { envelope: true }),
  presentAbsent: () => api.get('/api/v1/dashboard/present-absent'),
  me: () => api.get('/api/v1/users/me'),
  birthdays: () => api.get('/api/v1/users/today-birthdays'),
  members: params => api.get('/api/v1/users/list', { params }),
  yuvaSevaReport: params =>
    api.get('/api/v1/reports/yuva-seva-report', {
      params,
      envelope: true,
    }),
  yuvaSevaMemberHistory: (userId, limit = 3) =>
    api.get('/api/v1/yuva-seva/member-history', {
      params: { user_id: userId, limit },
    }),
  addYuvaSeva: payload =>
    api.post('/api/v1/yuva-seva', payload, { envelope: true }),
  notLoggedIn: () => api.get('/api/v1/users/not-logged-in'),
  memberStats: userId => api.get(`/api/v1/dashboard-overview/member/${userId}`),
  myBirthdayWishes: () => api.get('/api/v1/users/my-birthday-wishes'),
  sendBirthdayWish: ({ userId, message }) =>
    api.post('/api/v1/users/send-birthday-wish', { user_id: userId, message }),
  events: status =>
    api.get('/api/v1/events', {
      params: status ? { status } : undefined,
    }),
  eventRegistrations: () => api.get('/api/v1/register-for-events'),
  eventDataEvents: () => api.get('/api/v1/events/registration-data'),
  eventDataRegistrations: eventId =>
    api.get(`/api/v1/events/${eventId}/registration-data`),
  notificationPendingTransfers: () =>
    api.get('/api/v1/notifications/transfer/pending'),
  notificationMyTransfers: () =>
    api.get('/api/v1/notifications/transfer/my-requests'),
  notificationInfoRequests: params =>
    api.get('/api/v1/information-requests', { params }),
  todayThought: async () => {
    try {
      const res = await api.get('/api/v1/thoughts/today-image');
      const resolved = resolveThought(res);
      if (resolved) return resolved;
    } catch {
      /* ignore 404 on today-image */
    }
    try {
      const randomRes = await api.get('/api/v1/thoughts/random');
      const resolvedRandom = resolveThought(randomRes);
      if (resolvedRandom) return resolvedRandom;
    } catch {
      /* ignore 404 on random */
    }
    return null;
  },
};
