import { Briefcase } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '../ui';
import JobPostCard from './JobPostCard';

/**
 * A grid of job posts, with its own loading / error / empty states.
 *
 * ONE COMPONENT FOR BOTH TABS. The board and My Posts differ only in which rows
 * they hold and what an empty one should say — the skeleton, the retry and the
 * card rendering are identical, and duplicating them is how the two drift.
 *
 * One column on a phone, two from `sm`, and TWO IS THE CEILING. A third column
 * squeezes the title into three or four wrapped lines and pushes the four chips
 * onto rows of their own, so each card grows taller than the space the extra
 * column saved — a job card has enough to say (title, company, designation,
 * location, experience, salary, education, status, date) that it wants width
 * more than it wants company.
 *
 * THE SKELETON IS CARD-SHAPED, not a spinner, and it renders the same grid — so
 * the page does not reflow when the real cards land. Never show a bare empty
 * area while loading: it reads as "no jobs", which is a different answer.
 */

function CardSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 rounded-card border border-line-soft bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3.5">
        <Skeleton className="h-12 w-12 flex-shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="mt-auto border-t border-line-soft pt-3.5">
        <Skeleton className="h-5 w-28 rounded-full" />
      </div>
    </div>
  );
}

export default function JobPostList({
  query, rows, emptyTitle, emptyHint, emptyAction, onOpen,
}) {
  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Four, not six — two full rows at the widest layout. Six left a third
            row of placeholders hanging below the fold on most screens. */}
        {Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)}
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="card">
        <ErrorState error={query.error} onRetry={query.refetch} title="Could not load job posts" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="card">
        <EmptyState
          title={emptyTitle}
          hint={emptyHint}
          icon={Briefcase}
          action={
            emptyAction && (
              <Button variant="primary" onClick={emptyAction.onClick}>
                {emptyAction.label}
              </Button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {rows.map((job) => (
        <JobPostCard key={job.job_id} job={job} onOpen={onOpen} />
      ))}
    </div>
  );
}
