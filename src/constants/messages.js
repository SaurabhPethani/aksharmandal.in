// Every message the frontend originates, in one place, keyed by what happened.
//
// Precedence rule, applied in api/client.js so it holds everywhere: when the
// backend sends a `detail`, that wins. It was written for this specific failure
// ("Mobile number already registered") and is always more useful than a generic
// line. The catalogue below is the fallback for when it sends nothing — a
// transport failure, a 500, a bare 403.

export const HTTP_MESSAGES = {
  0: 'Network error — check your connection and try again.',
  400: 'That request could not be processed. Please check the details and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do that.',
  404: 'We could not find what you were looking for.',
  409: 'That conflicts with a record that already exists.',
  422: 'Some details are not valid. Please review the highlighted fields.',
  // The auth endpoints are rate limited to 5 requests/minute per IP. Without an
  // entry here a 429 falls back to the 400 line, which tells someone to correct
  // their details when the only fix is to wait.
  429: 'Too many attempts. Please wait a minute and try again.',
  500: 'Something went wrong on our side. Please try again in a moment.',
  502: 'The server is unreachable right now. Please try again in a moment.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
  504: 'The request took too long. Please try again.',
};

/**
 * Fallback wording for a status. Unlisted codes fall back by class rather than
 * to a single catch-all, so a 418 still reads as a request problem and a 507
 * still reads as a server problem.
 */
export function messageForStatus(status) {
  if (HTTP_MESSAGES[status]) return HTTP_MESSAGES[status];
  if (status >= 500) return HTTP_MESSAGES[500];
  if (status >= 400) return HTTP_MESSAGES[400];
  return HTTP_MESSAGES[500];
}

/**
 * Which toast tone a status deserves. The split is "you can act on this"
 * (warning) versus "nothing you do will help" (error) — a 403 or a validation
 * failure is not the same class of event as the server falling over.
 */
export function toneForStatus(status) {
  if (status >= 500 || status === 0) return 'error';
  if (status >= 400) return 'warning';
  return 'info';
}

/**
 * The backend locks an account after this many consecutive wrong password/PIN
 * attempts. It is mirrored here only to count down towards the lockout the
 * backend will apply — it never decides anything on its own.
 */
export const LOGIN_LOCKOUT_LIMIT = 5;

/**
 * Sign-in copy that adds to the backend's message rather than replacing it. The
 * LoginFailureResponse says *what* happened ("Invalid Credentials", "Account
 * locked"); these say what it means and what to do next, which it does not.
 */
export const AUTH = {
  locked:
    'Use "Forgot Password / First Time Setup" below to reset your credentials, or ask an administrator to unlock the account.',
  attemptsLeft: (n) =>
    `${n} attempt${n === 1 ? '' : 's'} remaining before this account is locked.`,
};

/** Loading copy. Kept here so "please wait" reads the same on every screen. */
export const LOADING = {
  default: 'Loading',
  page: 'Loading, please wait',
  session: 'Restoring your session',
  saving: 'Saving, please wait',
  table: 'Loading records, please wait',
};

/** Frontend-originated success wording. Backend `detail` still wins when present. */
export const SUCCESS = {
  saved: 'Saved successfully.',
  created: 'Created successfully.',
  updated: 'Updated successfully.',
  deleted: 'Deleted successfully.',
};

/** Empty-state copy, so "nothing here" is worded consistently. */
export const EMPTY = {
  title: 'Nothing to show',
  list: 'No records match what you are looking at right now.',
  search: 'No results for this search. Try a different term or clear the filters.',
};
