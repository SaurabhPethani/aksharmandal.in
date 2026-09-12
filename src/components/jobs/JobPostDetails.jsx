import { useState } from 'react';
import { Lock, Mail, Phone, User } from 'lucide-react';
import { Modal } from '../Overlays';
import { Button } from '../ui';
import JobPostStatusBadge from './JobPostStatusBadge';
import JobApplicationStatus from './JobApplicationStatus';
import { postedLabel } from './JobPostCard';
import { normalizeStatus, revealsContact } from '../../constants/jobs';

/**
 * One post, opened from its card.
 *
 * ── WHAT DECIDES THE APPLY BUTTON ─────────────────────────────────────────
 *
 * The caller's own application status, which the API sends WITH the post as
 * `my_application_status`. There are five cases and they are mutually
 * exclusive, so exactly one thing is on screen:
 *
 *   null (no application)  the Apply button
 *   Pending                "Waiting for approval"            (green)
 *   Rejected               "Your application is rejected."
 *   Closed                 "Your application is cancelled."
 *   Active                 the employer's contact details
 *
 * That field is why there is no second request here. An older version of this
 * screen tracked applications in a `Set` in React state, which forgot
 * everything on reload and could not tell an approved application from a
 * rejected one — the API now answers the question properly.
 *
 * ── THE CONTACT DETAILS ARE THE POINT OF THE APPROVAL STEP ────────────────
 *
 * Contact person, mobile and email are not merely hidden here — the server
 * does not send them until the application is Active. So this component cannot
 * leak them by accident, and `contact_visible` tells it whether a null means
 * "withheld" or "the poster left it blank", which are different sentences.
 *
 * A checker or the post's own author gets them unconditionally; for them the
 * apply flow is irrelevant and the block just renders.
 *
 * ── NO APPROVAL HERE ──────────────────────────────────────────────────────
 *
 * The dialog performs exactly three writes, and moving a post between statuses
 * is not one of them: Edit and Close post (the AUTHOR's, on their own post) and
 * Apply (any viewer's). A post's approval endpoint exists and jobsService
 * documents it, but no screen calls it.
 */

/** Rendered only when it carries a value — see JobPostCard on nullable columns. */
function Detail({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-faint">{label}</p>
      <p className="mt-0.5 break-words text-sm font-semibold text-primary">{value}</p>
    </div>
  );
}

function Prose({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="eyebrow mb-1">{label}</p>
      <p className="whitespace-pre-line text-sm leading-relaxed text-text-muted">{value}</p>
    </div>
  );
}

export default function JobPostDetails({
  job, isOpen, onClose,
  /** JOB_PORTAL:CREATE — edit and close, and only on the caller's own post. */
  canWrite,
  /** True when the signed-in member created this post. */
  isOwner,
  busy,
  onEdit, onApply, onCloseJob,
}) {
  const [closing, setClosing] = useState(false);
  const [remarks, setRemarks] = useState('');

  const posted = postedLabel(job.date_posted ?? job.created_at);
  const isLive = normalizeStatus(job.status) === 'active';
  const application = job.my_application_status ?? null;
  const revealed = job.contact_visible || revealsContact(application);
  const hasContact = job.contact_person || job.contact_email || job.contact_mobile;

  // `can_apply` is the server's own answer (post is Active AND no application
  // held). Falling back to the two local facts keeps the button honest against
  // an older payload that predates the field.
  const canApply = job.can_apply ?? (isLive && !application);

  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button onClick={onClose} disabled={busy}>Close</Button>
      {/* Edit and Close belong to the AUTHOR. Showing them to every CREATE
          holder offered an action the backend answers with 403. */}
      {canWrite && isOwner && (
        <Button onClick={() => onEdit(job)} disabled={busy}>Edit</Button>
      )}
      {canWrite && isOwner && !['rejected', 'closed'].includes(normalizeStatus(job.status)) && (
        <Button onClick={() => { setClosing(true); setRemarks(''); }} disabled={busy}>
          Close post
        </Button>
      )}
      {/* NO REVIEW / APPROVE BUTTON, for anybody. A job post's status is not
          changed from this screen — the only status action here is the author
          closing their own post, above. `PATCH /job-posts/{id}/approval` still
          exists and jobsService still documents it; nothing in the app calls
          it. Do not add a button back without also deciding where a checker is
          meant to find Pending posts. */}
      {canApply && (
        <Button variant="primary" onClick={() => onApply(job)} disabled={busy}>Apply</Button>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title={job.title || 'Job post'}
      dismissible={!busy}
      size="lg"
      footer={footer}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <JobPostStatusBadge status={job.status} />
          {job.job_code && (
            <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-text-muted">
              {job.job_code}
            </span>
          )}
          {posted && <span className="text-xs text-text-faint">Posted {posted}</span>}
        </div>

        {/* Where the reader stands, in their own words. Renders nothing when
            they have not applied — which is when the Apply button speaks. */}
        {application && <JobApplicationStatus status={application} />}

        <div className="grid grid-cols-2 gap-4 rounded-control bg-bg px-4 py-3 sm:grid-cols-3">
          <Detail label="Company" value={job.company_name} />
          <Detail label="Designation" value={job.designation} />
          <Detail label="Department" value={job.department} />
          <Detail label="Location" value={job.location} />
          <Detail label="Experience" value={job.experience} />
          <Detail label="Education" value={job.education} />
          <Detail label="Salary" value={job.salary_range} />
        </div>

        <Prose label="Job description" value={job.job_description} />
        <Prose label="Requirements" value={job.requirements} />

        {/* ── Contact: sent by the server only once it is the reader's to see ── */}
        <div>
          <p className="eyebrow mb-2">Contact</p>
          {revealed && hasContact ? (
            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-control border border-success-fg/30 bg-success-bg/40 px-4 py-3 text-sm">
              {job.contact_person && (
                <span className="flex items-center gap-1.5 text-primary">
                  <User className="h-3.5 w-3.5 text-text-faint" />{job.contact_person}
                </span>
              )}
              {job.contact_mobile && (
                <a href={`tel:${job.contact_mobile}`} className="flex items-center gap-1.5 font-semibold text-primary hover:text-accent">
                  <Phone className="h-3.5 w-3.5 text-text-faint" />{job.contact_mobile}
                </a>
              )}
              {job.contact_email && (
                <a href={`mailto:${job.contact_email}`} className="flex items-center gap-1.5 font-semibold text-primary hover:text-accent">
                  <Mail className="h-3.5 w-3.5 text-text-faint" />{job.contact_email}
                </a>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-dashed border-line-strong bg-bg px-4 py-3">
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <Lock className="h-4 w-4 flex-shrink-0 text-text-faint" />
                {revealed
                  // Visible to this reader, and genuinely blank on the post.
                  ? 'The poster did not leave any contact details.'
                  : contactHint(application, isLive)}
              </p>
              {canApply && (
                <Button variant="primary" onClick={() => onApply(job)} disabled={busy}>
                  Apply
                </Button>
              )}
            </div>
          )}
        </div>

        {closing && (
          <div className="space-y-3 rounded-control border-2 border-line-strong p-4">
            <p className="text-sm font-bold text-primary">Close this post</p>
            <p className="text-xs text-text-muted">It leaves the board. Remarks are optional.</p>
            <textarea
              rows={2} className="input-field resize-y" value={remarks} disabled={busy}
              placeholder="Why is it being closed?"
              onChange={(e) => setRemarks(e.target.value)}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setClosing(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={() => onCloseJob(remarks.trim())} busy={busy}>
                Close post
              </Button>
            </div>
          </div>
        )}

        {/* Who posted it, and any remark the checker left on it. */}
        {(job.created_by_name || job.remarks) && (
          <div className="rounded-control border border-line-soft px-4 py-3">
            {job.created_by_name && (
              <p className="text-sm text-text-muted">Posted by {job.created_by_name}</p>
            )}
            {job.remarks && <p className="mt-1 text-sm text-primary">“{job.remarks}”</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Why the contact block is sealed, told from where the reader actually is.
 *
 * Four different reasons, and a single line for all of them would be wrong in
 * three of the cases — "apply to see them" is misleading to somebody whose
 * application was already rejected.
 */
function contactHint(application, isLive) {
  switch (normalizeStatus(application)) {
    case 'pending':
      return 'The contact details appear here once your application is approved.';
    case 'rejected':
      return 'Contact details are shared only with approved applicants.';
    case 'closed':
      return 'This application was cancelled, so the contact details are not shared.';
    default:
      return isLive
        ? 'Apply for this job — the contact details appear once your application is approved.'
        : 'Contact details are shared with approved applicants while a post is active.';
  }
}
