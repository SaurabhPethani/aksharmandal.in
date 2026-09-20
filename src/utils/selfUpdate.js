// Editing your OWN record splits in two: what PATCH /users/me writes straight
// away, and what POST /information-requests files for a Sabha approver. Both
// lists are the backend's own — `UserSelfUpdate` and
// `UserInformationRequestCreate` — and anything in neither cannot be saved from
// the profile form at all.

/** Applied immediately by PATCH /api/v1/users/me. */
export const DIRECT_FIELDS = [
  'gender',
  'dob',
  'blood_group',
  'marital_status',
  'anniversary_date',
  'email',
  'doing_pooja',
  'latitude',
  'longitude',
];

/** Filed as an approval request; the record is untouched until someone acts. */
export const REQUEST_FIELDS = [
  'first_name',
  'middle_name',
  'last_name',
  'flat_no',
  'building_name',
  'street_name',
  'landmark',
  'area',
  'suburb',
  'pincode',
  'city',
  'state',
  'country',
  'remarks',
];

export const isDirectField = name => DIRECT_FIELDS.includes(name);
export const isRequestField = name => REQUEST_FIELDS.includes(name);

/**
 * Routes a set of changed values into the two calls, plus whatever neither
 * endpoint accepts so the caller can say so instead of reporting it saved.
 */
export function selfChanges(changes = {}) {
  const direct = {};
  const request = {};
  const unsupported = [];

  for (const [name, value] of Object.entries(changes)) {
    if (isDirectField(name)) direct[name] = value;
    else if (isRequestField(name)) request[name] = value;
    else unsupported.push(name);
  }

  return { direct, request, unsupported };
}
