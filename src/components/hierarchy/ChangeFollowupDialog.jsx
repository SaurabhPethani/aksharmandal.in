import { useEffect, useMemo, useState } from 'react';
import { User } from 'lucide-react';
import { Modal } from '../Overlays';
import { Button } from '../ui';
import { Combobox, FormField } from '../form';
import { useFollowupPersons, useProfile, useToast, useUpdateFollowup } from '../../hooks';
import { pickRows } from '../../utils/options';

/**
 * Change Follow-up — reassign who follows a member up, from the list.
 *
 * Laid out like the other two row dialogs (Assign Role, Quick Sabha Transfer):
 * a plain title, then a card naming the member and what they have now, then the
 * one field that changes it. The member's name used to be appended to the title,
 * where a long one ran into the close button and left the body with no context
 * of its own.
 *
 * Candidates come from GET /users/get-followup-person-list with NO query
 * parameters: the endpoint applies the caller's own scope, and that is the list
 * to offer.
 *
 * ⚠ On the backend as it stands today that returns a single row (the caller's
 * SuperAdmin) where `?sabha_id=` returns thirteen. If this dropdown looks empty
 * or wrong, the endpoint's unscoped behaviour is the first thing to check — the
 * frontend is passing nothing on purpose.
 *
 * Options are built here rather than through `toOptions` because the rows are
 * thin — `{ id, user_name, sabha_name }`, no mobile number — so the search is
 * offered by name only. A `mobile_number` is still carried into `meta` if the
 * endpoint ever grows one, and the search reads `meta` as well as the label.
 */
export default function ChangeFollowupDialog({ member, onClose }) {
  const toast = useToast();
  const update = useUpdateFollowup();

  const [followupId, setFollowupId] = useState('');
  const [touched, setTouched] = useState(false);

  const isOpen = Boolean(member);

  // Same ['user', id] key the details page uses, so this is usually a cache hit.
  const recordQ = useProfile(member?.id);
  const record = recordQ.data;
  const currentName = record?.followup_by_id_name ?? member?.followup_by_id_name ?? '';
  const currentId = record?.followup_by_id ?? null;

  // No scope argument — the endpoint decides, from the caller's own position.
  const followupQ = useFollowupPersons(isOpen);

  const options = useMemo(
    () =>
      pickRows(followupQ.data)
        .filter((r) => r?.id != null)
        // Neither the member themself nor whoever already has them: one is not a
        // choice, the other is not a change.
        .filter((r) => String(r.id) !== String(member?.id ?? ''))
        .filter((r) => currentId == null || String(r.id) !== String(currentId))
        .map((r) => ({
          value: String(r.id),
          label: r.user_name ?? String(r.id),
          meta: r.mobile_number ?? '',
        })),
    [followupQ.data, member?.id, currentId]
  );

  // Reset per member, so reopening on another row never inherits a selection.
  useEffect(() => {
    setFollowupId('');
    setTouched(false);
  }, [member?.id]);

  const missing = touched && !followupId;
  const busy = update.isPending;
  // The record is read for the member's CURRENT follow-up, not for the
  // candidate list — so the dropdown no longer waits on it.
  const loading = followupQ.isLoading;
  const failed = followupQ.error;

  const close = () => {
    if (busy) return;
    onClose();
  };

  const submit = async () => {
    if (busy) return;
    if (!followupId) {
      setTouched(true);
      return;
    }
    try {
      const res = await update.mutateAsync({
        userId: member.id,
        followupById: followupId,
        // Patches the row in place — no list refetch. See useUserListCache.
        followupName: options.find((o) => o.value === followupId)?.label ?? null,
      });
      toast.success(res?.detail || 'Follow-up updated successfully.');
      onClose();
    } catch (err) {
      // The popup stays open so the selection survives a retry. The message is
      // the backend's own where it sent one — see api/client.js.
      toast.error(err?.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      dismissible={!busy}
      size="md"
      title="Change Follow-up"
      footer={
        <>
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} busy={busy} disabled={!followupId}>
            Update
          </Button>
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
            {/* Says what is being replaced. "Not assigned yet" rather than a
                dash: this dialog is reached for both cases. */}
            <p className="truncate text-sm text-text-muted">
              Current follow-up: {currentName || 'Not assigned yet'}
            </p>
          </div>
        </div>

        <FormField
          label="New Follow-up Person"
          htmlFor="cf-followup"
          required
          error={missing ? 'Please select a follow-up person.' : null}
          hint="Everyone the API offers for your scope." 
        >
          <Combobox
            id="cf-followup"
            // In a dialog the list must grow the body rather than float over it —
            // the modal body scrolls, and a floating list would be clipped by it.
            placement="inline"
            value={followupId}
            onChange={(v) => { setFollowupId(v); setTouched(true); }}
            options={options}
            disabled={busy || loading || Boolean(failed)}
            error={missing}
            placeholder={
              loading
                ? 'Loading…'
                : failed
                  ? 'Follow-up list unavailable'
                  : 'Select a follow-up person'
            }
            // Distinct from the closed control's wording, which names the choice
            // rather than the search.
            searchPlaceholder="Search by name…"
            emptyLabel="No one matches that name."
          />
        </FormField>
      </div>
    </Modal>
  );
}
