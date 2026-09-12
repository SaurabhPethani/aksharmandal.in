import { useState } from 'react';
import { Plus } from 'lucide-react';
import { usePermissions, useToast } from '../hooks';
import { usePradeshList } from '../hooks/useHierarchy';
import { LOCATION_LEVELS, useHierarchyMutations } from '../hooks/useHierarchyAdmin';
import { ACTIONS, MODULES } from '../constants/permissions';
import { Button, EmptyState, PageHeader } from '../components/ui';
import { ConfirmDialog } from '../components/Overlays';
import FormDialog from '../components/FormDialog';
import HierarchyTree, { LEVEL_STYLE } from '../components/hierarchy/HierarchyTree';

/**
 * Hierarchy Management — the Pradesh / Mandal / Sabha tree and its writes.
 *
 * Permissions, which are the whole point of this screen:
 *
 *   HIERARCHY:READ    opens the page and the nav entry, and is what fetches the
 *                     Pradesh list. It grants NO writes.
 *   <LEVEL>:CREATE    shows the button that adds one of that level — "Add Pradesh"
 *                     in the header, "+ Mandal" on a Pradesh row, "+ Sabha" on a
 *                     Mandal row.
 *   <LEVEL>:UPDATE    shows both Edit and Deactivate/Activate on that level's rows.
 *
 * So the three levels are independent: a role may add Sabhas without being able
 * to touch the Pradesh they sit under. Every check is per level — there is no
 * "can write hierarchy" shortcut, because the backend has no such grant either.
 */

const LEVEL_MODULE = {
  pradesh: MODULES.PRADESH,
  mandal: MODULES.MANDAL,
  sabha: MODULES.SABHA,
};

/** Ids a create needs from its parent. Pradesh has no parent, so it sends none. */
function parentIdsFor(level, parent) {
  if (level === 'mandal') return { pradesh_id: parent.id };
  // A Sabha needs both, and they must agree — the backend rejects a mandal_id
  // whose real pradesh_id differs from the one sent. Taking the Pradesh from the
  // parent Mandal's own row rather than from the expanded ancestor guarantees it.
  if (level === 'sabha') return { mandal_id: parent.id, pradesh_id: parent.pradesh_id };
  return {};
}

export default function HierarchyPage({ module }) {
  const { can } = usePermissions();
  const toast = useToast();

  const mayRead = can(MODULES.HIERARCHY, ACTIONS.READ);
  const canReadUsers = can(MODULES.USERS, ACTIONS.READ);

  /**
   * THE ONLY READ THIS PAGE MAKES. Heads, DB Heads, member counts, locations and
   * a Sabha's day all ride on the hierarchy rows themselves — see the note at
   * the top of hooks/useHierarchyAdmin.js for what this replaced.
   *
   * `canReadUsers` no longer gates any of it. It survives for one thing: the
   * "View all" link on a Sabha row, which goes to the members list.
   */
  const pradeshList = usePradeshList(mayRead);
  const { save, setStatus } = useHierarchyMutations();

  // { mode: 'create' | 'edit', level, node?, parent? }
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState('');
  // Sabha only — see LOCATION_LEVELS. Held here rather than per level because
  // the dialog is one component for all three, and it simply is not rendered
  // for the two levels whose schema has no such field.
  const [location, setLocation] = useState('');
  const [formError, setFormError] = useState(null);
  // The row awaiting a status flip: { level, node }.
  const [statusTarget, setStatusTarget] = useState(null);

  const perms = {
    canCreate: (level) => can(LEVEL_MODULE[level], ACTIONS.CREATE),
    canUpdate: (level) => can(LEVEL_MODULE[level], ACTIONS.UPDATE),
    canReadUsers,
  };

  const openCreate = (level, parent = null) => {
    setFormError(null);
    setName('');
    setLocation('');
    setDialog({ mode: 'create', level, parent });
  };

  const openEdit = (level, node) => {
    setFormError(null);
    setName(node[LEVEL_STYLE[level].nameKey] ?? '');
    setLocation(node.location ?? '');
    setDialog({ mode: 'edit', level, node });
  };

  const closeDialog = () => {
    if (save.isPending) return;
    setDialog(null);
    setFormError(null);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError(`Enter a ${LEVEL_STYLE[dialog.level].label} name.`);
      return;
    }
    setFormError(null);

    save.mutate(
      {
        level: dialog.level,
        node: dialog.mode === 'edit' ? dialog.node : null,
        name: trimmed,
        parentIds: dialog.mode === 'create' ? parentIdsFor(dialog.level, dialog.parent ?? {}) : {},
        // Ignored by the mutation for levels whose schema has no `location`.
        location,
      },
      {
        onSuccess: (res) => {
          // The envelope's own `detail` is the backend's wording for what
          // happened — better than a message this screen invents.
          toast.success(res?.detail ?? `${LEVEL_STYLE[dialog.level].label} saved.`);
          setDialog(null);
        },
        onError: (err) => setFormError(err?.message ?? 'Could not save.'),
      }
    );
  };

  const confirmStatus = () => {
    const { level, node } = statusTarget;
    setStatus.mutate(
      { level, node, status: !node.status },
      {
        onSuccess: (res) => {
          toast.success(res?.detail ?? `${LEVEL_STYLE[level].label} updated.`);
          setStatusTarget(null);
        },
        onError: (err) => toast.error(err?.message ?? 'Could not update the status.'),
      }
    );
  };

  if (!mayRead) {
    return (
      <>
        <PageHeader title="Hierarchy Management" />
        <div className="card">
          <EmptyState
            title="No read access"
            hint="Your role does not grant HIERARCHY:READ, which is what lists the hierarchy."
          />
        </div>
      </>
    );
  }

  const handlers = {
    onEdit: openEdit,
    onToggleStatus: (level, node) => setStatusTarget({ level, node }),
    onAddChild: (level, parent) => openCreate(level, parent),
  };

  return (
    <>
      <PageHeader
        title="Hierarchy Management"
        actions={
          // Accent orange, matching every other "create" call-to-action in the
          // app — the Master Data screens' "+ New …" buttons, and ModulePage,
          // which already maps CREATE to the accent variant.
          perms.canCreate('pradesh')
            ? [
                <Button key="add-pradesh" variant="accent" onClick={() => openCreate('pradesh')}>
                  <Plus className="h-4 w-4" />
                  Add Pradesh
                </Button>,
              ]
            : []
        }
      />

      {/* Legend. The three colours are the only thing telling one nesting level
          from another once a tree is deep, so they are named once up front.
          Sized as secondary text (text-xs) like every other label on this page —
          it is a key, not content. */}
      <div className="mb-3 rounded-card border border-line-soft bg-surface px-4 py-2.5 shadow-card">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
          {['pradesh', 'mandal', 'sabha'].map((level) => (
            <span key={level} className="flex items-center gap-2 text-xs font-medium text-text-muted">
              <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_STYLE[level].dot}`} />
              {LEVEL_STYLE[level].label}
            </span>
          ))}
        </div>
      </div>

      <HierarchyTree
        pradeshList={pradeshList}
        perms={perms}
        handlers={handlers}
        busy={save.isPending || setStatus.isPending}
      />

      <FormDialog
        isOpen={Boolean(dialog)}
        onClose={closeDialog}
        title={
          dialog
            ? `${dialog.mode === 'edit' ? 'Edit' : 'Add'} ${LEVEL_STYLE[dialog.level].label}`
            : ''
        }
        description={
          dialog?.mode === 'create' && dialog.parent
            ? `Under ${dialog.parent[LEVEL_STYLE[dialog.level === 'sabha' ? 'mandal' : 'pradesh'].nameKey] ?? 'the selected parent'}`
            : undefined
        }
        submitLabel={dialog?.mode === 'edit' ? 'Save changes' : `Add ${dialog ? LEVEL_STYLE[dialog.level].label : ''}`}
        // An add dialog is opened by an orange control, so its own action is
        // orange too; an edit is a plain save and stays navy. FormDialog
        // documents exactly this split.
        submitVariant={dialog?.mode === 'create' ? 'accent' : 'primary'}
        onSubmit={submit}
        busy={save.isPending}
        error={formError}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="hierarchy-node-name" className="mb-1.5 block text-xs font-semibold text-primary">
              {dialog ? LEVEL_STYLE[dialog.level].label : ''} name
            </label>
            <input
              id="hierarchy-node-name"
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </div>

          {/* All three levels, each of whose create/update schema declares
              `location` — see LOCATION_LEVELS, which is what stops the box being
              offered where the endpoint would accept the value and throw it
              away. Optional at every level: a row with no recorded venue saves
              as it always did, and its name simply appears on the tree without
              one. */}
          {dialog && LOCATION_LEVELS.has(dialog.level) && (
            <div>
              <label htmlFor="hierarchy-node-location" className="mb-1.5 block text-xs font-semibold text-primary">
                Location <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input
                id="hierarchy-node-location"
                className="input-field"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                // A Sabha meets somewhere; a Pradesh or Mandal covers somewhere.
                placeholder={
                  dialog.level === 'sabha'
                    ? 'Where this Sabha meets'
                    : `Where this ${LEVEL_STYLE[dialog.level].label} is`
                }
                autoComplete="off"
              />
            </div>
          )}
          {/* Status is deliberately absent. It is changed from the row's
              Deactivate link instead, so an edit cannot silently switch a branch
              of the tree off. Both are governed by the same <LEVEL>:UPDATE. */}
        </div>
      </FormDialog>

      <ConfirmDialog
        isOpen={Boolean(statusTarget)}
        onClose={() => { if (!setStatus.isPending) setStatusTarget(null); }}
        onConfirm={confirmStatus}
        busy={setStatus.isPending}
        // NOT `destructive`. That flag prints "This action cannot be undone",
        // which is false here: deactivating only flips `status`, and the same
        // link turns it straight back on. The red tone on the confirm button is
        // enough of a warning for a reversible change.
        tone={statusTarget?.node?.status ? 'danger' : 'primary'}
        title={
          statusTarget
            ? `${statusTarget.node.status ? 'Deactivate' : 'Activate'} this ${LEVEL_STYLE[statusTarget.level].label}?`
            : ''
        }
        description={
          statusTarget
            ? `${statusTarget.node[LEVEL_STYLE[statusTarget.level].nameKey] ?? 'This record'} will be marked ${
                statusTarget.node.status ? 'inactive' : 'active'
              }.`
            : ''
        }
        confirmLabel={statusTarget?.node?.status ? 'Deactivate' : 'Activate'}
      />
    </>
  );
}
