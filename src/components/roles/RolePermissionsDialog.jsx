import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Overlays';
import { Button, ErrorState, Skeleton, Toggle } from '../ui';
import { useRoleContext, groupModules, normalizeRoleContext } from '../../hooks/useRoles';

/**
 * Edit Role Permissions — every module, every action, one toggle each.
 *
 * The grid comes from `GET /role-permissions/role/{id}/full-context`, which
 * returns the COMPLETE map for that role: every module and every action it
 * declares, granted or not. Nothing is filtered by what the signed-in user holds
 * — this dialog is about the role being edited, not about the editor.
 *
 * NESTED MODULES ARE DRAWN NESTED. The response is a flat list, but each module
 * carries `parent_module_id`, so Logs, Master Data, User Roles and User
 * Permissions arrive as children of Admin. They used to be drawn as four more
 * cards in the same grid as Users and Pradesh — a dozen equal boxes with nothing
 * saying which of them were one area of the app, which is the confusion this
 * fixes. Now Admin is one box with its members inside it and a switch on its
 * header that turns the whole area on or off.
 *
 * DISPLAY ONLY. The grouping changes nothing about what is sent: `submit` still
 * walks the same flat set of `module:action` keys, and every action still belongs
 * to its own module id. The master switch is shorthand for pressing the switches
 * inside it — it grants and revokes exactly those, and grants nothing of its own.
 *
 * Saving posts to `/sync`, which REPLACES the role's set. Every currently-on
 * toggle is sent, not just the ones changed, because anything omitted is revoked.
 */
/** One action and its switch. `inset` is a row sitting under a sub-heading. */
function ActionRow({ module: m, action: a, granted, onToggle, disabled, inset = false }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2.5 pr-4 ${inset ? 'pl-7' : 'pl-4'}`}>
      <span className="text-sm text-primary">{a.label}</span>
      <Toggle
        checked={Boolean(granted?.has(`${m.id}:${a.id}`))}
        onChange={() => onToggle(m.id, a.id)}
        disabled={disabled}
        tone="accent"
        label={`${m.label} — ${a.label}`}
      />
    </div>
  );
}

/**
 * ONE CARD PER TOP-LEVEL MODULE, whether or not it contains others.
 *
 * Attendance is a header and a list of switches; so is Admin. The only
 * difference is that Admin's list is broken up by sub-headings naming the module
 * each run of switches belongs to — Logs, Master Data, User Roles, Hierarchy.
 *
 * A card inside a card was the obvious way to draw that and the wrong one: it
 * gave the same information a second border, a second background and a second
 * count, so an area of the app read as heavier than a module rather than as a
 * group of them. A sub-heading is a quieter way of saying the same thing, and
 * leaves every switch on one left edge to run the eye down.
 *
 * NO MASTER SWITCH ON THE HEADER, and the header therefore says exactly what
 * every other module's says: a name and a count. A switch there would have been
 * the one control on this dialog that moved others, on the one card where the
 * others may be scrolled past — and a header that reads differently from its
 * neighbours' invites being read as a different KIND of thing.
 *
 * The count spans the WHOLE card, children included. It is the only number on
 * it, and one that covered just the parent's own actions would read as the
 * group's while describing something else.
 */
/** One child module inside a group card: its name, then its switches. */
function ChildBlock({ module: m, granted, onToggle, disabled }) {
  return (
    <>
      <p className="bg-bg/60 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
        {m.label}
      </p>
      <div className="divide-y divide-line-soft">
        {m.actions.length === 0 ? (
          <p className="py-2.5 pl-7 pr-4 text-xs text-text-faint">No actions declared.</p>
        ) : (
          m.actions.map((a) => (
            <ActionRow
              key={a.id}
              module={m}
              action={a}
              granted={granted}
              onToggle={onToggle}
              disabled={disabled}
              inset
            />
          ))
        )}
      </div>
    </>
  );
}

function ModuleCard({ module: m, granted, onToggle, disabled, wide = false }) {
  const children = m.children ?? [];
  const keys = [m, ...children].flatMap((mod) => mod.actions.map((a) => `${mod.id}:${a.id}`));
  const on = keys.filter((k) => granted?.has(k)).length;

  return (
    <div className={`overflow-hidden rounded-card border border-line-soft bg-surface ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line-soft bg-bg px-4 py-2.5">
        <span className="truncate text-sm font-bold text-primary">{m.label}</span>
        <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-text-muted">
          {on}/{keys.length}
        </span>
      </div>

      {keys.length === 0 && <p className="px-4 py-3 text-xs text-text-faint">No actions declared.</p>}

      {/* The module's own actions lead, full width, with no sub-heading: they
          belong to the module the card is already named after. Admin's own READ
          is what opens the section at all, so it is a switch like any other. */}
      <div className="divide-y divide-line-soft">
        {m.actions.map((a) => (
          <ActionRow
            key={a.id}
            module={m}
            action={a}
            granted={granted}
            onToggle={onToggle}
            disabled={disabled}
          />
        ))}
      </div>

      {/* TWO ACROSS, so four children are two rows rather than a column eight
          switches long that the dialog has to be scrolled through.
          `lg:` only — on a phone two columns of switches would be two columns of
          nothing. `items-start` keeps a short cell from stretching its rows to
          match a taller neighbour; the borders draw the grid, since `divide-*`
          does not survive a wrapping grid. */}
      {children.length > 0 && (
        <div className="lg:grid lg:grid-cols-2 lg:items-start">
          {children.map((child, i) => (
            <div
              key={child.id}
              className={`border-t border-line-soft ${i % 2 === 1 ? 'lg:border-l' : ''}`}
            >
              <ChildBlock module={child} granted={granted} onToggle={onToggle} disabled={disabled} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RolePermissionsDialog({ role, isOpen, onClose, onSave, busy, error, canWrite }) {
  const query = useRoleContext(role?.id, isOpen);
  const context = useMemo(() => normalizeRoleContext(query.data), [query.data]);
  /**
   * Groups last, in the API's order otherwise.
   *
   * A group card is full width and several rows tall. Left where Admin happens
   * to fall in the response it would break the two-column run of ordinary
   * modules in half, leaving a gap beside whichever card preceded it; at the end
   * the plain modules tile without interruption and the wide card closes the
   * dialog. `sort` is stable, so nothing else moves.
   */
  const ordered = useMemo(
    () => [...groupModules(context.modules)]
      .sort((a, b) => (a.children.length ? 1 : 0) - (b.children.length ? 1 : 0)),
    [context.modules]
  );

  // Working copy: Set of "moduleId:actionId" that are on.
  const [granted, setGranted] = useState(null);

  // Seeded from the response, and re-seeded whenever a different role's map
  // arrives. Not derived on every render — the user's toggles have to survive
  // re-renders until they save or close.
  useEffect(() => {
    if (!query.data) return;
    const next = new Set();
    for (const m of context.modules) {
      for (const a of m.actions) if (a.granted) next.add(`${m.id}:${a.id}`);
    }
    setGranted(next);
  }, [query.data, context.modules]);

  const toggle = (moduleId, actionId) => {
    setGranted((prev) => {
      const next = new Set(prev);
      const key = `${moduleId}:${actionId}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };


  const submit = () => {
    if (!granted) return;
    // The full granted set, as the endpoint's PermissionItem[].
    const permissions = [...granted].map((key) => {
      const [moduleId, actionId] = key.split(':');
      return { module_id: Number(moduleId), action_id: Number(actionId), is_allowed: true };
    });
    onSave(permissions);
  };

  const totalGranted = granted?.size ?? 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      dismissible={!busy}
      size="2xl"
      title="Edit Role Permissions"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          {canWrite && (
            <Button
              variant="primary"
              onClick={submit}
              busy={busy}
              disabled={!granted || query.isLoading}
            >
              Save Permissions
            </Button>
          )}
        </>
      }
    >
      <div className="border-b border-line-soft pb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Role</p>
        <p className="font-display text-lg font-bold text-primary">{role?.role_name ?? '—'}</p>
        <p className="mt-0.5 text-sm text-text-muted">
          {canWrite
            ? 'Toggle actions to update the role-level defaults.'
            : 'Read-only — your role cannot change these grants.'}
        </p>
      </div>

      {query.isLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-card border border-line-soft p-4">
              <Skeleton className="h-4 w-28" />
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : query.error ? (
        <div className="mt-4">
          <ErrorState error={query.error} onRetry={query.refetch} title="Couldn’t load this role’s permissions" />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {ordered.map((group) => (
              <ModuleCard
                key={group.id}
                module={group}
                granted={granted}
                onToggle={toggle}
                disabled={!canWrite || busy}
                wide={group.children.length > 0}
              />
            ))}
          </div>

          <p className="mt-3 text-xs text-text-muted">
            {totalGranted} action{totalGranted === 1 ? '' : 's'} granted across{' '}
            {context.modules.length} module{context.modules.length === 1 ? '' : 's'}.
          </p>
        </>
      )}

      {error && (
        <p className="mt-3 rounded-control border border-danger-fg/30 bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
          {error}
        </p>
      )}
    </Modal>
  );
}
