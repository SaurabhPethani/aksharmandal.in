import { api } from '../api/client';

/**
 * The Job Portal — a job board with a maker/checker step, and an application
 * workflow of its own on top of it.
 *
 * TWO WORKFLOWS, AND THEY ARE NOT THE SAME ONE:
 *
 *   a JOB POST         Pending -> Active -> Closed / Rejected
 *   an APPLICATION     Pending -> Active / Rejected / Closed
 *
 * An Active post holding a Pending application is the normal case. The status
 * vocabularies live in constants/jobs.js; nothing here re-declares them.
 * (`Paused` is retired — see that file.)
 *
 * THREE GRANTS, read straight off the endpoint descriptions:
 *
 *   JOB_PORTAL:READ     the board, one post, my posts, applications, AND
 *                       applying. Applying is a read-side action — a member
 *                       registers interest, they do not author anything.
 *   JOB_PORTAL:CREATE   create, update, and closing YOUR OWN post
 *   JOB_PORTAL:APPROVE  the approval verb on BOTH resources — putting a post
 *                       live, and deciding an application — and it also WIDENS
 *                       reads: the applications list returns every member's
 *                       instead of just the caller's
 *
 * Note CREATE covers editing and closing too — the API declares no UPDATE
 * action for this module, so do not invent one to gate a button with.
 */

export const jobsService = {
  /**
   * GET /api/v1/job-posts — the board.
   *
   * ⚠ NO STATUS PARAMETER, and that is deliberate. What comes back is decided
   * by the caller's permission, server-side:
   *
   *   with JOB_PORTAL:APPROVE     Pending + Active — the live board and the
   *                               review queue in one list
   *   without it                  Active only, clamped in SQL
   *
   * So one call serves both audiences and the client cannot ask for the wrong
   * set. (The endpoint still accepts `?status=` for a checker who wants to dig
   * into Rejected/Closed history; the board does not use it, and passing a
   * non-Active value without APPROVE is a 403.)
   */
  list: () => api.get('/api/v1/job-posts'),

  /** GET /api/v1/my-job-posts — the caller's own posts, whatever their status. */
  mine: (status) =>
    api.get('/api/v1/my-job-posts', { params: status ? { status } : undefined }),

  byId: (jobId) => api.get(`/api/v1/job-posts/${jobId}`),

  /** `title` is the only required field; everything else is optional. */
  create: (payload) => api.post('/api/v1/job-posts', payload, { envelope: true }),

  update: (jobId, payload) =>
    api.patch(`/api/v1/job-posts/${jobId}`, payload, { envelope: true }),

  /**
   * POST /api/v1/job-posts/{id}/apply — apply for the job.
   *
   * All three contact fields are REQUIRED by the endpoint. They are the
   * APPLICANT's own details rather than the poster's, which is why the dialog
   * seeds them from /users/me instead of from the post.
   *
   * The application is created `Pending`; it does NOT reveal the employer's
   * contact details. A second call for the same job answers 409 — one
   * application per member per post, in any state.
   */
  apply: (jobId, { contactPerson, contactEmail, contactMobile }) =>
    api.post(
      `/api/v1/job-posts/${jobId}/apply`,
      {
        contact_person: contactPerson,
        contact_email: contactEmail,
        contact_mobile: contactMobile,
      },
      { envelope: true }
    ),

  /** PATCH /{id}/close — the AUTHOR retiring their own post. `remarks` optional. */
  close: (jobId, remarks) =>
    api.patch(
      `/api/v1/job-posts/${jobId}/close`,
      remarks ? { remarks } : {},
      { envelope: true }
    ),

  /**
   * PATCH /{id}/approval — the checker's verb on a POST, and the only way one
   * reaches `Active`. `status` is required; `remarks` carries the reason, which
   * matters most on a rejection.
   *
   * ⚠ NOTHING IN THIS APP CALLS IT. The Review button was removed from the job
   * detail dialog, so no screen changes a post's status; a Pending post reaches
   * the board some other way (API, or an admin tool). Kept here because the
   * endpoint is real and this file is the map of the module's API. If it is
   * wired up again, add a mutation to useJobPostMutations — do not call this
   * from a component.
   */
  setApproval: (jobId, status, remarks) =>
    api.patch(
      `/api/v1/job-posts/${jobId}/approval`,
      { status, ...(remarks ? { remarks } : {}) },
      { envelope: true }
    ),

  /**
   * GET /api/v1/applied-jobs — applications, paged in the project's 100-record
   * blocks (`{ items, page, limit, total_records, ... }`).
   *
   * ⚠ THERE IS NO SCOPE PARAMETER, and that is the design. What comes back is
   * decided by the caller's permission, server-side:
   *
   *   with JOB_PORTAL:APPROVE     every member's applications — the queue
   *   without it                  the caller's own, clamped in SQL
   *
   * So the same call serves both audiences and a client cannot ask for the
   * wrong one. Gate the management COLUMNS and the row actions on the same
   * grant (`can(JOB_PORTAL, APPROVE)`) so the table matches what arrived.
   */
  applications: ({ status, jobId, page, limit } = {}) =>
    api.get('/api/v1/applied-jobs', {
      params: {
        status: status || undefined,
        job_id: jobId ?? undefined,
        page: page ?? undefined,
        limit: limit ?? undefined,
      },
    }),

  /**
   * POST /api/v1/applied-jobs/{id}/approval — decide one application.
   *
   * `status` is Active / Rejected / Closed, and must be legal from where the
   * application currently is (see APPLICATION_TRANSITIONS). Moving it to
   * `Active` is what unseals the employer's contact details for the applicant.
   */
  setApplicationApproval: (applicationId, status) =>
    api.post(
      `/api/v1/applied-jobs/${applicationId}/approval`,
      { status },
      { envelope: true }
    ),
};
