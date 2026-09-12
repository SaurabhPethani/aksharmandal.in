import { Briefcase, Mail, Phone, User } from 'lucide-react';
import { DataTable, Pagination } from '../DataTable';
import { EmptyState } from '../ui';
import JobPostStatusBadge from './JobPostStatusBadge';
import JobApplicationStatus from './JobApplicationStatus';
import { APPLICATION_ACTION_LABEL, nextApplicationStatuses } from '../../constants/jobs';
import { postedLabel } from './JobPostCard';

/**
 * Applications, as a table. Serves BOTH audiences off the same rows:
 *
 *   manage=false   "My Applications" — what I applied for and where each one
 *                  stands. The Contact column is the EMPLOYER's details, which
 *                  the API only sends once my application is Active.
 *   manage=true    the checker's queue — who applied to what, and the actions
 *                  legal from each row's current status. The Contact column is
 *                  the APPLICANT's details, because reaching them is the job.
 *
 * The two are one component because they are one list with one pager and one
 * empty state; only the columns differ, and they differ in a table that reads
 * top to bottom right here rather than across two files that drift.
 *
 * ⚠ THE ACTIONS ARE DERIVED, NEVER HARDCODED. `nextApplicationStatuses` is the
 * client's copy of the backend's transition table: a Pending row offers Approve
 * / Reject / Cancel, an Active row offers only Cancel, and a Rejected or Closed
 * row offers nothing at all. Rendering a button the backend would refuse is the
 * failure mode this guards against.
 */

/** The employer's three fields, shown only when the API actually sent them. */
function EmployerContact({ row }) {
  const person = row.job_contact_person;
  const mobile = row.job_contact_mobile;
  const email = row.job_contact_email;

  if (!person && !mobile && !email) {
    // Null here is the server withholding them, not the post lacking them —
    // say which, or the reader thinks the employer left the fields blank.
    return (
      <span className="text-xs text-text-faint">
        {row.status === 'Active' ? 'Not provided' : 'Available once approved'}
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5 text-xs">
      {person && (
        <span className="flex items-center gap-1.5 font-semibold text-primary">
          <User className="h-3 w-3 text-text-faint" />{person}
        </span>
      )}
      {mobile && (
        <a href={`tel:${mobile}`} className="flex items-center gap-1.5 font-semibold text-primary hover:text-accent">
          <Phone className="h-3 w-3 text-text-faint" />{mobile}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className="flex items-center gap-1.5 text-primary hover:text-accent">
          <Mail className="h-3 w-3 text-text-faint" />{email}
        </a>
      )}
    </span>
  );
}

function JobCell({ row }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-semibold text-primary">{row.job_title || 'Job post'}</span>
      <span className="text-xs text-text-faint">
        {[row.job_code, row.company_name].filter(Boolean).join(' · ')}
      </span>
    </span>
  );
}

export default function JobApplicationList({
  pager, manage = false, canApprove = false, onDecide,
}) {
  const rows = pager.pageRows ?? [];

  const columns = manage
    ? [
        { key: 'job', label: 'Job', render: (r) => <JobCell row={r} /> },
        {
          key: 'applicant',
          label: 'Applicant',
          render: (r) => (
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-primary">
                {r.applicant_name || r.contact_person || '—'}
              </span>
              {r.contact_email && <span className="text-xs text-text-faint">{r.contact_email}</span>}
            </span>
          ),
        },
        {
          key: 'mobile',
          label: 'Mobile',
          // The applicant's submitted number first: it is the one they asked to
          // be reached on, which may not be the one on their member record.
          render: (r) => {
            const mobile = r.contact_mobile || r.applicant_mobile;
            return mobile
              ? <a href={`tel:${mobile}`} className="font-semibold text-primary hover:text-accent">{mobile}</a>
              : '—';
          },
        },
        { key: 'applied_at', label: 'Applied on', render: (r) => postedLabel(r.applied_at) ?? '—' },
        {
          key: 'status',
          label: 'Status',
          render: (r) => (
            <span className="flex flex-wrap items-center gap-1.5">
              <JobApplicationStatus status={r.status} compact />
              {/* The vacancy's own state, so a checker approving into a Closed
                  post knows that is what they are doing. */}
              {r.job_status && r.job_status !== 'Active' && (
                <JobPostStatusBadge status={r.job_status} />
              )}
            </span>
          ),
        },
        {
          key: 'action',
          label: 'Action',
          render: (r) => {
            const options = canApprove ? nextApplicationStatuses(r.status) : [];
            if (!options.length) {
              return <span className="text-xs text-text-faint">—</span>;
            }
            return (
              <span className="flex flex-wrap gap-1.5">
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onDecide(r, option)}
                    className="rounded-control border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-50"
                  >
                    {APPLICATION_ACTION_LABEL[option] ?? option}
                  </button>
                ))}
              </span>
            );
          },
        },
      ]
    : [
        { key: 'job', label: 'Job', render: (r) => <JobCell row={r} /> },
        { key: 'location', label: 'Location', render: (r) => r.location || '—' },
        { key: 'applied_at', label: 'Applied on', render: (r) => postedLabel(r.applied_at) ?? '—' },
        {
          key: 'status',
          label: 'My application',
          render: (r) => <JobApplicationStatus status={r.status} compact />,
        },
        { key: 'contact', label: 'Employer contact', render: (r) => <EmployerContact row={r} /> },
      ];

  return (
    <div className="card overflow-hidden !p-0">
      <DataTable
        rows={rows}
        columns={columns}
        loading={pager.isLoading}
        error={pager.error}
        onRetry={pager.refetch}
        // `isFetching` while rows are already on screen is a page change or a
        // filter — an overlay, not a full reload, so the table does not blank.
        busy={pager.isFetching && !pager.isLoading}
        empty={
          <EmptyState
            title={manage ? 'No applications yet' : 'You haven’t applied for a job'}
            hint={
              manage
                ? 'Applications appear here as members apply to posts on the board.'
                : 'Open a job from the board and use Apply — it will show up here.'
            }
            icon={Briefcase}
          />
        }
      />
      <Pagination
        page={pager.page}
        pageCount={pager.pageCount}
        total={pager.total}
        onChange={pager.setPage}
        pageSize={pager.pageSize}
        onPageSize={pager.setPageSize}
      />
    </div>
  );
}
