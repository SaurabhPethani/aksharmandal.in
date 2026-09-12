// Reaching a member on their mobile — the `tel:` and `wa.me` links behind every
// Call and WhatsApp button in the app.
//
// Lived in `birthdayWish.js` until the profile page grew its own pair of these
// buttons for the follow-up person. Nothing here is about a birthday, and a
// profile card importing "birthdayWish" to place a phone call read as a mistake
// on the way to being one.

/**
 * An Indian mobile as digits only, in full international form — no `+`.
 *
 * Shared by `whatsAppUrl` and `telUrl` so the two never disagree about which
 * number they reached: a message sent on WhatsApp and a call placed from the
 * same row have to go to the same person.
 */
function internationalDigits(mobile) {
  const raw = String(mobile ?? '');
  // A parent-managed child has a PLACEHOLDER mobile like `9867541878C1` (no SIM).
  // Blindly stripping non-digits would delete the `C` and glue the `1` on —
  // producing `98675418781`, a DIFFERENT real number. A genuine mobile never
  // contains a letter, so refuse to compose a number from one: callers should
  // hand us the resolved `contact_number` / `whatsapp_target` instead.
  if (/[a-z]/i.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}`
    : digits.length === 12 && digits.startsWith('91') ? digits
      : digits.replace(/^0+/, '');
}

/**
 * A wa.me link for an Indian mobile as the API stores it.
 *
 * wa.me wants digits only, in full international form. A mobile column is free
 * text, so it arrives as "9876543210", "+91 98765 43210" or "091-9876543210"
 * depending on who typed it — hence the strip, and the 91 only where one is
 * missing. Anything that is not a recognisable Indian number is passed through
 * as digits and left to WhatsApp to reject; guessing harder would risk composing
 * a stranger's number.
 */
export function whatsAppUrl(mobile, message) {
  return `https://wa.me/${internationalDigits(mobile)}?text=${encodeURIComponent(message)}`;
}

/**
 * A `tel:` link for the same number WhatsApp would be handed.
 *
 * Written in full international form with the `+`, which is what makes the
 * number dialable from anywhere rather than only from an Indian SIM — a bare
 * "9876543210" is a local number, and what "local" means depends on the phone
 * holding it.
 */
export function telUrl(mobile) {
  return `tel:+${internationalDigits(mobile)}`;
}

/** Is there enough of a number here to open WhatsApp with? A placeholder that
 *  carries a letter (a managed child's …C1) is not a real number, so it is not
 *  contactable on this value — the caller must resolve it to contact_number. */
export const hasMobile = (mobile) => {
  const raw = String(mobile ?? '');
  if (/[a-z]/i.test(raw)) return false;
  return raw.replace(/\D/g, '').length >= 10;
};

/**
 * The number a WhatsApp action should reach for a member: their dedicated
 * `whatsapp_number` when set, else the calling `mobile_number`. Mirrors the
 * backend's `User.whatsapp_target`. Call buttons keep using `mobile_number`
 * directly — this fallback is ONLY for the WhatsApp channel, so a member whose
 * WhatsApp lives on a different SIM is still reachable there. Accepts the member
 * object (or anything with the two fields); a plain string is returned as-is.
 */
export function whatsAppTarget(member) {
  if (member && typeof member === 'object') {
    return member.whatsapp_number || member.mobile_number || '';
  }
  return member ?? '';
}

/**
 * What a WhatsApp chat opened from a profile is pre-filled with.
 *
 * A greeting and nothing else. This button starts a conversation rather than
 * delivering one, so anything longer would be a message the member has to read
 * and delete before typing what they actually meant to say.
 *
 * Reaches WhatsApp as `?text=Jai%20Swaminarayan`. `%20` and `+` are the same
 * space to any URL decoder, and `encodeURIComponent` — which is what keeps a
 * message with an `&` or a `#` in it from truncating — writes the `%20` form.
 */
export const GREETING = 'Jai Swaminarayan';
