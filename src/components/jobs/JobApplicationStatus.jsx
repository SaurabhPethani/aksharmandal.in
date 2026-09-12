import { CheckCircle2, Clock, XCircle, Ban } from 'lucide-react';
import { applicationMessage, normalizeStatus } from '../../constants/jobs';

/**
 * WHERE THE APPLICANT STANDS, in one line.
 *
 * This is the component the whole apply flow reads through: given the caller's
 * own application status for a post, it says which of the four things has
 * happened, and its absence (status `null`) is what means "not applied — show
 * the Apply button". The caller decides that; this component renders nothing
 * for a null so the two cannot both appear.
 *
 * PENDING IS GREEN, deliberately. Every instinct says amber — it is a waiting
 * state — but the message is "we have your application", which is good news.
 * Amber would read as "something is wrong with it".
 *
 * The four sentences live in constants/jobs.js, not here, because the detail
 * dialog and the applications table must say the same words.
 */

const ICONS = {
  pending: Clock,
  active: CheckCircle2,
  rejected: XCircle,
  closed: Ban,
};

/** Chip tones, keyed by the `tone` the message table assigns. */
const TONES = {
  success: 'border-success-fg/30 bg-success-bg text-success-fg',
  danger: 'border-danger-fg/30 bg-danger-bg text-danger-fg',
  muted: 'border-line-strong bg-bg text-text-muted',
};

/**
 * @param status  the APPLICATION's status — Pending / Active / Rejected /
 *                Closed, or null/undefined when the caller has not applied.
 * @param compact a bare chip for a table cell, rather than the full sentence.
 */
export default function JobApplicationStatus({ status, compact = false, className = '' }) {
  const message = applicationMessage(status);
  if (!message) return null;

  const Icon = ICONS[normalizeStatus(status)] ?? Clock;
  const tone = TONES[message.tone] ?? TONES.muted;

  if (compact) {
    return (
      <span
        className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone} ${className}`}
      >
        <Icon className="h-3.5 w-3.5" />
        {status}
      </span>
    );
  }

  return (
    <p
      role="status"
      className={`inline-flex items-center gap-2 rounded-control border px-4 py-2.5 text-sm font-semibold ${tone} ${className}`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {message.label}
    </p>
  );
}
