import { useEffect, useMemo, useState } from 'react';
import { usePincodeAddress } from './usePincodeAddress';
import { useToast } from './core';
import {
  useEducationMutations,
  useJobMutations,
  useUserEducations,
  useUserJobs,
} from './useUsers';
import {
  useCategories,
  useEducationLevels,
  useFollowupPersons,
  useJobIndustries,
  useMandalUsers,
  useNaturesOfBusiness,
  useRoles,
} from './useLookups';
import { useSelfSave } from './useProfileExtras';
import {
  SELF_EDIT_TABS,
  buildPayload,
  toFormValues,
  validateTab,
} from '../utils/userFormSchema';
import { selfChanges } from '../utils/selfUpdate';

// Editing your OWN record, so both flags are always on: `editing` keeps the
// create-only rules out of the way, `self` hides every `lockedForSelf` field
// from validation because the form will not let it be touched either.
const SELF_EDIT = { editing: true, self: true };

/**
 * The self-edit form, without a screen around it.
 *
 * Lifted out of UserFormPage so the profile can hold Save and Cancel in its
 * hero while ProfileEditor renders the fields below — the two need the same
 * state, and passing it down beats reaching into the editor with a ref.
 */
export function useProfileForm(userId, user, enabled = true) {
  const toast = useToast();
  // The profile mounts this in read mode too, so every query below is held
  // behind `on` — otherwise opening the profile would fetch the whole form's
  // lookups for a screen that shows none of them.
  const on = Boolean(enabled);

  const [step, setStep] = useState(0);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});

  const tab = SELF_EDIT_TABS[step];

  useEffect(() => {
    if (user) setValues(toFormValues(user));
  }, [user]);

  const educationsQ = useUserEducations(userId, on && Boolean(userId));
  const jobsQ = useUserJobs(userId, on && Boolean(userId));

  const educationMutations = useEducationMutations(userId);
  const jobMutations = useJobMutations(userId);
  const save = useSelfSave(userId);

  const lookups = {
    categories: useCategories(on && tab?.key === 'personal'),
    roles: useRoles(on && tab?.key === 'sabha'),
    mandalUsers: useMandalUsers(on && tab?.key === 'sabha'),
    educationLevels: useEducationLevels(on && tab?.key === 'education'),
    jobIndustries: useJobIndustries(on && tab?.key === 'job'),
    naturesOfBusiness: useNaturesOfBusiness(on && tab?.key === 'job'),
    followupPersons: useFollowupPersons(
      on && tab?.key === 'followup',
      values.sabha_id,
    ),
  };

  const address = usePincodeAddress(
    values,
    setValues,
    on && tab?.key === 'address',
  );

  const change = (name, value) => {
    setValues(v => ({ ...v, [name]: value }));
    setErrors(e => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const goTo = next => {
    const found = validateTab(tab, values, SELF_EDIT);
    // Going back is always allowed; going on is not.
    if (next > step && Object.keys(found).length) {
      setErrors(found);
      toast.warning('Please complete this step before moving on.');
      return;
    }
    setErrors({});
    setStep(next);
  };

  const submit = async () => {
    const found = validateTab(tab, values, SELF_EDIT);
    if (Object.keys(found).length) {
      setErrors(found);
      return false;
    }

    // Only what actually changed is sent — an untouched field would otherwise
    // file an approval request for the value it already holds.
    const original = toFormValues(user);
    const changed = {};
    for (const [name, value] of Object.entries(values)) {
      if (Array.isArray(value)) continue;
      if (String(value ?? '') !== String(original[name] ?? '')) {
        changed[name] = value;
      }
    }

    const { direct, request, unsupported } = selfChanges(changed);
    const directPayload = buildPayload(direct);
    const requestPayload = buildPayload(request);

    if (unsupported.length) {
      toast.warning(
        `${unsupported.length} field${unsupported.length === 1 ? '' : 's'} cannot be changed from here.`,
      );
    }
    if (
      !Object.keys(directPayload).length &&
      !Object.keys(requestPayload).length
    ) {
      toast.info('Nothing to save — no changes were made.');
      // Nothing was written, but nothing is outstanding either, so the caller
      // may still close the editor.
      return true;
    }

    try {
      const res = await save.mutateAsync({
        direct: directPayload,
        request: requestPayload,
      });
      if (Object.keys(directPayload).length) {
        toast.success(res?.applied?.detail || 'Profile updated.');
      }
      if (Object.keys(requestPayload).length) {
        toast.info(
          res?.requested?.detail ||
            'Your changes were sent to your sabha leadership for approval.',
        );
      }
      return true;
    } catch (err) {
      const fieldErrors = err?.fieldErrors ?? null;
      if (fieldErrors) setErrors(fieldErrors);
      toast.error(err?.message || 'Could not save your profile.');
      return false;
    }
  };

  /** True once anything differs from the record — drives the discard prompt. */
  const isDirty = useMemo(() => {
    if (!user) return false;
    const original = toFormValues(user);
    return Object.entries(values).some(
      ([name, value]) =>
        !Array.isArray(value) &&
        String(value ?? '') !== String(original[name] ?? ''),
    );
  }, [values, user]);

  return {
    tab,
    step,
    setStep,
    goTo,
    values,
    errors,
    change,
    submit,
    saving: save.isPending,
    isDirty,
    user,
    userId,
    lookups,
    address,
    collections: { educations: educationsQ, jobs: jobsQ },
    rowMutations: { educations: educationMutations, jobs: jobMutations },
    onError: err => toast.error(err?.message),
  };
}
