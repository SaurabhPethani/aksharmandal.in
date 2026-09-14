export const DEFAULT_WISH = 'Jai Swaminarayan! Happy birthday.';

export const birthdayMessage = (name) =>
  `Jai Swaminarayan ${String(name ?? '').trim() || 'Das na Das'}! Wishing you a very happy birthday. May Bhagwan Swaminarayan bless you with health, wisdom, and unwavering devotion.`;

export function readBirthdayWishes(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];

  for (const key of [
    'wishes', 'birthday_wishes', 'my_birthday_wishes', 'my_wishes',
    'items', 'results', 'records', 'data', 'list',
  ]) {
    if (Array.isArray(body[key])) return body[key];
  }

  if (body.message != null || body.send_user_id != null) return [body];
  return [];
}
