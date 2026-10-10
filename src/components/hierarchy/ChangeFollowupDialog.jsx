import React, { useEffect, useMemo, useState } from 'react';
import FormDialog from '../FormDialog';
import { Combobox, FormField } from '../form';
import MemberBanner from './MemberBanner';
import { useToast } from '../../hooks/core';
import { useFollowupPersons } from '../../hooks/useLookups';
import { useProfile, useUpdateFollowup } from '../../hooks/useUsers';
import { pickRows } from '../../utils/options';

/**
 * Hands a member to a different follow-up person —
 * `PATCH /users/update-pending-followup/{id}`.
 */
export default function ChangeFollowupDialog({ member, onClose }) {
  const toast = useToast();
  const update = useUpdateFollowup();
  const [followupId, setFollowupId] = useState('');
  const [touched, setTouched] = useState(false);

  const isOpen = Boolean(member);
  // A list row names the follow-up person but carries no id for them.
  const record = useProfile(member?.id).data;
  const currentName =
    record?.followup_by_id_name ?? member?.followup_by_id_name ?? '';
  const currentId = record?.followup_by_id ?? null;

  const personsQ = useFollowupPersons(isOpen);
  // Everyone offered, less the member and whoever follows them up already.
  const options = useMemo(
    () =>
      pickRows(personsQ.data)
        .filter(person => person?.id != null)
        .filter(person => String(person.id) !== String(member?.id ?? ''))
        .filter(
          person => currentId == null || String(person.id) !== String(currentId),
        )
        .map(person => ({
          value: String(person.id),
          label: person.user_name ?? String(person.id),
          meta: person.mobile_number ?? '',
        })),
    [personsQ.data, member?.id, currentId],
  );

  useEffect(() => {
    setFollowupId('');
    setTouched(false);
  }, [member?.id]);

  const busy = update.isPending;
  const loading = personsQ.isLoading;
  const failed = Boolean(personsQ.error);
  const missing = touched && !followupId;

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
        followupName:
          options.find(option => option.value === followupId)?.label ?? null,
      });
      toast.success(res?.detail || 'Follow-up updated successfully.');
      onClose();
    } catch (err) {
      // Stays open, so the choice can be retried.
      toast.error(err?.message);
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Change Follow-up"
      submitLabel="Update"
      onSubmit={submit}
      submitDisabled={!followupId}
      busy={busy}
    >
      <MemberBanner
        name={member?.user_name}
        meta={`Current follow-up: ${currentName || 'Not assigned yet'}`}
      />

      <FormField
        label="New Follow-up Person"
        required
        error={missing ? 'Please select a follow-up person.' : null}
        hint="Everyone the API offers for your scope."
      >
        <Combobox
          label="New Follow-up Person"
          value={followupId}
          onChange={next => {
            setFollowupId(next);
            setTouched(true);
          }}
          options={options}
          disabled={busy || loading || failed}
          error={missing}
          placeholder={
            loading
              ? 'Loading…'
              : failed
                ? 'Follow-up list unavailable'
                : 'Select a follow-up person'
          }
          emptyLabel="No one matches that name."
        />
      </FormField>
    </FormDialog>
  );
}
