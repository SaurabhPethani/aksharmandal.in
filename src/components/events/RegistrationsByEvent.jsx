import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Registrations grouped by the event they belong to.
 *
 * A flat table repeated the event title on every row, so twenty registrations
 * across three events read as twenty unrelated lines. The question this tab
 * answers is "who did I put down for what", and that is an event-shaped
 * question — so the event is the heading and the members sit under it.
 *
 * Groups are collapsible, and the confirmed / denied split is counted per group
 * because that is the number someone actually chases.
 */

/** One registrant's answer to one field, as display text ('—' when unanswered). */
function answerText(answers, field) {
  const v = (answers ?? {})[field.id];
  if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return '—';
  return Array.isArray(v) ? v.join(', ') : String(v);
}

/** Group rows by event, keeping the order the API returned them in. */
function groupByEvent(rows) {
  const groups = new Map();
  for (const row of rows) {
    // Fall back to the id so a registration whose event title is missing still
    // groups with its siblings rather than forming a group called "undefined".
    const key = row.event_id ?? row.event_title ?? 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: row.event_title || (row.event_id ? `Event #${row.event_id}` : 'Unknown event'),
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}

function StatusPill({ confirmed }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        confirmed ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'
      }`}
    >
      {confirmed ? 'Confirmed' : 'Denied'}
    </span>
  );
}

function EventGroup({ group, canEdit, busy, onEdit, onCancel, onRestore }) {
  const [open, setOpen] = useState(true);

  const confirmed = group.rows.filter((r) => r.status).length;
  const denied = group.rows.length - confirmed;

  // The event's poll fields, taken from any row (every row of a group shares the
  // same event). Drives an extra column each in the table and a line each on the
  // phone card.
  const fields = group.rows.find((r) => r.event_custom_fields?.length)?.event_custom_fields ?? [];

  return (
    <div className="overflow-hidden rounded-card border border-line-soft bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // WRAPS BELOW `sm`. The title and three count pills competed for one
        // row, and `truncate` resolved it by giving the title whatever was
        // left — "Shibir 2026 — Dahisar" rendered as "S…", which identifies
        // nothing. The pills take a full line of their own on a phone
        // (`w-full`) so the title gets the first line to itself, and sit back
        // inline from `sm` up where there is room for both.
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft bg-bg px-4 py-3 text-left transition-colors hover:bg-primary-50/40"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />
        )}
        <CalendarDays className="h-4 w-4 flex-shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-display text-sm font-bold text-primary">
          {group.title}
        </span>
        <span className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 text-xs sm:w-auto">
          <span className="rounded-full bg-surface px-2 py-0.5 font-semibold text-text-muted">
            {group.rows.length} registered
          </span>
          {confirmed > 0 && (
            <span className="rounded-full bg-success-bg px-2 py-0.5 font-semibold text-success-fg">
              {confirmed} confirmed
            </span>
          )}
          {/* Only shown when there are any — a permanent "0 denied" is noise on
              the common case where everything went through. */}
          {denied > 0 && (
            <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger-fg">
              {denied} denied
            </span>
          )}
        </span>
      </button>

      {/* TWO RENDERINGS OF THE SAME ROWS, one per width — the pattern
          `MemberList` already uses, and the same breakpoint (`md`).

          The table has six columns, and on a phone that meant 34% of it sat off
          the right edge inside an `overflow-x-auto`. What fell off was the last
          column: Edit and Cancel — the two things somebody opens this tab to
          do. A horizontal scrollbar is a poor way to reach the only actions on
          screen, and on a touch device it competes with the vertical scroll
          that moves the list itself.

          So below `md` each registration becomes a card: the name and its
          status on one line, the details beneath, and the actions as full-width
          targets that cannot go off-screen. Above `md` the table is untouched —
          it is the better shape once the width is there, because it lets a
          reader compare down a column. */}
      {open && (
        <ul className="space-y-2 p-3 md:hidden">
          {group.rows.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-line-soft bg-bg/50 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-primary">
                  {r.user_name}
                </p>
                {/* Beside the name, not below it: status is the first thing
                    scanned down a list of registrations. `shrink-0` so a long
                    name wraps rather than squeezing the pill. */}
                <span className="shrink-0"><StatusPill confirmed={Boolean(r.status)} /></span>
              </div>

              {/* Mobile, gender and age on ONE line. They are three short values
                  that never need comparing against each other — as three
                  labelled rows they cost triple the height and read as a form.
                  Missing ones drop out instead of printing "—", which is what a
                  table has to do to keep its columns aligned and a card does
                  not. */}
              <p className="mt-1 truncate text-xs text-text-muted">
                {[r.mobile_number, r.gender, r.age != null ? `${r.age} yrs` : null]
                  .filter(Boolean)
                  .join('  ·  ') || 'No details on record'}
              </p>

              {fields.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  {fields.map((f) => (
                    <span key={f.id} className="text-text-muted">
                      <span className="font-semibold text-primary">{f.label}:</span>{' '}
                      {answerText(r.custom_answers, f)}
                    </span>
                  ))}
                </div>
              )}

              {canEdit && (
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(r)}
                    disabled={busy}
                    className="flex-1 rounded-control border border-line-strong bg-surface py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary-50 disabled:opacity-50"
                  >
                    Edit
                  </button>
                  {/* A DENIED row gets the opposite action. Cancelling is a
                      status flip rather than a delete, and the register endpoint
                      refuses an existing (event, mobile) pair whatever its
                      status — so without this the row is a dead end and the
                      member can never rejoin the event. */}
                  {!r.status && (
                    <button
                      type="button"
                      onClick={() => onRestore(r)}
                      disabled={busy}
                      className="flex-1 rounded-control border border-success-fg/30 bg-surface py-2 text-xs font-semibold text-success-fg transition-colors hover:bg-success-bg disabled:opacity-50"
                    >
                      Register again
                    </button>
                  )}
                  {/* Only offered while the registration still stands.
                      `Boolean(...)`, not a bare `r.status`: coerced the same way
                      StatusPill does, so a 0/1 field could never render a stray
                      "0" here. */}
                  {Boolean(r.status) && (
                    <button
                      type="button"
                      onClick={() => onCancel(r)}
                      disabled={busy}
                      className="flex-1 rounded-control border border-danger-fg/30 bg-surface py-2 text-xs font-semibold text-danger-fg transition-colors hover:bg-danger-bg disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                {['Member', 'Mobile', 'Gender', 'Age'].map((h) => (
                  <th key={h} className="table-th px-4 py-2.5">{h}</th>
                ))}
                {/* One column per poll field, between the fixed details and status. */}
                {fields.map((f) => (
                  <th key={f.id} className="table-th px-4 py-2.5">{f.label}</th>
                ))}
                <th className="table-th px-4 py-2.5">Status</th>
                {canEdit && <th className="table-th px-4 py-2.5 !text-right"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r) => (
                <tr key={r.id} className="border-b border-line-soft last:border-0">
                  <td className="px-4 py-3 text-sm font-semibold text-primary">{r.user_name}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">{r.mobile_number}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">{r.gender ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">{r.age ?? '—'}</td>
                  {fields.map((f) => (
                    <td key={f.id} className="px-4 py-3 text-sm text-text-muted">{answerText(r.custom_answers, f)}</td>
                  ))}
                  <td className="px-4 py-3"><StatusPill confirmed={Boolean(r.status)} /></td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-4">
                        <button
                          type="button"
                          onClick={() => onEdit(r)}
                          disabled={busy}
                          className="text-xs font-semibold text-primary transition-colors hover:text-primary-hover disabled:opacity-50"
                        >
                          Edit
                        </button>
                        {/* The denied row's way back — see the card above. */}
                        {!r.status && (
                          <button
                            type="button"
                            onClick={() => onRestore(r)}
                            disabled={busy}
                            className="text-xs font-semibold text-success-fg transition-colors hover:underline disabled:opacity-50"
                          >
                            Register again
                          </button>
                        )}
                        {/* Only offered while the registration still stands —
                            cancelling an already-denied one changes nothing. */}
                        {Boolean(r.status) && (
                          <button
                            type="button"
                            onClick={() => onCancel(r)}
                            disabled={busy}
                            className="text-xs font-semibold text-danger-fg transition-colors hover:underline disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RegistrationsByEvent({ rows, canEdit, busy, onEdit, onCancel, onRestore }) {
  const groups = useMemo(() => groupByEvent(rows), [rows]);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <EventGroup
          key={group.key}
          group={group}
          canEdit={canEdit}
          busy={busy}
          onEdit={onEdit}
          onCancel={onCancel}
          onRestore={onRestore}
        />
      ))}
    </div>
  );
}
