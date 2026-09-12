import { useState } from 'react';
import { Check, Layers, Pencil, ShieldCheck, X } from 'lucide-react';
import { Toggle } from '../ui';

/**
 * One role, as a list row.
 *
 * The row RESTS as typography and only becomes a form when you ask it to. An
 * earlier version left the name inputs on screen permanently, which made a list
 * of ten roles read as ten forms — the boxes dominated and the information they
 * held did not. Editing is still in place, with no dialog: pressing Edit swaps
 * this row into inputs and nothing else on the page moves.
 *
 * The left stripe darkens with seniority, so the list reads as a hierarchy top
 * to bottom rather than as ten identical lines.
 *
 * ⚠ Rank is fixed once a role exists. It is the spine of the hierarchy — every
 * "can this role act on that user" check is a rank comparison — so re-numbering
 * a live role silently re-scopes everyone holding it. It is chosen at creation
 * and never edited here; editing covers name and status only.
 *
 * The NUMBER itself is not displayed anywhere, by request — it is an internal
 * figure, and the ordering of the list already says which roles outrank which.
 * The stripe keeps the shading without printing the value.
 *
 * ⚠ READ and WRITE spell the same fields differently:
 *   GET  /role-permissions/roles -> { id, role_name, rank, global, is_active }
 *   POST /role-permissions/roles <- { id, role_name, is_active }
 * Neither `hierarchy_rank` nor `has_global_scope` is sent on an update. The
 * endpoint applies `exclude_unset`, so omitting them preserves whatever the role
 * has — writing a stale value would re-rank the role, or strip SuperAdmin's
 * bypass, during an unrelated rename.
 */

/** Seniority as colour. The whole range stays navy (hue 207 = `primary`). */
export function rankShade(rank, maxRank) {
  const share = maxRank > 0 ? Math.min(Math.max(rank / maxRank, 0), 1) : 0;
  const light = 29 - share * 13;
  return { stripe: { background: `hsl(207 100% ${light}%)` } };
}

const FIELD =
  'w-full rounded-control border border-line-input bg-surface px-2.5 py-1.5 text-sm text-primary ' +
  'shadow-input focus:border-primary/50 focus:outline-none disabled:opacity-60';

const BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50';

/**
 * What the role can reach, as counts.
 *
 * Numbers only — no bar. A proportion of "all actions in the system" is not
 * really a score a role should be measured against, and the two counts say the
 * same thing more precisely in less space.
 */
function Coverage({ summary, totalActions }) {
  if (!summary) return <span className="text-xs text-text-faint">Coverage unavailable</span>;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
      <span>
        <span className="font-semibold text-primary">{summary.actions}</span> of {totalActions} actions
      </span>
      <span className="flex items-center gap-1">
        <Layers className="h-3 w-3" />
        {summary.modules} module{summary.modules === 1 ? '' : 's'}
      </span>
    </span>
  );
}

export default function RoleRow({
  role, maxRank, summary, totalActions, canWrite, busy, onSave, onOpenPermissions,
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.role_name ?? '');
  const [active, setActive] = useState(role.is_active !== false);
  const [error, setError] = useState(null);

  const inactive = role.is_active === false;

  const shade = rankShade(role.rank ?? 0, maxRank);

  const cancel = () => {
    setName(role.role_name ?? '');
    setActive(role.is_active !== false);
    setError(null);
    setEditing(false);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required.'); return; }
    setError(null);
    // `hierarchy_rank` and `has_global_scope` are deliberately absent so the
    // endpoint's exclude_unset leaves them alone — neither is editable here and
    // a stale value would re-rank the role or strip its bypass.
    onSave({ id: role.id, role_name: trimmed, is_active: active });
  };

  return (
    <div className="relative border-b border-line-soft last:border-0">
      {/* Seniority stripe — the list reads as a hierarchy at a glance. */}
      <span className="absolute inset-y-0 left-0 w-1" style={shade.stripe} aria-hidden="true" />

      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 pl-5 pr-4 transition-colors hover:bg-primary-50/40 ${
          inactive && !editing ? 'opacity-60' : ''
        }`}
      >
        {editing ? (
          <>
            <div className="min-w-[10rem] flex-1">
              <input
                className={FIELD}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                autoFocus
                autoComplete="off"
                aria-label={`Name of ${role.role_name}`}
              />
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <span className="text-xs font-semibold text-text-muted">
                {active ? 'Active' : 'Inactive'}
              </span>
              <Toggle
                checked={active}
                onChange={() => setActive((v) => !v)}
                disabled={busy}
                tone="accent"
                label={`${role.role_name} is active`}
              />
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button type="button" onClick={submit} disabled={busy} className={`${BTN} bg-primary text-white hover:bg-primary-hover`}>
                <Check className="h-3.5 w-3.5" />
                Save
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className={`${BTN} border border-line-strong text-primary hover:border-primary`}
                aria-label="Cancel editing"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="min-w-[9rem] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-sm font-bold text-primary">{role.role_name}</p>
                {role.global && (
                  // Worth surfacing: this role bypasses every permission check,
                  // which the grant counts cannot convey.
                  <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[0.7rem] font-semibold text-primary">
                    Full access
                  </span>
                )}
                {inactive && (
                  <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[0.7rem] font-semibold text-danger-fg">
                    Inactive
                  </span>
                )}
              </div>
              <div className="mt-1">
                <Coverage summary={summary} totalActions={totalActions} />
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onOpenPermissions}
                className={`${BTN} border border-line-strong text-primary hover:border-primary hover:bg-primary hover:text-white`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {canWrite ? 'Permissions' : 'View'}
              </button>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className={`${BTN} border border-transparent text-text-muted hover:border-line-strong hover:text-primary`}
                  aria-label={`Edit ${role.role_name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {error && <p className="px-5 pb-2 text-xs font-medium text-danger-fg">{error}</p>}
    </div>
  );
}

/**
 * The "new role" row. Creating is the one act with no row to edit in place, so
 * it borrows the same shape rather than opening the dialog this screen otherwise
 * reserves for permissions.
 */
export function RoleDraftRow({ busy, error, onCreate, onCancel }) {
  const [name, setName] = useState('');
  const [rank, setRank] = useState('');
  const [active, setActive] = useState(true);
  const [localError, setLocalError] = useState(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setLocalError('Name is required.'); return; }
    const rankNum = Number(rank);
    if (!rank.trim() || !Number.isInteger(rankNum)) { setLocalError('Rank must be a whole number.'); return; }
    setLocalError(null);
    onCreate({ role_name: trimmed, hierarchy_rank: rankNum, has_global_scope: false, is_active: active });
  };

  return (
    <div className="relative border-b border-line-soft bg-accent/[0.04]">
      <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true" />

      {/* No leading badge: with the rank chip gone from the saved rows, one here
          would push this row's name input out of line with every name above it.
          The accent stripe and tint already mark it as the draft. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 pl-5 pr-4">
        <div className="min-w-[10rem] flex-1">
          <input
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="Role name"
            autoFocus
            autoComplete="off"
            aria-label="New role name"
          />
        </div>

        <div className="w-20 flex-shrink-0">
          <input
            type="number"
            className={FIELD}
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            disabled={busy}
            placeholder="Rank"
            aria-label="New role rank"
          />
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="text-xs font-semibold text-text-muted">{active ? 'Active' : 'Inactive'}</span>
          <Toggle
            checked={active}
            onChange={() => setActive((v) => !v)}
            disabled={busy}
            tone="accent"
            label="New role is active"
          />
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <button type="button" onClick={submit} disabled={busy} className={`${BTN} bg-accent text-white hover:bg-accent-hover`}>
            <Check className="h-3.5 w-3.5" />
            Create
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`${BTN} border border-line-strong text-primary hover:border-primary`}
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {(localError || error) && (
        <p className="px-5 pb-2 text-xs font-medium text-danger-fg">{localError ?? error}</p>
      )}
    </div>
  );
}
