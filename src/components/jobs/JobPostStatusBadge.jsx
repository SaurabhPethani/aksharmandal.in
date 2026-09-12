import { normalizeStatus } from '../../constants/jobs';

/**
 * The status chip for a job POST, and the tone table behind it.
 *
 * Matched case-insensitively because `status` is a plain string in the schema,
 * not an enum, and the API's filter is documented as case-insensitive — so the
 * value that comes back may not be the casing that was sent. An unrecognised
 * status keeps the backend's own word in a neutral chip rather than being
 * forced into one of ours.
 *
 * ⚠ POSTS ONLY. An application's four statuses read the same but MEAN something
 * else — a Closed post is a filled vacancy, a Closed application is one
 * person's withdrawn submission — so they have their own component with its own
 * wording (JobApplicationStatus). Do not point this one at an application.
 */

// Four statuses, four tones. `paused` is deliberately absent — the status is
// retired, and a stale row carrying it falls through to the neutral default
// rather than being given a look that suggests the state is still live.
const TONES = {
  pending: 'bg-accent/10 text-accent',
  active: 'bg-success-bg text-success-fg',
  rejected: 'bg-danger-bg text-danger-fg',
  closed: 'bg-bg text-text-muted',
};

export function statusTone(status) {
  return TONES[normalizeStatus(status)] ?? 'bg-bg text-text-muted';
}

export default function JobPostStatusBadge({ status, className = '' }) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(status)} ${className}`}
    >
      {status}
    </span>
  );
}
