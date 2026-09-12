import { useMemo, useState } from 'react';
import { Briefcase, Plus, Search, Sparkles, X } from 'lucide-react';
import { usePermissions, useToast } from '../hooks';
import { useMe } from '../hooks/useLookups';
import {
  useJobPosts, useMyJobPosts, useJobPostMutations,
  useJobApplications, useJobApplicationMutations,
} from '../hooks/useJobs';
import { ACTIONS, MODULES } from '../constants/permissions';
import { searchMatches } from '../utils/options';
import { APPLICATION_STATUSES, nextApplicationStatuses } from '../constants/jobs';
import { Button, EmptyState, PageHeader } from '../components/ui';
import JobPostList from '../components/jobs/JobPostList';
import JobPostDetails from '../components/jobs/JobPostDetails';
import JobFormDialog from '../components/jobs/JobFormDialog';
import JobApplyDialog from '../components/jobs/JobApplyDialog';
import JobApprovalDialog from '../components/jobs/JobApprovalDialog';
import JobApplicationList from '../components/jobs/JobApplicationList';

/**
 * Job Portal — a board with a maker/checker step, and an application workflow
 * of its own on top of it.
 *
 * THREE TABS, and only three:
 *
 *   Job Board        JOB_PORTAL:READ   live vacancies
 *   My Posts         JOB_PORTAL:READ   the caller's own, whatever their status
 *   My Applications  JOB_PORTAL:READ   what the caller applied for, and where it stands
 *
 * ⚠ WHAT EACH LIST CONTAINS IS THE SERVER'S DECISION, NOT A PARAMETER. Both
 * `/job-posts` and `/applied-jobs` read the caller's grants and answer
 * accordingly, so the same three tabs serve a Yuvak and a Sabha Head:
 *
 *   Job Board        without APPROVE → Active only. With it → Pending + Active,
 *                    so the review queue IS the board rather than a fourth tab.
 *   My Applications  without APPROVE → the caller's own. With it → every
 *                    member's, and the table grows its Applicant / Mobile /
 *                    Action columns to match. The tab's LABEL changes with it,
 *                    because "My Applications" would be a lie for a checker.
 *
 * There is no status filter on the board. The board is the live roles; a filter
 * whose only other options are settled history is a control nobody reaches for.
 *
 * Every permission check reads `is_granted` out of full-context via
 * `usePermissions().can` — no role name appears in this file, and none should.
 * The backend re-checks all of them; what happens here is only whether a
 * control is drawn.
 *
 * WHAT PUTS THIS SCREEN IN THE MENU is not decided here. The module is
 * JOB_PORTAL in full-context; the nav shows it when the backend flags
 * `is_visible_nav` AND the caller holds READ (see services/navigation.service.js).
 * This file only decides what the page does once opened, and re-checks READ so
 * that reaching the URL directly is refused too.
 */

const APPLICATION_FILTERS = [
  { key: 'all', label: 'All', status: undefined },
  ...APPLICATION_STATUSES.map((s) => ({ key: s.toLowerCase(), label: s, status: s })),
];

/**
 * The My Posts pills, in workflow order. `label` is what the status MEANS to
 * the person who wrote the post — an author reads "awaiting approval", not
 * "Pending" — and a status with no posts is skipped entirely.
 */
const MY_POST_PILLS = [
  { status: 'Active', tone: 'live', label: 'live' },
  { status: 'Pending', tone: 'review', label: 'awaiting approval' },
  { status: 'Rejected', tone: 'muted', label: 'rejected' },
  { status: 'Closed', tone: 'muted', label: 'closed' },
];

/** Substring match over the fields somebody would actually search a board by. */
const SEARCH_FIELDS = [
  'title', 'company_name', 'designation', 'department',
  'location', 'education', 'experience', 'salary_range', 'job_code',
];

function searchJobs(rows, term) {
  if (!term.trim()) return rows;
  // Search by anything: each word must appear in some searchable field, any order.
  return rows.filter((job) => searchMatches(SEARCH_FIELDS.map((f) => job[f] ?? '').join(' '), term));
}

/**
 * The tab switcher — a segmented control rather than a row of buttons.
 *
 * The pill sits inside a tinted track, so the set reads as one control with a
 * current position instead of three independent things.
 *
 * ⚠ NO COUNT BADGES. They were here and they lied: each tab's query is enabled
 * only while that tab is open, so a badge could only ever be right for the tab
 * you were already looking at and read as an empty list for the other two. The
 * honest fix is not to fetch all three up front — that is three requests on
 * mount to decorate two tabs nobody opened — but to put every count where it
 * describes exactly what is underneath it. See `PillRow` and the pager.
 */
function TabBar({ tabs, active, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Job portal sections"
      className="mb-5 inline-flex w-full gap-1 overflow-x-auto rounded-2xl bg-primary-50/70 p-1 sm:w-auto"
    >
      {tabs.map((t) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.key)}
            className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm transition-all sm:flex-none ${
              selected
                ? 'bg-surface font-bold text-primary shadow-card'
                : 'font-semibold text-text-muted hover:text-primary'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The counts above a grid, as PILLS rather than a sentence.
 *
 * They count THE ROWS RENDERED BELOW THEM and nothing else, which is the whole
 * point: the first version of this put "N live openings" in the hero, where it
 * was computed from a different set than the one on screen (a checker's board
 * carries Pending posts too, so the headline said 21 while 26 cards sat under
 * it) and blanked out entirely whenever another tab was open.
 *
 * The second version was correct and dull — a grey run-on line reading
 * "31 openings · 6 awaiting review, 25 live". A count is a status, so it is
 * drawn like one: each number gets its own pill in its own colour, and `live`
 * gets a pulsing dot because that is a claim about right now.
 *
 * Rendered only once the query has resolved — a count beside a skeleton grid is
 * a number the reader cannot check.
 */

const PILL_TONES = {
  live: 'border-success-fg/25 bg-success-bg text-success-fg',
  review: 'border-warning-border bg-warning-bg text-warning-fg',
  neutral: 'border-line-strong bg-surface text-primary',
  muted: 'border-line-soft bg-bg text-text-muted',
};

function Pill({ tone = 'neutral', pulse = false, count, label }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${PILL_TONES[tone]}`}
    >
      {pulse && (
        // Two stacked dots: a static core and a ring that expands and fades.
        // `animate-ping` is Tailwind core; the reduced-motion variant leaves the
        // solid dot behind so the pill still reads as "live" without moving.
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-fg opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success-fg" />
        </span>
      )}
      <span className="tabular-nums">{count}</span>
      <span className="font-semibold opacity-80">{label}</span>
    </span>
  );
}

function PillRow({ query, children }) {
  if (query.isLoading || query.error) return null;
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

/** The pill row over the two application tables. */
function FilterChips({ options, value, onChange }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {options.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange(f.key)}
          aria-current={f.key === value ? 'page' : undefined}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all ${
            f.key === value
              ? 'border-primary bg-primary text-white shadow-card'
              : 'border-line-strong bg-surface text-primary hover:border-primary hover:bg-primary-50'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export default function JobsPage({ module }) {
  const { can } = usePermissions();
  const toast = useToast();

  const canRead = can(MODULES.JOB_PORTAL, ACTIONS.READ);
  // CREATE covers editing and closing too — the module declares no UPDATE.
  const canWrite = can(MODULES.JOB_PORTAL, ACTIONS.CREATE);
  const canApprove = can(MODULES.JOB_PORTAL, ACTIONS.APPROVE);

  const [activeTab, setActiveTab] = useState('board');
  const [search, setSearch] = useState('');
  const [appliedFilter, setAppliedFilter] = useState('all');

  const appliedStatus = APPLICATION_FILTERS.find((f) => f.key === appliedFilter)?.status;

  // One query per tab, enabled only while that tab is open: switching costs one
  // request rather than three on mount.
  const boardQ = useJobPosts(canRead && activeTab === 'board');
  const mineQ = useMyJobPosts(canRead && activeTab === 'mine');
  const appliedQ = useJobApplications({ status: appliedStatus }, canRead && activeTab === 'applied');

  // Own record, to seed the apply form. Fetched only when it could be used.
  const meQ = useMe(canRead);

  const { savePost, applyToPost, closePost } = useJobPostMutations();
  const { decide } = useJobApplicationMutations();

  const [formJob, setFormJob] = useState(null);    // { job } | null — null means closed
  const [openJob, setOpenJob] = useState(null);    // the detail dialog's post
  const [applyJob, setApplyJob] = useState(null);  // the apply dialog's post
  // An APPLICATION being decided. Posts are never reviewed from this screen.
  const [review, setReview] = useState(null);      // { record, initialStatus }

  const rowsOf = (q) => (Array.isArray(q.data) ? q.data : q.data?.items ?? []);
  const board = rowsOf(boardQ);
  const mine = rowsOf(mineQ);

  // Searching happens in the browser: the board is one unpaginated response, so
  // the whole set is already in hand and a round-trip per keystroke would buy
  // nothing.
  const visibleBoard = useMemo(() => searchJobs(board, search), [board, search]);

  // The dialog needs the freshest copy of the post: applying patches the cached
  // row, and reading `openJob` (a snapshot from the click) would keep showing
  // the Apply button after the application landed.
  const openJobRow = useMemo(() => {
    if (!openJob) return null;
    const pool = activeTab === 'mine' ? mine : board;
    return pool.find((j) => j.job_id === openJob.job_id) ?? openJob;
  }, [openJob, board, mine, activeTab]);

  if (!canRead) {
    return (
      <>
        <PageHeader title={module?.label ?? 'Job Portal'} />
        <div className="card">
          <EmptyState
            title="No access"
            hint="Your role does not grant the Job Portal · Read action."
            icon={Briefcase}
          />
        </div>
      </>
    );
  }

  const TABS = [
    { key: 'board', label: 'Job Board' },
    { key: 'mine', label: 'My Posts' },
    // A checker's list is everyone's, so calling it "mine" would be wrong.
    { key: 'applied', label: canApprove ? 'Applications' : 'My Applications' },
  ];

  /** Every write reports the backend's own wording and then closes its dialog. */
  const run = (mutation, vars, fallback, after) =>
    mutation.mutate(vars, {
      onSuccess: (res) => { toast.success(res?.detail ?? fallback); after?.(); },
      onError: (err) => toast.error(err?.message ?? 'That did not go through.'),
    });

  /**
   * A row's Approve / Reject / Cancel button opens the dialog rather than
   * firing immediately — cancelling somebody's application by mis-clicking a
   * table cell is not recoverable, and the dialog also shows the job the row
   * belongs to, which the button alone does not.
   */
  const openApplicationReview = (row, initialStatus) => {
    if (!nextApplicationStatuses(row.status).length) return;
    decide.reset();
    setReview({ record: row, initialStatus });
  };

  const startPost = () => { savePost.reset(); setFormJob({ job: null }); };

  // A checker's board carries Pending posts alongside the live ones, so the two
  // are counted separately and neither is described as the other.
  const liveCount = board.filter((j) => j.status === 'Active').length;
  const pendingCount = board.length - liveCount;

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────────────
          A filled navy panel rather than the plain PageHeader every other screen
          uses. This is the one module a member browses for themselves rather
          than being sent to, so it gets to look like somewhere worth arriving:
          a headline, a live count that changes, and the primary action in reach
          on a phone. The gradient is two stops of the existing brand navy — no
          new colour is introduced. */}
      <section className="mb-6 overflow-hidden rounded-card bg-gradient-to-br from-primary via-primary to-primary-hover p-6 text-white shadow-card sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white/90">
              <Sparkles className="h-3.5 w-3.5" />
              {module?.label ?? 'Job Portal'}
            </span>
            <h1 className="mt-3 font-display text-2xl font-bold leading-tight sm:text-3xl">
              Find your next role.
            </h1>
            {/* Deliberately COUNTLESS. The hero is on screen for all three tabs,
                but only the open tab's data is loaded — so any number here is
                either stale, absent, or (on a checker's board, which carries
                Pending posts) describing a different set from the cards below.
                The counts live above their own grids instead. */}
            <p className="mt-1.5 max-w-xl text-sm text-white/75">
              Vacancies shared across the Mandal. Apply in one tap — the employer’s
              details unlock once your application is approved.
            </p>
          </div>

          {canWrite && (
            <button
              type="button"
              onClick={startPost}
              className="inline-flex items-center gap-2 rounded-control bg-accent px-5 py-3 text-sm font-bold text-white shadow-accent transition-all hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-reduce:transform-none"
            >
              <Plus className="h-4 w-4" />
              Post a Job
            </button>
          )}
        </div>
      </section>

      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'board' && (
        <>
          {/* Search over the loaded board. Shown even on an empty board so its
              absence never looks like a missing feature — but hidden when the
              board has one card, where it would be noise. */}
          {board.length > 1 && (
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
              <input
                type="search"
                className="input-field pl-11 pr-11"
                placeholder="Search by role, company, location or skill…"
                value={search}
                aria-label="Search job posts"
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-text-faint transition-colors hover:bg-bg hover:text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          <PillRow query={boardQ}>
            {search ? (
              // While searching, one pill about the search and nothing else —
              // the live/review split describes the whole board, not the
              // filtered view, and showing both invites reading one as the other.
              <Pill tone="neutral" count={`${visibleBoard.length} of ${board.length}`} label="match" />
            ) : (
              <>
                <Pill tone="live" pulse count={liveCount} label={liveCount === 1 ? 'live role' : 'live roles'} />
                {/* Only a checker's board carries Pending posts, so this pill
                    appears for exactly the people who can act on it. */}
                {pendingCount > 0 && (
                  <Pill tone="review" count={pendingCount} label="awaiting your review" />
                )}
              </>
            )}
          </PillRow>

          <JobPostList
            query={boardQ}
            rows={visibleBoard}
            emptyTitle={search ? `No roles match “${search.trim()}”` : 'No openings right now'}
            emptyHint={
              search
                ? 'Try a shorter search — a company, a city, or part of the job title.'
                : canWrite
                  ? 'Be the first: share a vacancy and it reaches the board once approved.'
                  : 'New vacancies appear here as soon as they are approved. Check back soon.'
            }
            emptyAction={!search && canWrite ? { label: 'Post a Job', onClick: startPost } : null}
            onOpen={setOpenJob}
          />
        </>
      )}

      {activeTab === 'mine' && (
        <>
          {/* One pill per status the author actually has, in workflow order and
              skipping the zeros — a row of "0 Rejected" pills is noise, and the
              one an author opens this tab for is usually Pending. */}
          <PillRow query={mineQ}>
            {MY_POST_PILLS.map(({ status, tone, label }) => {
              const count = mine.filter((j) => j.status === status).length;
              if (!count) return null;
              return (
                <Pill
                  key={status}
                  tone={tone}
                  pulse={status === 'Active'}
                  count={count}
                  label={label}
                />
              );
            })}
          </PillRow>

          <JobPostList
            query={mineQ}
            rows={mine}
            emptyTitle="You haven’t posted a job yet"
            emptyHint={
              canWrite
                ? 'Know of an opening? Share it — it goes live once an approver signs it off.'
                : 'Posts you create will appear here, in every status.'
            }
            emptyAction={canWrite ? { label: 'Post a Job', onClick: startPost } : null}
            onOpen={setOpenJob}
          />
        </>
      )}

      {activeTab === 'applied' && (
        <>
          <FilterChips options={APPLICATION_FILTERS} value={appliedFilter} onChange={setAppliedFilter} />
          <JobApplicationList
            pager={appliedQ}
            // The API already returned everyone's rows for a checker; the table
            // grows the management columns to match what arrived.
            manage={canApprove}
            canApprove={canApprove}
            onDecide={openApplicationReview}
          />
        </>
      )}

      {formJob && (
        // Keyed on the post so the form seeds from the row being edited rather
        // than from whichever one opened it first.
        <JobFormDialog
          key={formJob.job?.job_id ?? 'new-job'}
          job={formJob.job}
          isOpen
          busy={savePost.isPending}
          error={savePost.error?.message ?? null}
          onClose={() => { if (!savePost.isPending) setFormJob(null); }}
          onSubmit={(payload) =>
            run(
              savePost,
              { id: formJob.job?.job_id ?? null, payload },
              'Job post saved.',
              () => { setFormJob(null); setOpenJob(null); }
            )
          }
        />
      )}

      {openJobRow && (
        <JobPostDetails
          key={openJobRow.job_id}
          job={openJobRow}
          isOpen
          canWrite={canWrite}
          isOwner={!!meQ.data?.id && openJobRow.created_by === meQ.data.id}
          busy={closePost.isPending}
          onClose={() => setOpenJob(null)}
          onEdit={(job) => { savePost.reset(); setOpenJob(null); setFormJob({ job }); }}
          onApply={(job) => { applyToPost.reset(); setApplyJob(job); }}
          onCloseJob={(remarks) =>
            run(closePost, { id: openJobRow.job_id, remarks }, 'Post closed.', () => setOpenJob(null))
          }
        />
      )}

      {applyJob && (
        <JobApplyDialog
          key={applyJob.job_id}
          job={applyJob}
          me={meQ.data}
          isOpen
          busy={applyToPost.isPending}
          error={applyToPost.error?.message ?? null}
          onClose={() => { if (!applyToPost.isPending) setApplyJob(null); }}
          onSubmit={(contact) =>
            run(
              applyToPost,
              { id: applyJob.job_id, contact },
              'Application submitted.',
              // The detail dialog stays open: the patched row now carries
              // `my_application_status: 'Pending'`, so it redraws into the
              // waiting message and the reader sees what happened.
              () => setApplyJob(null)
            )
          }
        />
      )}

      {/* Applications only. There is no post-approval dialog — see JobPostDetails. */}
      {review && (
        <JobApprovalDialog
          key={review.record.application_id}
          record={review.record}
          initialStatus={review.initialStatus}
          isOpen
          busy={decide.isPending}
          error={decide.error?.message ?? null}
          onClose={() => { if (!decide.isPending) setReview(null); }}
          onSubmit={({ status }) =>
            run(
              decide,
              { id: review.record.application_id, status },
              'Application updated.',
              () => setReview(null)
            )
          }
        />
      )}
    </>
  );
}
