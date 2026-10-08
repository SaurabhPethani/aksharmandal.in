// The three membership flags on a member's record, and what to call them.
//
// THE NIMIT SEVAK FLAG IS `is_nimit_sevak`.
//
// It has been spelled three ways over the life of the API — `is_karyakarta`,
// then `is_karya_karta`, now `is_nimit_sevak` — so what the app SENDS is the
// current name, and what it READS accepts any of the three (see
// `readMemberField`). A record loaded from an older backend still ticks the box;
// a save always writes the new name.
//
// THE AMBRISH FLAG IS `is_ambrish`.
//
// It was `is_amrish` — a misspelling — until 2026-08. The column was renamed in
// place (see `migrate_ambrish_rename` in the backend's migrations endpoint), so
// no record lost its value; the old name is still read here for the window
// where a deployment has the new frontend and the old API.
//
// THE POOJA FLAG IS `doing_pooja`, and it is the odd one out: Ambrish and Nimit
// Sevak are standings someone else confers, so a member may not set either on
// their own record, while a daily pooja is their own practice and theirs to
// report. `UserSelfUpdate` declares `doing_pooja` and PATCH /users/me writes it
// directly — which is why it is NOT `lockedForSelf` on the form.

/** What the app sends for the Nimit Sevak flag. */
export const NIMIT_SEVAK_FIELD = 'is_nimit_sevak';

/** What that flag is called on screen, everywhere. */
export const NIMIT_SEVAK_LABEL = 'Nimit Sevak';

/** Swayam Sevak — a standing conferred like Nimit Sevak, and its label. */
export const SWAYAM_SEVAK_FIELD = 'is_swayam_sevak';
export const SWAYAM_SEVAK_LABEL = 'Swayam Sevak';

/** The daily-pooja flag, and its label. */
export const DOING_POOJA_FIELD = 'doing_pooja';
export const DOING_POOJA_LABEL = 'Doing Pooja';

/**
 * Older names for a field, still accepted when READING a record.
 *
 * Reading is where being generous costs nothing: an unrecognised key just means
 * an unticked box, which is a wrong answer rather than an empty one. Writing
 * stays strict — one name, the current one.
 */
export const FIELD_ALIASES = {
  is_nimit_sevak: ['is_karya_karta', 'is_karyakarta'],
  is_ambrish: ['is_amrish'],
  // Not a flag, and not a rename either: the backend does not declare a joining
  // date yet, so which spelling it lands on is open. The profile cards read the
  // same three the add / edit form prefills from — keep the two lists in step
  // (utils/userFormSchema.js, FIELD_ALIASES).
  date_of_joining: ['joining_date', 'date_of_join', 'dateOfJoining'],
};

/** A field off a member record, under its current name or any older one. */
export function readMemberField(user, key) {
  if (user == null) return undefined;
  if (user[key] !== undefined) return user[key];
  for (const alias of FIELD_ALIASES[key] ?? []) {
    if (user[alias] !== undefined) return user[alias];
  }
  return undefined;
}

/** Is this member a Nimit Sevak, whichever name their record uses? */
export const isNimitSevak = (user) => readMemberField(user, NIMIT_SEVAK_FIELD) === true;

/**
 * The Ambrish flag reads differently for women: an Ambrish is a male initiate, a
 * Sarhadyi the female equivalent. One flag, two words for it.
 *
 * Anything that is not Female — including a record with no gender yet — reads
 * as "Ambrish", the general term. Gender is required on the form, so an unset
 * one only happens on a record created before that rule.
 */
export const ambrishLabel = (gender) =>
  String(gender ?? '').trim().toLowerCase() === 'female' ? 'Sarhadyi' : 'Ambrish';

/** The API has shipped status as a boolean and as 'active'/'Active'. */
export const isAttending = (status) =>
  status === true || status === 'active' || status === 'Active';

export const statusLabel = (status) =>
  isAttending(status) ? 'Attending' : 'Not Attending';
