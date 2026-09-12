import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, User } from 'lucide-react';
import { Modal } from '../Overlays';
import { Button, ErrorState, Skeleton } from '../ui';
import { useAssignableRoles, useToast, useUpdateRole } from '../../hooks';
import { pickRows } from '../../utils/options';

/**
 * Assign Role — move a member to one of the roles the backend says they may hold.
 *
 * Nothing about roles is known here: names and ordering both come from
 * GET /role-permissions/user/{id}/assignable-roles and are rendered in the order
 * returned. The list is already narrowed server-side to what the caller may
 * grant, so this does no filtering of its own.
 *
 * Rank is deliberately NOT shown — the number is an internal hierarchy figure,
 * not something a person picking a role needs to read. The ordering the backend
 * returns already carries the seniority.
 */

/** Every spelling the row might use, so an unfamiliar shape still renders. */
const readRole = (row) => ({
  id: row?.id ?? row?.role_id ?? null,
  name: row?.role_name ?? row?.display_name ?? row?.name ?? '',
});

export default function AssignRoleDialog({ member, onClose }) {
  const toast = useToast();
  const update = useUpdateRole();

  const [roleId, setRoleId] = useState('');
  const [touched, setTouched] = useState(false);

  const isOpen = Boolean(member);
  const rolesQ = useAssignableRoles(member?.id, isOpen);

  const roles = useMemo(
    () => pickRows(rolesQ.data).map(readRole).filter((r) => r.id != null),
    [rolesQ.data]
  );

  // Reset per member, then pre-select their current role once the list names it.
  // Matched on name because the list row carries `role_name`, not a role id.
  //
  // Seeded ONCE per member rather than whenever `roles` changes identity: a
  // refetch of assignableRoles produces a new array, and re-running this would
  // throw away a selection the user had already made with the dialog open.
  const seededFor = useRef(null);
  useEffect(() => {
    if (!isOpen) { seededFor.current = null; return; }
    if (seededFor.current === member?.id) return;
    if (!roles.length) return; // wait for the list before deciding

    seededFor.current = member?.id;
    setTouched(false);
    const current = roles.find((r) => r.name && r.name === member?.role_name);
    setRoleId(current ? String(current.id) : '');
  }, [isOpen, member?.id, member?.role_name, roles]);

  const busy = update.isPending;
  const missing = touched && !roleId;

  const close = () => {
    if (busy) return;
    onClose();
  };

  const submit = async () => {
    if (busy) return;
    if (!roleId) {
      setTouched(true);
      return;
    }
    try {
      const res = await update.mutateAsync({
        userId: member.id,
        roleId,
        // Patches the row in place — no list refetch. See useUserListCache.
        roleName: roles.find((r) => String(r.id) === String(roleId))?.name ?? null,
      });
      toast.success(res?.detail || 'Role updated successfully.');
      onClose();
    } catch (err) {
      // The popup stays open so the selection survives a retry.
      toast.error(err?.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      dismissible={!busy}
      size="md"
      title="Assign Role"
      footer={
        <>
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} busy={busy} disabled={!roleId}>Update</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-control bg-primary-50 px-4 py-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-white">
            <User className="h-6 w-6" fill="currentColor" strokeWidth={0} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-primary">{member?.user_name || '—'}</p>
            <p className="truncate text-sm text-text-muted">Current role: {member?.role_name || '—'}</p>
          </div>
        </div>

        <div>
          <p className="eyebrow mb-2">Select new role</p>

          {rolesQ.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : rolesQ.error ? (
            <ErrorState error={rolesQ.error} onRetry={rolesQ.refetch} title="Could not load roles" />
          ) : roles.length === 0 ? (
            <p className="rounded-control border border-dashed border-line-strong px-4 py-6 text-center text-sm text-text-muted">
              There are no roles you can assign to this member.
            </p>
          ) : (
            // radiogroup, not a list of buttons: choosing one deselects the rest,
            // and that is what the role tells assistive tech too.
            <div role="radiogroup" aria-label="Select new role" className="space-y-2">
              {roles.map((role) => {
                const selected = String(role.id) === String(roleId);
                return (
                  <button
                    key={role.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    onClick={() => { setRoleId(String(role.id)); setTouched(true); }}
                    className={`flex w-full items-center justify-between gap-3 rounded-control border px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'border-accent bg-primary-50 shadow-[0_0_0_1px_rgba(255,134,42,0.35)]'
                        : 'border-line-soft bg-surface hover:bg-primary-50'
                    } ${busy ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-primary">{role.name}</span>
                    </span>
                    <ChevronRight className={`h-4 w-4 shrink-0 ${selected ? 'text-accent' : 'text-[#C0CDE0]'}`} />
                  </button>
                );
              })}
            </div>
          )}

          {missing && <p className="mt-2 text-xs font-medium text-danger-fg">Please select a role.</p>}
        </div>
      </div>
    </Modal>
  );
}
