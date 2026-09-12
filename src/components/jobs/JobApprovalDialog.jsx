import { useState } from 'react';
import FormDialog from '../FormDialog';
import JobPostStatusBadge from './JobPostStatusBadge';
import JobApplicationStatus from './JobApplicationStatus';
import { APPLICATION_ACTION_LABEL, nextApplicationStatuses } from '../../constants/jobs';

/**
 * The checker's decision on one JOB APPLICATION — approve, reject or cancel it.
 * This is the step that unseals the employer's contact details for the applicant.
 *
 * ⚠ APPLICATIONS ONLY. This used to take a `kind` prop and decide job POSTS as
 * well, opened from a Review button in the detail dialog. That button is gone —
 * a post's status is not changed from anywhere in this app — so the second mode
 * went with it rather than sitting here unreachable. `PATCH
 * /job-posts/{id}/approval` still exists and jobsService still documents it; if
 * post approval ever comes back, give it its own dialog rather than reviving a
 * `kind` switch, and decide first where a checker is meant to find Pending posts.
 *
 * ⚠ THE OPTIONS ARE FILTERED, NOT DISABLED. A Pending application offers
 * Approve / Reject / Cancel; an Active one offers only Cancel; a Rejected or
 * Closed one is terminal and this dialog will not open for it (the caller checks
 * `nextApplicationStatuses` before offering the action). Showing an illegal
 * option greyed out would invite the click that the backend then 400s.
 *
 * No remarks field: the endpoint's body is `{ status }` and
 * `job_posts_activity_logs` has nowhere to put a note.
 */

const LABEL = 'mb-1.5 block text-sm font-semibold text-primary';

export default function JobApprovalDialog({
  /** The application row being decided. */
  record,
  isOpen, busy, error, onClose, onSubmit,
  /** Pre-selects an action, so a row's "Reject" button opens on Reject. */
  initialStatus = null,
}) {
  const options = nextApplicationStatuses(record?.status);

  const [status, setStatus] = useState(
    () => (initialStatus && options.includes(initialStatus) ? initialStatus : options[0] ?? '')
  );
  const [localError, setLocalError] = useState(null);

  const submit = () => {
    if (!status) {
      setLocalError('Choose what should happen to this application.');
      return;
    }
    setLocalError(null);
    onSubmit({ status });
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Review application — ${record?.job_title || 'job'}`}
      description="Approving this application lets the applicant see the employer’s contact details."
      submitLabel={APPLICATION_ACTION_LABEL[status] ?? 'Save'}
      submitDisabled={!status}
      onSubmit={submit}
      busy={busy}
      error={localError ?? error}
    >
      {/* What is being decided, so the checker is not acting on a row they can
          no longer see behind the dialog. */}
      <div className="space-y-1.5 rounded-control bg-bg px-4 py-3">
        <p className="text-sm font-bold text-primary">
          {record?.applicant_name || 'Applicant'}
          {record?.applicant_mobile && (
            <span className="ml-2 font-medium text-text-muted">{record.applicant_mobile}</span>
          )}
        </p>
        <p className="text-xs text-text-muted">
          {[record?.job_title, record?.company_name].filter(Boolean).join(' · ')}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <JobApplicationStatus status={record?.status} compact />
          {/* The POST's status alongside, because "job Closed / application
              Pending" is a real and confusing combination to decide on. */}
          {record?.job_status && (
            <span className="flex items-center gap-1.5 text-xs text-text-faint">
              Job post:
              <JobPostStatusBadge status={record.job_status} />
            </span>
          )}
        </div>
      </div>

      <fieldset>
        <legend className={LABEL}>Decision</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={busy}
              aria-pressed={option === status}
              onClick={() => setStatus(option)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50 ${
                option === status
                  ? 'border-primary bg-primary text-white'
                  : 'border-line-strong bg-surface text-primary hover:border-primary'
              }`}
            >
              {APPLICATION_ACTION_LABEL[option] ?? option}
            </button>
          ))}
        </div>
      </fieldset>
    </FormDialog>
  );
}
