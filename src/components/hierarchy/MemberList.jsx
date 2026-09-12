import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Pencil, Phone, Plus } from 'lucide-react';
import { BusyOverlay, EmptyState, ErrorState, Skeleton, Toggle } from '../ui';
import PageSizeSelect from '../PageSizeSelect';

// Two presentations of the same rows, matching the reference Users page:
//   < md   stacked cards (no horizontal scroll on phones)
//   >= md  a table
// Both are rendered; CSS decides which is visible.
//
// The Status cell is a switch, and it exists ONLY for callers holding
// USERS:BULK_STATUS_UPDATE. Without the grant the column is not rendered at all
// — header, cells and the cards' status row all go. It used to fall back to a
// read-only Attending / Not Attending badge, which spent a whole column on a
// label nobody could act on. Clicking the switch asks the page to confirm, and
// the page writes nothing until the API says so. Nothing here derives or
// remembers a status — `row.status` as last returned by the backend is the only
// input.
//
// THE WHOLE CELL IS THE TARGET. Name opens the member; Sabha opens Quick
// Transfer; Follow-up and Role open their dialogs. The icons still show which
// action a column carries, but they are decorations inside the cell's button
// rather than the button itself — a 14px icon is a small thing to hit, and
// hitting the name and hitting the pencil beside it should not do different
// things. A cell whose action is not granted renders as plain text, never as a
// button that does nothing.

const PILL = 'rounded-full border border-[#E2EAF4] bg-[#EEF2FA] px-2.5 py-1 text-xs font-semibold text-[#6B7FA3]';
// The table's pill keeps the tighter padding of the `compact` presentation but
// reads at the same size as the cards' — the text was too small to scan.
const PILL_SM = 'rounded-full border border-[#E2EAF4] bg-[#EEF2FA] px-2 py-0.5 text-xs font-semibold text-[#6B7FA3]';

/** The API has shipped status as a boolean and as 'active'/'Active'. */
export const isAttending = (status) =>
  status === true || status === 'active' || status === 'Active';

export const statusLabel = (status) => (isAttending(status) ? 'Attending' : 'Not Attending');

function StatusSwitch({ row, onToggle, busy, compact = false }) {
  if (row.status === null || row.status === undefined || row.status === '') {
    return <span className="text-sm text-[#C0CDE0]">—</span>;
  }

  const attending = isAttending(row.status);

  return (
    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-2.5'}`} onClick={(e) => e.stopPropagation()}>
      <Toggle
        checked={attending}
        disabled={busy}
        onChange={() => onToggle?.(row)}
        label={`Mark ${row.user_name} as ${attending ? 'Not Attending' : 'Attending'}`}
      />
      <span
        className={`whitespace-nowrap text-xs font-semibold ${
          attending ? 'text-success-fg' : 'text-danger-fg'
        }`}
      >
        {attending ? 'Attending' : 'Not Attending'}
      </span>
    </div>
  );
}

function EditLink({ to, name }) {
  return (
    <Link
      to={to}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Edit ${name || 'member'}`}
      className="text-sm font-semibold text-accent transition-colors hover:text-accent-hover hover:underline"
    >
      Edit
    </Link>
  );
}

/**
 * A "Family" pill on a parent-managed child's row. Their number is shown as the
 * parent's (contact_number), so by number alone they're indistinguishable from
 * the parent — this marks them, with the managing member named in the tooltip.
 */
function FamilyBadge({ row }) {
  if (!row?.is_family_member) return null;
  return (
    <span
      className="shrink-0 rounded-full bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
      title={row.managed_by_name ? `Family member of ${row.managed_by_name}` : 'Family member — shares a family number'}
    >
      Family
    </span>
  );
}

/** Name + mobile. Presentational — whatever wraps it decides where it leads. */
function Identity({ row }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="truncate text-sm font-semibold text-primary">
          {row.user_name || '—'}
        </p>
        <FamilyBadge row={row} />
      </div>
      <p className="text-xs text-[#6B7FA3]">
        {/* A parent-managed child's `mobile_number` is a placeholder (…C1) with
            no SIM; show/dial their reachable `contact_number` (the parent's). */}
        {row.contact_number || row.mobile_number || ''}
      </p>
    </div>
  );
}

/**
 * The mobile number as a tap-to-call link — used in the mobile cards, where a
 * phone in hand can dial straight from the list. `tel:` wants a bare dial
 * string, so strip everything but digits and a leading `+`. `stopPropagation`
 * so the tap dials instead of opening the profile / selecting the card.
 */
function CallLink({ mobile, name }) {
  if (!mobile) return null;
  // A child's placeholder number contains a letter (e.g. `9867541878C1`).
  // Stripping non-digits would silently turn it into a DIFFERENT real number
  // (98675418781), so refuse to build a dial link from anything with letters —
  // the caller should pass the resolved `contact_number` instead.
  if (/[a-z]/i.test(String(mobile))) return null;
  const dial = String(mobile).replace(/[^\d+]/g, '');
  return (
    <a
      href={`tel:${dial}`}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Call ${name || 'member'} on ${mobile}`}
      className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#6B7FA3] transition-colors hover:text-accent hover:underline"
    >
      <Phone className="h-3 w-3 shrink-0" />
      {mobile}
    </a>
  );
}

/**
 * The icon a column's action is known by — the same glyph in the same grey box
 * as before, but a span: it lives inside the cell's own button, and a button
 * inside a button is neither valid HTML nor clickable twice.
 *
 * No hover state, here or on the cell around it. The icon says what the column
 * does; the click does it.
 */
function ActionIcon({ icon: Icon }) {
  return (
    <span className="shrink-0 rounded-md p-1 text-[#9BB5CB]">
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * A table cell whose whole area fires one action.
 *
 * `onClick` absent — the caller lacks the grant — leaves an ordinary cell of
 * text. The padding moves onto the button so the hit area reaches the cell's
 * edges rather than stopping at the text.
 */
function ActionCell({ onClick, label, className = '', children }) {
  if (!onClick) {
    return <td className={`whitespace-nowrap px-3 py-2.5 ${className}`}>{children}</td>;
  }

  return (
    <td className={`whitespace-nowrap p-0 ${className}`}>
      <button
        type="button"
        // The row may itself be clickable; without this the cell's action and
        // the row's would both fire.
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        title={label}
        aria-label={label}
        // h-full so the target fills the row's height, not just its own line —
        // the tallest cell (the avatar) sets the row, and the gap either side
        // of a shorter cell would otherwise be dead space inside the column.
        className="flex h-full w-full items-center gap-1.5 px-3 py-2.5 text-left"
      >
        {children}
      </button>
    </td>
  );
}

/** The same whole-surface action for the mobile cards, where the box is a pill. */
function ActionPill({ onClick, label, className, children }) {
  if (!onClick) {
    return <span className={`${className} inline-flex items-center gap-1`}>{children}</span>;
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={label}
      aria-label={label}
      className={`${className} inline-flex items-center gap-1`}
    >
      {children}
    </button>
  );
}

/**
 * What a Follow-up cell shows, in its three states:
 *
 *   assigned + may change    the name, with a pencil
 *   unassigned + may change  "+ Assign followup" — an empty cell is where the
 *                            action belongs, and a pencil beside nothing reads
 *                            as "edit what?"
 *   no grant                 the name, or a dash. Never an affordance that
 *                            cannot be used.
 *
 * Content only: the surrounding ActionCell / ActionPill carries the click.
 */
function FollowupBody({ row, actionable }) {
  const name = row.followup_by_id_name;

  if (!name) {
    if (!actionable) return <span className="text-[#C0CDE0]">—</span>;
    return (
      // No size of its own: it reads at whatever the surrounding cell or pill
      // sets, so the table and the cards stay in step.
      <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-accent">
        <Plus className="h-3 w-3 shrink-0" />
        Assign followup
      </span>
    );
  }

  return (
    <>
      <span className="truncate">{name}</span>
      {actionable && <ActionIcon icon={Pencil} />}
    </>
  );
}

/** The label the Follow-up cell announces, which depends on whether one is set. */
const followupLabel = (row) =>
  row.followup_by_id_name
    ? `Change follow-up for ${row.user_name || 'member'}`
    : `Assign a follow-up for ${row.user_name || 'member'}`;

const transferLabel = (row) => `Transfer ${row.user_name || 'member'} to another Sabha`;
const roleLabel = (row) => `Assign a role to ${row.user_name || 'member'}`;

// The member's photo when they have one, their initial otherwise. The image URL
// is served publicly (no auth header needed for an <img>), and `src` is only set
// for members who actually have a photo — so there is no 404 per photo-less row.
// A missing file still falls back to the initial via `onError`.
function Avatar({ name, src, size = 'h-8 w-8' }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const showImage = Boolean(src) && !failed;
  return (
    <div className={`${size} flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-bold text-white`}>
      {showImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initial
      )}
    </div>
  );
}

// ── Mobile cards ───────────────────────────────────────────────────────────
function MemberCards({ rows, onSelect, canChangeStatus, onStatusToggle, statusBusy, editPath, detailPath, onQuickTransfer, onChangeFollowup, onAssignRole }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.id}
          onClick={() => onSelect?.(row)}
          className={`card p-4 transition-colors ${onSelect ? 'cursor-pointer active:bg-[#F6F9FD]' : ''}`}
        >
          <div className="flex items-start gap-3">
            <Avatar name={row.user_name} src={row.profile_image} size="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                {/* Name links to the profile; the mobile number is a separate
                    tap-to-call link (they can't nest — an <a> inside an <a> is
                    invalid). */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {detailPath ? (
                      <Link
                        to={detailPath(row)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`View ${row.user_name || 'member'}`}
                        className="block min-w-0"
                      >
                        <p className="truncate text-sm font-semibold text-primary">
                          {row.user_name || '—'}
                        </p>
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-semibold text-primary">
                        {row.user_name || '—'}
                      </p>
                    )}
                    <FamilyBadge row={row} />
                  </div>
                  <CallLink mobile={row.contact_number || row.mobile_number} name={row.user_name} />
                </div>
                {editPath && <EditLink to={editPath(row)} name={row.user_name} />}
              </div>

              {/* Each pill is the whole target for its action, the same way each
                  table cell is — the pencil inside it is a hint, not the hit
                  area. */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {row.role_name && (
                  <ActionPill
                    onClick={onAssignRole && (() => onAssignRole(row))}
                    label={roleLabel(row)}
                    className={PILL}
                  >
                    {row.role_name}
                    {onAssignRole && <ActionIcon icon={Pencil} />}
                  </ActionPill>
                )}
                {row.sabha_name && (
                  <ActionPill
                    onClick={onQuickTransfer && (() => onQuickTransfer(row))}
                    label={transferLabel(row)}
                    className={PILL}
                  >
                    {row.sabha_name}
                    {onQuickTransfer && <ActionIcon icon={ArrowLeftRight} />}
                  </ActionPill>
                )}
                {(row.followup_by_id_name || onChangeFollowup) && (
                  <ActionPill
                    onClick={onChangeFollowup && (() => onChangeFollowup(row))}
                    label={followupLabel(row)}
                    className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent"
                  >
                    <FollowupBody row={row} actionable={Boolean(onChangeFollowup)} />
                  </ActionPill>
                )}
              </div>

              {/* Without the grant the card ends at the pills — no divider, no
                  row, nothing standing in for a control that isn't there. */}
              {canChangeStatus && (
                <div className="mt-3 border-t border-[#F0F4F9] pt-3">
                  <StatusSwitch
                    row={row}
                    onToggle={onStatusToggle}
                    busy={statusBusy}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Desktop table ──────────────────────────────────────────────────────────
// Headings only — the columns are not sortable. The list is server-paged in
// 100-record blocks, so a sort has to be a server sort; it is not offered here.
//
// Status is the one conditional column — appended only with
// USERS:BULK_STATUS_UPDATE, so the header count and the cells below it stay in
// step. Both places read `canChangeStatus`; neither may be changed alone.
const COLUMNS = [
  { key: 'user_name', label: 'Name' },
  { key: 'sabha_name', label: 'Sabha' },
  { key: 'followup_by_id_name', label: 'Follow-up' },
  { key: 'role_name', label: 'Role' },
];

const STATUS_COLUMN = { key: 'status', label: 'Status' };

function MemberTable({ rows, onSelect, canChangeStatus, onStatusToggle, statusBusy, editPath, detailPath, onQuickTransfer, onChangeFollowup, onAssignRole }) {
  const columns = canChangeStatus ? [...COLUMNS, STATUS_COLUMN] : COLUMNS;

  return (
    <div className="card overflow-hidden !p-0">
      <div className="overflow-x-auto">
        {/* text-sm, same as the cards — the old text-xs was too small to scan a
            long list at. Cells stay on px-3 py-2.5 so the extra 2px of type
            does not also widen the row; if it still overflows on a narrow
            desktop the wrapper above scrolls. */}
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="table-th px-3 py-2.5">
                  {c.label}
                </th>
              ))}
              {/* Action column: deliberately no visible header — the label exists
                  for screen readers only, so the column still has an accessible
                  name without printing one. */}
              {editPath && (
                <th className="table-th w-px px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelect?.(row)}
                className={`border-t border-[#F0F4F9] transition-colors hover:bg-[#F9FBFD] ${
                  onSelect ? 'cursor-pointer' : ''
                }`}
              >
                {/* Name — the whole cell, avatar included, opens the member. */}
                {detailPath ? (
                  <td className="whitespace-nowrap p-0">
                    <Link
                      to={detailPath(row)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`View ${row.user_name || 'member'}`}
                      className="flex h-full w-full items-center gap-3 px-3 py-2.5"
                    >
                      <Avatar name={row.user_name} src={row.profile_image} />
                      <Identity row={row} />
                    </Link>
                  </td>
                ) : (
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.user_name} src={row.profile_image} />
                      <Identity row={row} />
                    </div>
                  </td>
                )}

                <ActionCell
                  onClick={onQuickTransfer && (() => onQuickTransfer(row))}
                  label={transferLabel(row)}
                  className="text-[#6B7FA3]"
                >
                  <span className="truncate">{row.sabha_name || '—'}</span>
                  {onQuickTransfer && <ActionIcon icon={ArrowLeftRight} />}
                </ActionCell>

                <ActionCell
                  onClick={onChangeFollowup && (() => onChangeFollowup(row))}
                  label={followupLabel(row)}
                  className="text-[#6B7FA3]"
                >
                  <FollowupBody row={row} actionable={Boolean(onChangeFollowup)} />
                </ActionCell>

                <ActionCell
                  onClick={onAssignRole && (() => onAssignRole(row))}
                  label={roleLabel(row)}
                >
                  {row.role_name
                    ? <span className={PILL_SM}>{row.role_name}</span>
                    : <span className="text-[#C0CDE0]">—</span>}
                  {onAssignRole && <ActionIcon icon={Pencil} />}
                </ActionCell>
                {canChangeStatus && (
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <StatusSwitch
                      row={row}
                      onToggle={onStatusToggle}
                      busy={statusBusy}
                      compact
                    />
                  </td>
                )}
                {editPath && (
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <EditLink to={editPath(row)} name={row.user_name} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MemberList({
  rows = [], loading, error, onRetry, onSelect,
  /** A refetch while rows are already on screen — paging or filtering. */
  busy = false,
  /**
   * USERS:BULK_STATUS_UPDATE. Not "may the switch be operated" but "does the
   * Status column exist" — false removes the column and the cards' status row
   * outright, rather than showing a read-only label.
   */
  canChangeStatus = false, onStatusToggle, statusBusy = false,
  /** (row) => path. Omitted entirely when the user lacks the Edit permission. */
  editPath = null,
  /** (row) => path for the member's details page. Without it the name is plain text. */
  detailPath = null,
  /** (row) => void. Omitted without TRANSFER:QUICK_TRANSFER — no icon is rendered. */
  onQuickTransfer = null,
  /** (row) => void. Omitted without the grant — no pencil is rendered. */
  onChangeFollowup = null,
  /** (row) => void. Omitted without USERS:UPDATE — no pencil is rendered. */
  onAssignRole = null,
}) {
  if (loading) {
    return (
      <div className="card space-y-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/4" />
              <Skeleton className="h-2.5 w-1/6" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="card"><ErrorState error={error} onRetry={onRetry} title="Failed to load users" /></div>;
  }

  if (rows.length === 0) {
    return <div className="card"><EmptyState title="No members found" hint="Try clearing the search or filters." /></div>;
  }

  const shared = { rows, onSelect, canChangeStatus, onStatusToggle, statusBusy, editPath, detailPath, onQuickTransfer, onChangeFollowup, onAssignRole };

  return (
    // `busy` is a refetch over rows that are already showing — a page change, a
    // a filter. `loading` above is the first fetch, when there is nothing
    // to cover yet and the skeleton stands in instead.
    <div className="relative">
      {busy && <BusyOverlay />}
      <div className="md:hidden">
        <MemberCards {...shared} />
      </div>
      <div className="hidden md:block">
        <MemberTable {...shared} />
      </div>
    </div>
  );
}

/** Previous / numbered / Next pager, matching the reference's controls. */
export function MemberPager({ page, pageCount, total, onChange, pageSize, onPageSize }) {
  // The size dropdown outlives the page buttons: with 30 members there is one
  // page at 50, and hiding the control would make 50 unreachable.
  if (pageCount <= 1 && !onPageSize) return null;

  const items = [];
  if (pageCount <= 7) {
    for (let i = 1; i <= pageCount; i += 1) items.push(i);
  } else {
    items.push(1);
    if (page > 3) items.push('ellipsis');
    for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i += 1) items.push(i);
    if (page < pageCount - 2) items.push('ellipsis');
    items.push(pageCount);
  }

  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-wrap items-center gap-3">
        <PageSizeSelect value={pageSize} onChange={onPageSize} id="member-page-size" />
        <span className="text-sm text-[#6B7FA3]">
          Page {page} of {pageCount} · {total} match{total === 1 ? '' : 'es'}
        </span>
      </div>
      <div className={`flex flex-wrap items-center gap-1.5 ${pageCount <= 1 ? 'hidden' : ''}`}>
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="btn-outline px-3 py-2 text-sm disabled:opacity-40">
          Previous
        </button>
        {items.map((item, i) =>
          item === 'ellipsis' ? (
            <span key={`e-${i}`} className="select-none px-1.5 text-sm text-[#9AA8C0]">…</span>
          ) : (
            <button
              key={item}
              onClick={() => onChange(item)}
              aria-current={page === item ? 'page' : undefined}
              className={`min-w-[36px] rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors ${
                page === item
                  ? 'bg-primary text-white'
                  : 'border border-[#E2EAF4] text-[#6B7FA3] hover:bg-primary-50 hover:text-primary'
              }`}
            >
              {item}
            </button>
          )
        )}
        <button onClick={() => onChange(page + 1)} disabled={page >= pageCount} className="btn-outline px-3 py-2 text-sm disabled:opacity-40">
          Next
        </button>
      </div>
    </div>
  );
}
