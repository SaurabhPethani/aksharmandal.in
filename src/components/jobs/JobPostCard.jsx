import { ArrowUpRight, Briefcase, GraduationCap, IndianRupee, MapPin } from 'lucide-react';
import JobPostStatusBadge from './JobPostStatusBadge';
import JobApplicationStatus from './JobApplicationStatus';

/**
 * One job post, as a CARD in a grid.
 *
 * WHY A CARD AND NOT A TABLE ROW. This screen competes for attention with every
 * job board its readers already use, and those are all card grids for the same
 * reason: a vacancy is a *pitch*, not a record. The three things somebody
 * decides on — what the role is, where it is, what it pays — get to be large
 * and separate, the card is a single tap target on a phone, and two or three
 * fit across a desktop so scanning ten roles is one screen instead of a scroll.
 *
 * The monogram is the card's anchor. Every post has a title; most have a
 * company. A tinted initial gives each card a distinct shape at a glance,
 * which a column of identical briefcase icons does not.
 *
 * Every field below `title` is nullable on JobPostResponse, so each element is
 * rendered only when it has something to say — a row of em-dashes reads as
 * broken data rather than as a sparse post.
 *
 * NO CONTACT FIELDS ARE RENDERED HERE, and that rule outlives the payload: the
 * API withholds them until the reader's application is Active, but even when it
 * does send them (the poster's own card, a checker's), the phone number belongs
 * in the detail dialog rather than on something scrolled past.
 *
 * TWO BADGES, DIFFERENT QUESTIONS. `JobPostStatusBadge` is the VACANCY's state;
 * `JobApplicationStatus` is where THIS reader stands with it. A card reading
 * "Active" + "Pending" is correct and common — the job is open, this member is
 * waiting.
 */

/** "12 Aug 2026", or nothing when the date is absent or unreadable. */
export function postedLabel(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * "2 days ago" for anything inside a fortnight, the date after that.
 *
 * Freshness is what a job seeker actually reads off a date — "3 days ago" says
 * the role is live in a way "07 Aug 2026" does not. Past a couple of weeks the
 * relative form stops helping ("47 days ago"), so it hands back to the date.
 */
export function freshnessLabel(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 0) return postedLabel(value);   // clock skew; don't say "in -1 days"
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 14) return `${days} days ago`;
  return postedLabel(value);
}

/** First letter of the company, else of the title. The card's visual anchor. */
function monogram(job) {
  const source = job.company_name || job.title || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

/**
 * Four tints, chosen by the monogram so a given company keeps the same colour
 * everywhere. Deterministic, not random: a card that changes colour between
 * renders reads as a glitch.
 */
const TINTS = [
  'bg-primary-50 text-primary',
  'bg-warning-badge text-warning-fg',
  'bg-success-bg text-success-fg',
  'bg-primary-100 text-primary',
];
const tintFor = (letter) => TINTS[letter.charCodeAt(0) % TINTS.length];

function Chip({ icon: Icon, children }) {
  if (!children) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-text-muted">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-text-faint" />
      <span className="truncate">{children}</span>
    </span>
  );
}

export default function JobPostCard({ job, onOpen }) {
  const posted = freshnessLabel(job.date_posted ?? job.created_at);
  const letter = monogram(job);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(job)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); // Space would scroll the page
        onOpen(job);
      }}
      aria-label={`View ${job.title || 'job post'}`}
      className="group relative flex h-full cursor-pointer flex-col gap-4 overflow-hidden rounded-card border border-line-soft bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_10px_28px_rgba(0,49,88,0.13)] focus:outline-none focus-visible:-translate-y-1 focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transform-none motion-reduce:transition-none"
    >
      {/* A hairline of accent that fills in on hover — the card's only piece of
          decoration, and it earns its place by showing which card has focus
          during keyboard navigation. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-accent transition-transform duration-200 group-hover:scale-x-100 group-focus-visible:scale-x-100 motion-reduce:transition-none"
      />

      <header className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold ${tintFor(letter)}`}
        >
          {letter}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold leading-snug text-primary line-clamp-2 group-hover:text-primary-hover">
            {job.title || 'Untitled post'}
          </h3>
          <p className="mt-1 truncate text-sm font-semibold text-text-muted">
            {job.company_name || job.department || 'Akshar Mandal'}
          </p>
        </div>

        <ArrowUpRight className="h-5 w-5 flex-shrink-0 text-text-faint transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent motion-reduce:transform-none" />
      </header>

      {job.designation && (
        <p className="-mt-1 truncate text-sm font-semibold text-accent">{job.designation}</p>
      )}

      {/* Chips wrap and each drops out when its column is null, so the block is
          never a run of separators around missing data. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip icon={MapPin}>{job.location}</Chip>
        <Chip icon={Briefcase}>{job.experience}</Chip>
        <Chip icon={IndianRupee}>{job.salary_range}</Chip>
        <Chip icon={GraduationCap}>{job.education}</Chip>
      </div>

      {/* mt-auto pins the footer to the bottom, so cards of different heights in
          one grid row still line their metadata up. */}
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <JobPostStatusBadge status={job.status} />
          {/* Renders nothing when the reader has not applied — which is exactly
              when the card should carry no application chip. */}
          <JobApplicationStatus status={job.my_application_status} compact />
        </span>
        <span className="flex items-center gap-2 text-xs text-text-faint">
          {job.job_code && <span className="font-semibold text-text-muted">{job.job_code}</span>}
          {posted && <span>{posted}</span>}
        </span>
      </footer>
    </article>
  );
}
