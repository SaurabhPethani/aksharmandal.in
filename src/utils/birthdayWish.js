// Wishing someone a happy birthday — the message, and the WhatsApp link that
// carries it.
//
// TWO WAYS TO WISH SOMEONE, AND THEY ARE NOT THE SAME ACT:
//
//   Wish      the message is typed (or accepted as it stands) in a popup and
//             POSTed to /users/send-birthday-wish, which queues it. DEFAULT_WISH
//             below is what that field starts with.
//   WhatsApp  the APP sends nothing and the API never hears about it. It
//             composes a message and hands it to WhatsApp, so what goes out is
//             the member's own send, from their own number, and they can edit it
//             before it leaves. `birthdayMessage` is that one.
//
// Both live here rather than in a screen because the Yuvak dashboard's
// Celebrations card and the Birthdays page compose the same greetings, and two
// copies would drift into two different ones.
//
// The LINKS those greetings travel on — `whatsAppUrl`, `telUrl`, `hasMobile` —
// are in utils/contact.js. Nothing about a wa.me URL is birthday-specific, and
// the profile page now builds one for the follow-up person.

/**
 * What the Wish popup's field is pre-filled with.
 *
 * Short, and NAMES NOBODY: it is a starting point the sender is expected to read
 * and may replace, and a greeting that already had the right name in it would
 * invite being sent unread.
 */
export const DEFAULT_WISH = 'Jai Swaminarayan! Happy birthday.';

/** The longer greeting WhatsApp is handed, in the org's own words. */
export const birthdayMessage = (name) =>
  `Jai Swaminarayan ${String(name ?? '').trim() || 'Das na Das'}! Wishing you a very happy birthday. May Bhagwan Swaminarayan bless you with health, wisdom, and unwavering devotion.`;

/**
 * The wish records out of whatever `GET /users/my-birthday-wishes` wrapped them
 * in — the payload AFTER the client has unwrapped the envelope to `data`.
 *
 * ⚠ NOT `readRows`, and this is why the popup announced nothing while the
 * endpoint was plainly answering. That shared reader looks for `items`,
 * `results`, `records`, `data`, `users` or `list`; a payload that calls its array
 * anything else — `wishes`, say — matches none of them, so a response full of
 * wishes read as zero wishes. Which is indistinguishable, from the outside, from
 * having received none.
 *
 * Every plausible spelling is accepted, plus a single record answered bare. A
 * payload this cannot read still comes back `[]`, so the popup stays silent
 * rather than announcing a count it has nothing to show behind.
 */
export function readBirthdayWishes(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];

  for (const key of [
    'wishes', 'birthday_wishes', 'my_birthday_wishes', 'my_wishes',
    'items', 'results', 'records', 'data', 'list',
  ]) {
    if (Array.isArray(body[key])) return body[key];
  }

  // One record, unwrapped — it is a wish if it looks like what the POST returns.
  if (body.message != null || body.send_user_id != null) return [body];
  return [];
}
