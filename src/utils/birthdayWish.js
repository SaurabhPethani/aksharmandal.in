const EMOJI = {
  pray: String.fromCodePoint(0x1f64f),
  blossom: String.fromCodePoint(0x1f338),
  cake: String.fromCodePoint(0x1f382),
  party: String.fromCodePoint(0x1f389),
};

/**
 * The greeting, signed by the member sending it. `bold` wraps the highlights in
 * WhatsApp's `*…*`; the in-app wish is stored as plain text, so it passes false.
 * `belated` is for a birthday that has already passed.
 */
export const birthdayMessage = (
  name,
  senderName,
  { bold = true, belated = false } = {},
) => {
  const b = s => (bold ? `*${s}*` : s);
  const to = String(name ?? '').trim() || 'Das na Das';
  const from = String(senderName ?? '').trim();
  const wishLine = belated
    ? 'Wishing you a very happy belated birthday!'
    : 'Wishing you a very happy birthday!';
  return [
    `${EMOJI.pray} ${b('Jai Swaminarayan')} ${EMOJI.pray}`,
    '',
    `Param Bhakt ${b(to)},`,
    '',
    `May Bhagwan Swaminarayan bless you with health, wisdom, and unwavering devotion. ${EMOJI.blossom}`,
    '',
    `${EMOJI.cake} ${b(wishLine)} ${EMOJI.party}`,
    ...(from ? ['', 'From Sevak,', b(from)] : []),
  ].join('\n');
};

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

// Whether the "Happy Birthday!" popup has been shown since the last sign-in.
// Held in memory, so it ends with the app the way a browser tab's session does.
let wishesPopupSeen = false;
export const birthdayWishesMark = {
  seen: () => wishesPopupSeen,
  set: () => {
    wishesPopupSeen = true;
  },
  clear: () => {
    wishesPopupSeen = false;
  },
};
