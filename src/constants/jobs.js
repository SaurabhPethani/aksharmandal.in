// The Job Portal's two status vocabularies, and the wording that goes with them.
//
// EVERY status string and every applicant-facing sentence in the module lives
// here. Screens import from this file rather than typing 'Pending' inline: the
// two vocabularies below look similar enough that a literal in a component is
// how they get confused, which is the one mistake this feature cannot afford.

/**
 * A JOB POST's lifecycle. Four values.
 *
 *   Pending   created, invisible to the board, waiting for a checker
 *   Active    live on the board and taking applications
 *   Rejected  the checker declined it (terminal)
 *   Closed    the vacancy is over — filled, or withdrawn by its author.
 *             NOT terminal: a checker can put a closed post back on the board.
 *
 * ⚠ `Paused` is RETIRED. It was a fifth value meaning "temporarily not taking
 * applications", which `Closed` already covers — and unlike Rejected, a Closed
 * post can be re-activated, so nothing was lost by collapsing the two. The API
 * refuses it as an input and run-migrations converts any surviving row, so it
 * should never arrive; if a stale one does, the badge falls back to a neutral
 * chip rather than pretending the state still exists.
 */
export const JOB_STATUSES = ['Pending', 'Active', 'Rejected', 'Closed'];

/** What a checker may move a POST to. `Pending` is where it starts, not a target. */
export const JOB_APPROVAL_STATUSES = ['Active', 'Rejected', 'Closed'];

/**
 * A JOB APPLICATION's lifecycle. The same four words as a post's — which makes
 * the distinction easier to lose and MORE important to keep.
 *
 * The two workflows are independent: an Active post routinely holds Pending
 * applications (the job is open, this applicant is still waiting). They are
 * different fields on different objects — `job.status` versus
 * `application.status` / `job.my_application_status` — and reading one as the
 * other is always a bug.
 */
export const APPLICATION_STATUSES = ['Pending', 'Active', 'Rejected', 'Closed'];

/** What a checker may move an APPLICATION to. */
export const APPLICATION_APPROVAL_STATUSES = ['Active', 'Rejected', 'Closed'];

/**
 * The legal application transitions, mirroring APPLICATION_TRANSITIONS in
 * `schemas/job_post.py`. The backend is the authority and re-checks every one
 * of these; this copy exists so the management list can offer only the actions
 * that will actually succeed, instead of showing an Approve button that 400s.
 */
export const APPLICATION_TRANSITIONS = {
  Pending: ['Active', 'Rejected', 'Closed'],
  Active: ['Closed'],
  Rejected: [],
  Closed: [],
};

/** Case-insensitive, because `status` is a plain string in the API, not an enum. */
export const normalizeStatus = (value) => String(value ?? '').trim().toLowerCase();

/**
 * What an applicant is told about their own application, keyed by its status.
 *
 * `null` — no application — is the Apply case and has no message; the button is
 * the message. The other four are the exact sentences the spec calls for, and
 * `tone` picks the chip colour: Pending is deliberately GREEN rather than amber,
 * because "we have your application" is good news, not a warning.
 */
export const APPLICATION_MESSAGE = {
  pending: { label: 'Waiting for approval', tone: 'success' },
  active: { label: 'Your application is approved.', tone: 'success' },
  rejected: { label: 'Your application is rejected.', tone: 'danger' },
  closed: { label: 'Your application is cancelled.', tone: 'muted' },
};

/** The message for an application status, or null when there is no application. */
export function applicationMessage(status) {
  if (!status) return null;
  return APPLICATION_MESSAGE[normalizeStatus(status)] ?? null;
}

/**
 * Only an `Active` application unseals the employer's contact details.
 *
 * The backend already withholds them — a Pending row comes back with
 * `contact_person: null` — so this is not the gate, it is how the UI explains
 * the empty space instead of rendering a blank Contact block.
 */
export const revealsContact = (applicationStatus) =>
  normalizeStatus(applicationStatus) === 'active';

/** The transitions a checker may offer on an application in this status. */
export const nextApplicationStatuses = (status) =>
  APPLICATION_TRANSITIONS[
    APPLICATION_STATUSES.find((s) => normalizeStatus(s) === normalizeStatus(status)) ?? ''
  ] ?? [];

/**
 * The verb shown on the button for each target status, from the checker's side.
 * "Close" is the API's word; "Cancel" is what it means to the applicant, and the
 * applicant's word is the one on the screen they both end up reading.
 */
export const APPLICATION_ACTION_LABEL = {
  Active: 'Approve',
  Rejected: 'Reject',
  Closed: 'Cancel',
};
