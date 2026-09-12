// Editing your OWN record goes to two different endpoints.
//
//   PATCH /api/v1/users/me            — applied immediately
//   POST  /api/v1/information-requests — opens a pending approval request
//
// Your name and your address are not yours to change silently: a Sabha-level
// approver reviews them, and the `users` row is not touched until they act.
// Everything else — blood group, email, a corrected date of birth — is written
// straight away.
//
// Both lists are the endpoints' own, read from the OpenAPI document on
// 2026-08-03 and asserted by `npm run verify:contract`, so a rename shows up as
// a failed check rather than as a field that quietly stops saving.

/**
 * `UserInformationRequestCreate` minus `remarks` — the thirteen approval-gated
 * fields. Anything here is proposed, never written.
 */
export const REQUEST_FIELDS = [
  'first_name', 'middle_name', 'last_name',
  'flat_no', 'building_name', 'street_name', 'landmark',
  'area', 'suburb', 'pincode', 'country', 'state', 'city',
];

/**
 * The four the endpoint documents as nullable: an explicit `null` clears them on
 * approval. The other nine are non-nullable, and a `null` there is dropped as if
 * the key had not been sent — so emptying one is not a change this can express.
 */
const NULLABLE_REQUEST_FIELDS = new Set(['flat_no', 'building_name', 'street_name', 'landmark']);

/**
 * `UserSelfUpdate` minus the thirteen above — what PATCH /users/me writes
 * directly. Note the schema: the endpoint takes `UserSelfUpdate`, NOT the
 * `UserUpdate` that PATCH /users/{id} takes, and it is a much shorter list.
 *
 * Deliberately a list rather than "everything that is not restricted". The form
 * also draws mobile_number, mobile_secondary, category_id, sampark_id,
 * date_of_joining, is_ambrish, is_nimit_sevak, role_id, followup_by_id,
 * reference_by_id and the three hierarchy ids — none of which
 * `UserSelfUpdate` declares. Sent anyway
 * they would be accepted and discarded, and the member would believe they had
 * saved. Changing those on your own record is someone else's edit, not yours.
 *
 * `doing_pooja` IS here, and is the one flag on that group of checkboxes that
 * is: Ambrish and Nimit Sevak are standings someone else confers, a daily pooja
 * is the member's own practice. The endpoint declares it, so it saves.
 */
export const DIRECT_FIELDS = [
  'gender', 'dob', 'anniversary_date', 'blood_group', 'marital_status',
  'email', 'latitude', 'longitude', 'doing_pooja',
  // whatsapp_number is intentionally NOT here: a member may not edit their own
  // WhatsApp number. It is managed only by rank >= 30 via the admin user form
  // (and is `lockedForSelf` in userFormSchema, so it shows read-only on the
  // member's own profile). The backend does not declare it on UserSelfUpdate.
];

const REQUEST = new Set(REQUEST_FIELDS);
const DIRECT = new Set(DIRECT_FIELDS);

/** Absent, null and '' all mean "nothing here"; ids differ as strings vs numbers. */
const blank = (v) => v == null || v === '';
const same = (a, b) => (blank(a) && blank(b)) || String(a) === String(b);

/**
 * What changed, split by where it has to be sent.
 *
 * Only differences travel: a field the member did not touch is not in either
 * payload, which is what keeps a "save" of one edited field from re-submitting
 * their whole record — and, for the restricted half, from opening an approval
 * request listing thirteen fields nobody changed.
 *
 * @param baseline the record as it was loaded, through buildPayload
 * @param next     the form as it stands now, through buildPayload
 * @returns `{ direct, request, unsupported }` — two payloads and the names of
 *          any changed fields neither endpoint accepts.
 */
export function selfChanges(baseline = {}, next = {}) {
  const direct = {};
  const request = {};
  const unsupported = [];

  for (const key of new Set([...Object.keys(baseline), ...Object.keys(next)])) {
    // Repeatable rows (educations, jobs) are written through their own
    // endpoints as they are edited, and never travel with the member.
    if (Array.isArray(baseline[key]) || Array.isArray(next[key])) continue;

    const before = baseline[key];
    const after = next[key];
    if (same(before, after)) continue;

    if (REQUEST.has(key)) {
      if (blank(after)) {
        // Clearing one of the four nullable fields is a real request; clearing a
        // non-nullable one cannot be expressed, so it is left out rather than
        // sent as a null the endpoint would silently drop.
        if (NULLABLE_REQUEST_FIELDS.has(key)) request[key] = null;
      } else {
        request[key] = after;
      }
      continue;
    }

    if (DIRECT.has(key)) {
      // Emptying a direct field is not sent either: PATCH /users/me reads a
      // missing key as "leave it alone", and there is no documented clear.
      if (!blank(after)) direct[key] = after;
      continue;
    }

    unsupported.push(key);
  }

  return { direct, request, unsupported };
}
