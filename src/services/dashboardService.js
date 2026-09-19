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
  memberStats: userId =>
    api.get(`/api/v1/dashboard-overview/member/${userId}`),
  myBirthdayWishes: () => api.get('/api/v1/users/my-birthday-wishes'),
  sendBirthdayWish: ({ userId, message }) =>
    api.post('/api/v1/users/send-birthday-wish', { user_id: userId, message }),
  events: () => api.get('/api/v1/events', { params: { status: 'active' } }),
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
