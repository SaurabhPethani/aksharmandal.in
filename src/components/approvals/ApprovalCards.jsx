import { ChevronRight, User } from 'lucide-react';

/**
 * The cards behind the Approvals tabs.
 *
 * Cards, not a table: a transfer carries two hierarchy PATHS plus up to three
 * actor names, and a table row cannot hold "Pradesh › Mandal › Sabha" twice
 * without becoming unreadable. Every field is labelled, because a reviewer is
 * deciding on someone's behalf and a guessed column meaning is not good enough.
 */

const STATUS_TONE = {
  requested: 'bg-primary-50 text-primary',
  pending: 'bg-[#FEF3C7] text-[#92400E]',
  accepted: 'bg-success-bg text-success-fg',
  approved: 'bg-success-bg text-success-fg',
  rejected: 'bg-danger-bg text-danger-fg',
  cancelled: 'bg-bg text-text-muted',
};

export function StatusBadge({ status }) {
  if (!status) return null;
  const tone = STATUS_TONE[String(status).toLowerCase()] ?? 'bg-bg text-text-muted';
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${tone}`}>
      {status}
    </span>
  );
}

function Avatar() {
  return (
    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white">
      <User className="h-6 w-6" />
    </span>
  );
}

/** A labelled row. Blank values print an em dash rather than collapsing. */
function Field({ label, children }) {
  return (
    <div className="flex gap-3 py-0.5 text-sm">
      <span className="w-28 flex-shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-primary">{children ?? '—'}</span>
    </div>
  );
}

/** "Pradesh › Mandal › Sabha", skipping levels the transfer does not name. */
function HierarchyPath({ pradesh, mandal, sabha }) {
  const parts = [pradesh, mandal, sabha].filter(Boolean);
  if (!parts.length) return '—';
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {parts.map((part, i) => (
        <span key={`${part}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0 text-text-faint" />}
          {part}
        </span>
      ))}
    </span>
  );
}

const asDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * One transfer, in any state.
 *
 * `actions` is whatever the tab allows — the card itself takes no view on who
 * may do what, so the same component serves the pending queue (accept/reject),
 * history (nothing) and my-requests (cancel).
 */
export function TransferCard({ row, actions }) {
  const member = row.user ?? {};
  const name = row.user_name || member.user_name || '—';
  const mobile = member.mobile_number || row.mobile_number;

  return (
    <div className="rounded-card border border-line-soft bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold text-primary">{name}</p>
            {mobile && <p className="text-sm text-text-muted">{mobile}</p>}
          </div>
        </div>
        <StatusBadge status={row.status} />
      </div>

      <div className="space-y-0.5">
        <Field label="Type">{row.type ? row.type[0].toUpperCase() + row.type.slice(1) : '—'}</Field>
        <Field label="From">
          <HierarchyPath
            pradesh={row.from_pradesh_name}
            mandal={row.from_mandal_name}
            sabha={row.from_sabha_name}
          />
        </Field>
        <Field label="To">
          <HierarchyPath
            pradesh={row.to_pradesh_name}
            mandal={row.to_mandal_name}
            sabha={row.to_sabha_name}
          />
        </Field>
        <Field label="Requested by">{row.requested_by_name}</Field>
        {row.followup_name && <Field label="Follow-up">{row.followup_name}</Field>}
        {row.accepted_by_name && <Field label="Accepted by">{row.accepted_by_name}</Field>}
        {row.rejected_by_name && <Field label="Rejected by">{row.rejected_by_name}</Field>}
        {row.cancelled_by_name && <Field label="Cancelled by">{row.cancelled_by_name}</Field>}
        {/* One `reason` column serves rejection and cancellation, so the label
            follows whichever actor is set rather than always saying "Reason". */}
        {row.reason && (
          <Field label={row.cancelled_by_name ? 'Cancel reason' : 'Reason'}>{row.reason}</Field>
        )}
        <Field label="Requested">{asDate(row.created_at)}</Field>
      </div>

      {actions && <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-4">{actions}</div>}
    </div>
  );
}

/** `old → new` for one changed field, with the old value struck through. */
function ChangeRow({ label, from, to }) {
  return (
    <div className="flex flex-wrap items-baseline gap-3 py-0.5 text-sm">
      <span className="w-28 flex-shrink-0 text-text-muted">{label}</span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-text-faint line-through">{from ?? '—'}</span>
        <span className="text-text-muted">→</span>
        <span className="font-medium text-primary">{to ?? '—'}</span>
      </span>
    </div>
  );
}

/** "flat_no" -> "Flat No". The API sends raw column names. */
export const humanizeField = (key) =>
  String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * A value as text. `old_data` / `new_data` hold whatever the column held, which
 * for a few fields is an object or a boolean rather than a string.
 */
export function displayValue(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** One information-change request. */
export function InfoRequestCard({ row, actions }) {
  const member = row.user ?? {};
  const name = row.user_name || member.user_name || '—';
  const fields = row.fields_changed ?? [];

  return (
    <div className="rounded-card border border-line-soft bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold text-primary">{name}</p>
            {member.mobile_number && <p className="text-sm text-text-muted">{member.mobile_number}</p>}
          </div>
        </div>
        <StatusBadge status={row.status} />
      </div>

      <div className="space-y-0.5">
        {fields.length === 0 ? (
          <p className="text-sm text-text-muted">No field changes recorded.</p>
        ) : (
          fields.map((f) => (
            <ChangeRow
              key={f}
              label={humanizeField(f)}
              // `*_data_names` carries a resolved label where the raw column
              // held an id; it is usually empty, so the raw value is the fallback.
              from={displayValue(row.old_data_names?.[f] ?? row.old_data?.[f])}
              to={displayValue(row.new_data_names?.[f] ?? row.new_data?.[f])}
            />
          ))
        )}
        <Field label="Requested">{asDate(row.created_at)}</Field>
        {row.approved_by_name && <Field label="Actioned by">{row.approved_by_name}</Field>}
        {row.remarks && <Field label="Remarks">{row.remarks}</Field>}
      </div>

      {actions && <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-4">{actions}</div>}
    </div>
  );
}
