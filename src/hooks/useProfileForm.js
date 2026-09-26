import { useEffect, useMemo, useState } from 'react';
import { useToast } from './core';
import {
  useEducationMutations,
  useJobMutations,
  useUserEducations,
  useUserJobs,
} from './useUsers';
import {
  useAddressByPincode,
  useCategories,
  useEducationLevels,
  useFollowupPersons,
  useJobIndustries,
  useMandalUsers,
  useNaturesOfBusiness,
  useRoles,
} from './useLookups';
import { useSelfSave } from './useProfileExtras';
import { readAddress, toAddressRows } from '../components/user-form/shared';
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
  const [areaIndex, setAreaIndex] = useState(null);

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

  const addressQ = useAddressByPincode(
    values.pincode,
    on && tab?.key === 'address',
  );
  const addressRows = useMemo(
    () => toAddressRows(addressQ.data),
    [addressQ.data],
  );

  /**
   * Which area the member picked, as an index into `addressRows`.
   *
   * A new lookup resets it — an index into the previous PIN code's areas means
   * nothing under this one, and left alone it would silently apply. Except when
   * the form already holds an area the new rows contain: that is a saved
   * member's own address arriving back, and clearing it would make the form
   * demand a re-pick of something the record already has.
   *
   * A sole area is the other exception: a one-option choice is not a choice, so
   * it is selected on arrival and the dropdown simply shows it.
   */
  useEffect(() => {
    if (!addressRows.length) {
      setAreaIndex(null);
      return;
    }
    const current = String(values.area ?? '').trim();
    const saved = current
      ? addressRows.findIndex(r => readAddress(r).area.trim() === current)
      : -1;
    setAreaIndex(saved >= 0 ? saved : addressRows.length === 1 ? 0 : null);
    // Read at the moment the rows land, before the mirrors effect below has
    // run — depending on `values.area` would re-run this as that effect writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressRows]);

  /**
   * The five mirrors follow the lookup — but only once one has actually
   * happened. Without the guard, the disabled query's empty result would clear
   * the address the record just prefilled, on a step nobody has opened.
   *
   * City / State / Country are identical across a code's areas, so they fill as
   * soon as it resolves. Area AND SUBURB wait for the pick: one PIN code can
   * cover several suburbs, so until an area is chosen there is no single suburb
   * to show, and taking the first row's would quietly display the wrong one.
   */
  useEffect(() => {
    if (!addressQ.isFetched) return;
    // A lookup that FAILED says nothing about the address, so the record's own
    // is left alone. Without this a 404 blanked all five on screen, and saving
    // from another tab would then have filed that blank as the member's
    // address.
    if (addressQ.error) return;
    const first = addressRows[0];
    const picked = areaIndex == null ? null : addressRows[areaIndex];
    setValues(v => {
      if (!first) {
        return { ...v, area: '', suburb: '', city: '', state: '', country: '' };
      }
      const { city, state, country } = readAddress(first);
      const pickedAddress = picked ? readAddress(picked) : null;
      return {
        ...v,
        city,
        state,
        country,
        area: pickedAddress ? pickedAddress.area : '',
        suburb: pickedAddress ? pickedAddress.suburb : '',
      };
    });
  }, [addressRows, areaIndex, addressQ.isFetched, addressQ.error]);

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
    address: { query: addressQ, rows: addressRows, areaIndex, setAreaIndex },
    collections: { educations: educationsQ, jobs: jobsQ },
    rowMutations: { educations: educationMutations, jobs: jobMutations },
    onError: err => toast.error(err?.message),
  };
}
