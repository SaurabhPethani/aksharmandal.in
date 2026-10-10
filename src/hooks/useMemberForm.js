import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useToast } from './core';
import {
  useAssignableRoles,
  useCreateChild,
  useCreateUser,
  useEducationMutations,
  useFamilyMutations,
  useJobMutations,
  useProfile,
  useUpdateRole,
  useUpdateUser,
  useUserEducations,
  useUserFamily,
  useUserJobs,
} from './useUsers';
import {
  useCategories,
  useEducationLevels,
  useFollowupPersons,
  useJobIndustries,
  useMandalUsers,
  useMe,
  useMobileCheck,
  useNaturesOfBusiness,
  useRelations,
} from './useLookups';
import {
  useMandals,
  useMyGroupLeaderships,
  usePradeshList,
  useSabhas,
} from './useHierarchy';
import { usePincodeAddress } from './usePincodeAddress';
import { applyOwnPlacement } from '../components/user-form/shared';
import {
  COLLECTION_KEYS,
  HIERARCHY_FIELDS,
  TABS,
  buildPayload,
  firstInvalidTab,
  stepProgress,
  tabIndexOfField,
  toFormValues,
  validateAll,
  validateTab,
} from '../utils/userFormSchema';
import {
  isMobileTaken,
  mobileTakenLabel,
  mobileTakenUser,
  pickRows,
} from '../utils/options';
import { humanize } from '../utils/format';
import { ACTIONS, MODULES, USER_EDIT_ACTION } from '../constants/permissions';

const stepOf = key => TABS.findIndex(t => t.key === key);
const STEP = {
  personal: stepOf('personal'),
  sabha: stepOf('sabha'),
  address: stepOf('address'),
  followup: stepOf('followup'),
  education: stepOf('education'),
  job: stepOf('job'),
};
const LAST_REQUIRED = TABS.reduce((last, t, i) => (t.required ? i : last), -1);

const NO_FLAGS = {
  is_ambrish: false,
  is_nimit_sevak: false,
  is_swayam_sevak: false,
  doing_pooja: false,
};

const same = (a, b) => String(a ?? '') === String(b ?? '');

/**
 * The add-member and edit-member form, without a screen around it.
 *
 * `userId` is the member being edited; without one the form creates. A number
 * that already belongs to someone turns the create into registering a family
 * member under them, once a relation is chosen.
 */
export function useMemberForm({ userId = null, can }) {
  const toast = useToast();
  const { activeUserId } = useAuth();

  const editing = Boolean(userId);
  // Set when Add creates the member but stays on the form.
  const [createdId, setCreatedId] = useState(null);
  const memberId = userId ?? createdId;
  const exists = Boolean(memberId);

  const createUser = useCreateUser();
  const createChild = useCreateChild();
  const updateUser = useUpdateUser(memberId);
  const updateRole = useUpdateRole();

  const [asFamily, setAsFamily] = useState(false);
  const [parentId, setParentId] = useState('');
  const [relationId, setRelationId] = useState('');
  const saving = exists
    ? updateUser.isPending || updateRole.isPending
    : asFamily
      ? createChild.isPending
      : createUser.isPending;

  const [values, setValues] = useState(NO_FLAGS);
  const [errors, setErrors] = useState({});
  const [step, setStepState] = useState(0);
  const [pageError, setPageError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const latest = useRef(values);
  latest.current = values;

  const recordQ = useProfile(editing ? userId : null);
  const record = recordQ.data;
  const loaded = useRef(null);
  const savedRole = useRef(null);
  useEffect(() => {
    if (!record || loaded.current === record) return;
    loaded.current = record;
    savedRole.current = record.role_id ?? null;
    setValues(toFormValues(record));
  }, [record]);

  // A family member takes the address and placement of the number's owner,
  // wherever the form has none of its own yet.
  const parentQ = useProfile(asFamily && parentId ? parentId : null);
  const parent = parentQ.data;
  useEffect(() => {
    if (!asFamily || !parent) return;
    setValues(v => ({
      ...v,
      flat_no: v.flat_no ?? parent.flat_no ?? '',
      building_name: v.building_name ?? parent.building_name ?? '',
      street_name: v.street_name ?? parent.street_name ?? '',
      landmark: v.landmark ?? parent.landmark ?? '',
      area: v.area || parent.area || '',
      suburb: v.suburb || parent.suburb || '',
      pincode: v.pincode || parent.pincode || '',
      city: v.city || parent.city || '',
      state: v.state || parent.state || '',
      country: v.country || parent.country || '',
      pradesh_id: v.pradesh_id || parent.pradesh_id || '',
      mandal_id: v.mandal_id || parent.mandal_id || '',
      sabha_id: v.sabha_id || parent.sabha_id || '',
    }));
  }, [asFamily, parent]);

  // The roster links members that exist, so it waits on the Members · Update
  // grant and is no part of registering a family member.
  const showFamily = !asFamily && can(MODULES.USERS, USER_EDIT_ACTION);
  const tabs = useMemo(
    () => TABS.filter(t => t.key !== 'family' || showFamily),
    [showFamily],
  );
  const tab = TABS[step];
  const lastStep = TABS.indexOf(tabs[tabs.length - 1]);

  // Each level is a list only with that level's READ grant; the head of a
  // Sabha group places a new member in any Sabha of the group.
  const leaderships = useMyGroupLeaderships(!editing);
  const leadsSabhaGroup = (leaderships.data || []).some(
    l => l?.level === 'sabha',
  );
  const access = useMemo(() => {
    const granted = Object.fromEntries(
      HIERARCHY_FIELDS.map(l => [l.module, can(l.module, ACTIONS.READ)]),
    );
    if (!editing && leadsSabhaGroup) granted.SABHA = true;
    return granted;
  }, [can, editing, leadsSabhaGroup]);
  const lockedLevels = HIERARCHY_FIELDS.filter(l => !access[l.module]).map(
    l => l.name,
  );

  const meQ = useMe(lockedLevels.length > 0 && !editing);
  const me = meQ.data;
  const hierarchyQueries = {
    pradesh_id: usePradeshList(access.PRADESH && !editing),
    mandal_id: useMandals(
      values.pradesh_id,
      !editing && access.MANDAL && Boolean(values.pradesh_id),
    ),
    sabha_id: useSabhas(
      values.mandal_id,
      !editing && access.SABHA && Boolean(values.mandal_id),
    ),
  };
  useEffect(() => {
    if (!me || editing) return;
    setValues(v => applyOwnPlacement(v, me, access));
  }, [me, editing, access]);

  const rolesQ = useAssignableRoles(
    editing ? memberId : activeUserId,
    step === STEP.sabha,
  );
  const roleNameOf = id => {
    const role = pickRows(rolesQ.data).find(
      r => String(r?.id ?? r?.role_id) === String(id),
    );
    return role?.role_name ?? role?.name ?? role?.display_name ?? undefined;
  };

  // Only the categories a member of the chosen gender may hold; one picked
  // under the other gender is dropped when the gender changes.
  const categoriesQ = useCategories(step === STEP.personal);
  const gender = String(values.gender ?? '')
    .trim()
    .toLowerCase();
  const categories = gender
    ? {
        ...categoriesQ,
        data: pickRows(categoriesQ.data).filter(
          c => !c?.gender || String(c.gender).toLowerCase() === gender,
        ),
      }
    : categoriesQ;
  const lastGender = useRef(null);
  useEffect(() => {
    const before = lastGender.current;
    lastGender.current = gender;
    if (before === null || before === gender || !gender) return;
    if (!values.category_id) return;
    const picked = pickRows(categoriesQ.data).find(
      c => String(c?.id) === String(values.category_id),
    );
    if (picked?.gender && String(picked.gender).toLowerCase() !== gender) {
      setValues(v => ({ ...v, category_id: '' }));
    }
  }, [gender, values.category_id, categoriesQ.data]);

  const lookups = {
    categories,
    roles: rolesQ,
    mandalUsers: useMandalUsers(step === STEP.sabha),
    followupPersons: useFollowupPersons(
      step === STEP.followup && Boolean(values.sabha_id),
      values.sabha_id,
    ),
    educationLevels: useEducationLevels(step === STEP.education),
    jobIndustries: useJobIndustries(step === STEP.job),
    naturesOfBusiness: useNaturesOfBusiness(step === STEP.job),
    relations: useRelations(tab.key === 'family' || !editing),
  };

  const collections = {
    educations: useUserEducations(memberId, exists && tab.key === 'education'),
    jobs: useUserJobs(memberId, exists && tab.key === 'job'),
  };
  const familyQ = useUserFamily(memberId, exists && tab.key === 'family');
  const educationMutations = useEducationMutations(memberId);
  const jobMutations = useJobMutations(memberId);
  const familyMutations = useFamilyMutations(memberId);

  /** Rows of a member that exists are written one by one; a new one's are held. */
  const persistFor = collection => {
    if (!exists) return null;
    const mutations =
      collection === 'educations'
        ? educationMutations
        : collection === 'jobs'
          ? jobMutations
          : null;
    if (!mutations) return null;
    return {
      create: payload => mutations.create.mutateAsync(payload),
      update: (id, payload) => mutations.update.mutateAsync({ id, payload }),
      remove: id => mutations.remove.mutateAsync(id),
      busy: mutations.isPending,
    };
  };

  // The number is checked as it is typed, unless it is the member's own.
  const numberChanged =
    !editing || !same(values.mobile_number, record?.mobile_number);
  const mobileQ = useMobileCheck(
    !asFamily && numberChanged ? values.mobile_number : '',
  );
  const mobileTaken = !asFamily && numberChanged && isMobileTaken(mobileQ.data);
  const mobileMessage = mobileTaken ? mobileTakenLabel(mobileQ.data) : null;
  const owner = mobileTaken ? mobileTakenUser(mobileQ.data) : null;
  const [declinedNumber, setDeclinedNumber] = useState('');
  const offerFamily = Boolean(
    !exists &&
      owner?.id &&
      values.mobile_number &&
      values.mobile_number !== declinedNumber,
  );

  const acceptFamily = () => {
    if (!owner?.id || !relationId) return;
    setParentId(String(owner.id));
    setAsFamily(true);
  };
  const declineFamily = () => {
    setDeclinedNumber(values.mobile_number);
    setRelationId('');
  };

  const address = usePincodeAddress(values, setValues, step === STEP.address);

  const flags = { editing, self: false, child: asFamily };

  const change = (name, value) => {
    if (!same(latest.current[name], value)) setDirty(true);
    setValues(v => ({ ...v, [name]: value }));
    setErrors(e => (e[name] ? { ...e, [name]: undefined } : e));
  };

  /** Picking a level clears the ones under it. */
  const changeLevel = (name, value) => {
    const at = HIERARCHY_FIELDS.findIndex(l => l.name === name);
    setDirty(true);
    setValues(v => {
      const next = { ...v, [name]: value };
      for (const lower of HIERARCHY_FIELDS.slice(at + 1)) next[lower.name] = '';
      return applyOwnPlacement(next, me, access);
    });
    setErrors(e => ({ ...e, [name]: undefined }));
  };

  const addItem = (collection, item) => {
    setDirty(true);
    setValues(v => ({ ...v, [collection]: [...(v[collection] ?? []), item] }));
  };
  const updateItem = (collection, index, item) => {
    setDirty(true);
    setValues(v => ({
      ...v,
      [collection]: (v[collection] ?? []).map((row, i) =>
        i === index ? item : row,
      ),
    }));
  };
  const removeItem = (collection, index) => {
    setDirty(true);
    setValues(v => ({
      ...v,
      [collection]: (v[collection] ?? []).filter((_, i) => i !== index),
    }));
  };

  const setStep = next => {
    setStepState(next);
    setPageError(null);
  };

  /** Back is always allowed; forward stops at the first required step unmet. */
  const goTo = next => {
    if (next <= step) {
      setStep(next);
      return;
    }
    const blocked = firstInvalidTab(values, next, flags);
    if (blocked >= 0) {
      setErrors(e => ({ ...e, ...validateTab(TABS[blocked], values, flags) }));
      setStep(blocked);
      return;
    }
    setStep(mobileTaken ? 0 : next);
  };

  /**
   * Saves, and resolves `{ id }` — or null when nothing was written. Messages
   * the server sends back are placed under their own fields, on the step that
   * shows them.
   */
  const save = async () => {
    if (saving) return null;
    setPageError(null);

    if (mobileTaken) {
      setErrors(e => ({ ...e, mobile_number: mobileMessage }));
      setStep(0);
      return null;
    }
    if (asFamily && (!parentId || !relationId)) {
      setPageError('Choose the relation to the number’s owner.');
      setStep(0);
      return null;
    }

    const saveFlags = { editing: exists, self: false, child: asFamily };
    const found = validateAll(values, saveFlags);
    if (Object.keys(found).length) {
      setErrors(found);
      const at = firstInvalidTab(values, TABS.length, saveFlags);
      if (at >= 0) setStep(at);
      return null;
    }

    try {
      const payload = buildPayload(values);
      const rows = {};
      for (const key of COLLECTION_KEYS) {
        if (payload[key]) rows[key] = payload[key];
        delete payload[key];
      }

      if (exists) {
        // The role has its own endpoint and its own grant.
        const roleId = payload.role_id;
        delete payload.role_id;
        const roleChanged =
          roleId != null && !same(roleId, savedRole.current);
        if (roleChanged) {
          await updateRole.mutateAsync({
            userId: memberId,
            roleId,
            roleName: roleNameOf(roleId),
          });
          savedRole.current = roleId;
        }
        const res = await updateUser.mutateAsync(payload);
        toast.success(res?.detail || 'Member updated successfully.');
        if (roleChanged) toast.success('Role updated.');
        setDirty(false);
        return { id: String(memberId) };
      }

      let response;
      let failedRecords;
      if (asFamily) {
        const child = { ...payload, relation_id: Number(relationId) };
        delete child.mobile_number;
        delete child.mobile_secondary;
        delete child.whatsapp_number;
        ({ response, failedRecords } = await createChild.mutateAsync({
          parentId: Number(parentId),
          child,
          ...rows,
        }));
      } else {
        ({ response, failedRecords } = await createUser.mutateAsync({
          user: payload,
          ...rows,
        }));
      }

      toast.success(
        response?.detail ||
          (asFamily
            ? 'Family member registered successfully.'
            : 'Member created successfully.'),
      );
      if (failedRecords > 0) {
        toast.warning(
          `${failedRecords} education or job entr${failedRecords === 1 ? 'y' : 'ies'} could not be saved. Add them from this member’s Edit screen.`,
        );
      }
      // Now on the server, so they are read from there.
      if (Object.keys(rows).length) {
        setValues(v => {
          const next = { ...v };
          for (const key of COLLECTION_KEYS) delete next[key];
          return next;
        });
      }
      savedRole.current = payload.role_id ?? null;
      setDirty(false);

      const id = response?.data?.id ?? response?.data?.user_id ?? null;
      if (id != null) setCreatedId(String(id));
      return { id: id == null ? null : String(id) };
    } catch (err) {
      const placed = {};
      const loose = [];
      for (const [name, message] of Object.entries(err?.fieldErrors ?? {})) {
        if (tabIndexOfField(name) >= 0) placed[name] = message;
        else loose.push(`${humanize(name)}: ${message}`);
      }
      if (!Object.keys(placed).length) {
        const named = (
          String(err?.message ?? '').match(/[a-z][a-z0-9_]{2,}/g) ?? []
        ).find(name => tabIndexOfField(name) >= 0);
        if (named) placed[named] = err.message;
      }
      const names = Object.keys(placed);
      if (names.length) {
        setErrors(e => ({ ...e, ...placed }));
        setStep(Math.min(...names.map(tabIndexOfField)));
      }
      setPageError(
        loose.length ? loose.join(' · ') : names.length ? null : err?.message,
      );
      return null;
    }
  };

  const filled = {
    ...Object.fromEntries(
      COLLECTION_KEYS.map(key => {
        const query = collections[key];
        return [key, query?.data ? pickRows(query.data).length > 0 : undefined];
      }),
    ),
    family: familyQ.data
      ? pickRows(familyQ.data.members ?? familyQ.data).length > 0
      : undefined,
  };

  return {
    editing,
    exists,
    memberId,
    record: recordQ,
    tabs,
    tab,
    step,
    lastStep,
    goTo,
    back: () => setStep(step - 1),
    next: () => goTo(Math.min(step + 1, lastStep)),
    // Offered once the required steps are behind, or the member exists.
    canSave: exists || step >= LAST_REQUIRED,
    progressOf: t =>
      stepProgress(t, values, { editing, filled, ignore: lockedLevels }),
    values,
    errors: mobileTaken ? { ...errors, mobile_number: mobileMessage } : errors,
    pageError,
    change,
    changeLevel,
    addItem,
    updateItem,
    removeItem,
    touch: () => setDirty(true),
    save,
    saving,
    dirty,
    lookups,
    address,
    hierarchy: {
      access,
      me: editing ? record : me,
      queries: hierarchyQueries,
    },
    collections,
    persistFor,
    family: { query: familyQ, mutations: familyMutations },
    mobileBusy: mobileQ.isFetching,
    familyOffer: {
      open: offerFamily,
      owner,
      accept: acceptFamily,
      decline: declineFamily,
    },
    asFamily,
    relationId,
    setRelationId,
    onError: err => toast.error(err?.message),
  };
}
