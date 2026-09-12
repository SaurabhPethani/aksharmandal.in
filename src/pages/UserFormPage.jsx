import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, User } from 'lucide-react';
import {
  useAddressByPincode, useAssignableRoles, useCategories, useCreateUser, useCreateChild,
  useEducationLevels, useFollowupPersons, useJobIndustries, useMandalUsers,
  useMandals, useMe, useMobileCheck, usePermissions, useProfileImage,
  usePradeshList, useProfile, useRelations, useSabhas, useToast,
  useSelfSave, useUpdateRole, useUpdateUser, useUserEducations, useUserFamily,
  useUserJobs, useEducationMutations, useFamilyMutations, useJobMutations,
} from '../hooks';
// Not from the barrel: the approvals hooks are imported by their own module,
// as the Approvals screen does.
import { useApprovalActions, useInfoRequests } from '../hooks/useApprovals';
import { Button, ErrorState, PageLoader } from '../components/ui';
import { Stepper, Tabs } from '../components/Navigation';
import {
  APPROVAL_NOTICE_BY_TAB, ApprovalNotice, COL_CLASS, FamilyRoster, HierarchySection,
  PendingApprovalCard, PincodeSection, PlainField, RepeatableSection,
  applyOwnPlacement, needsApproval, readAddress, toAddressRows,
} from '../components/user-form';
import { isAttending, statusLabel } from '../components/hierarchy/MemberList';
import { Combobox, FormField, Select } from '../components/form';
import { isHeadRelation } from '../components/user-form/shared';
import ForbiddenPage from './ForbiddenPage';
import { ProfileHero } from '../components/user-detail/ProfileCards';
import { isMobileTaken, mobileTakenLabel, mobileTakenUser, pickRows, toOptions } from '../utils/options';
import { Modal } from '../components/Overlays';
import { selfChanges } from '../utils/selfUpdate';
import { humanize } from '../utils/format';
import { ACTIONS, MODULES } from '../constants/permissions';
import { LOADING } from '../constants/messages';
import {
  COLLECTION_KEYS, HIERARCHY_FIELDS, PINCODE_FIELDS, TABS, buildPayload,
  firstInvalidTab, itemFieldsFor, labelOf, stepProgress, tabIndexOfField,
  toFormValues, validateAll, validateItem, validateTab, variantOf,
} from '../utils/userFormSchema';

// Add Member and Edit Member — one form, because they capture the same fields
// and only differ in where the values start and which verb saves them. The mode
// is decided by the route: /users/new has no :userId, /users/1152/edit does.
//
// Unlike the module routes — which simply are not registered when ungranted —
// these routes have to exist for the members module to work, so the grant is
// checked on render and refused with a 403 page. Adding needs USERS:CREATE,
// editing needs USERS:UPDATE.
//
// Progress is gated both ways: Next and a click on a later tab both refuse while
// an earlier required tab is incomplete.

const MEMBERS_PATH = '/users';
const PROFILE_PATH = '/profile';

/**
 * Which step first needs each lookup, so nothing is fetched before it is
 * reachable. Resolved from the schema rather than written as indices — moving a
 * step would otherwise silently point a lookup at the wrong one.
 */
const stepIndex = (key) => TABS.findIndex((t) => t.key === key);
const LOOKUP_TAB = {
  categories: stepIndex('personal'),
  address: stepIndex('address'),
  roles: stepIndex('sabha'),
  mandalUsers: stepIndex('sabha'),
  followupPersons: stepIndex('followup'),
  educationLevels: stepIndex('education'),
  jobIndustries: stepIndex('job'),
};

/**
 * The display NAME behind a field whose value is an id — what a locked control
 * shows instead of the number it holds.
 *
 * ⚠ THE RECORD SPELLS THIS TWO DIFFERENT WAYS, and both are live on the same
 * response, so neither can be treated as the convention:
 *
 *   followup_by_id  ->  followup_by_id_name   the suffix is KEPT
 *   category_id     ->  category_name         the suffix is REPLACED
 *   role_id         ->  role_name             ditto
 *
 * So both are tried. The suffixed form goes first because that is the one the
 * list endpoint documents and the one this form already depended on; stripping
 * unconditionally would have broken Follow-up to fix Category.
 *
 * This replaced a hardcoded `role_id` special case, which worked only because
 * Role was the sole locked id field at the time. Category was the second, and
 * it rendered blank: `category_id_name` is on no response, so the lookup fell
 * through to the raw id — and to nothing at all where the form had not stored
 * one. Anything locked later resolves without another special case.
 *
 * Returns null when neither key is present, which is what makes `PlainField`
 * fall back to the field's own value.
 */
const readOnlyNameOf = (record, fieldName) => {
  if (!record) return null;
  const stripped = fieldName.replace(/_id$/, '');
  return record[`${fieldName}_name`] ?? record[`${stripped}_name`] ?? null;
};

export default function UserFormPage({ childMode = false }) {
  const { can, userId: callerId } = usePermissions();
  const { userId } = useParams();
  const isEdit = Boolean(userId);

  /**
   * EDITING YOURSELF IS NOT A PERMISSION.
   *
   * USERS:UPDATE is the grant to change SOMEBODY ELSE's record, and gating your
   * own record on it means whether you can correct your own blood group depends
   * on your rank — which is why the Edit button appeared for some members and
   * not others. The endpoints already draw this line: PATCH /users/me and
   * POST /information-requests are open to every authenticated role, and it is
   * `isEditingSelf` inside the form (not this grant) that routes a self-edit to
   * them. So a member arriving here for their own record has always had
   * somewhere to save to; only the door was locked.
   *
   * Adding is untouched — there is no "yourself" to add — and editing anyone
   * else still requires the grant, checked exactly as before.
   */
  const isSelf = isEdit && String(userId) === String(callerId ?? '');

  // The gate sits in this wrapper so the form's own hooks are never mounted for
  // a caller who may not proceed — no lookup requests are fired behind a 403.
  if (!isSelf && !can(MODULES.USERS, isEdit ? ACTIONS.UPDATE : ACTIONS.CREATE)) {
    return (
      <ForbiddenPage
        title="Permission denied"
        message={
          isEdit
            ? 'Editing a member requires the Members · Update permission.'
            : 'Adding a member requires the Members · Create permission.'
        }
        backTo={MEMBERS_PATH}
        backLabel="Back to members"
      />
    );
  }
  return <UserForm userId={userId} childMode={childMode} />;
}

function UserForm({ userId, childMode = false }) {
  // `userId` from full-context is the signed-in caller — the target for
  // assignable-roles while adding, when there is no member to ask about yet.
  const { can, userId: callerId } = usePermissions();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const isEdit = Boolean(userId);
  // Child flow entered from the Add-User duplicate-number popup carries the
  // parent (the number's owner) as ?parent=<id>. When present, the parent is
  // fixed — the child's placeholder number is derived from that parent's number,
  // so it must not be changed here.
  const lockedParentId = childMode ? (searchParams.get('parent') || '') : '';

  /**
   * The member created part-way through the add flow.
   *
   * Nothing offers to create one directly — Save & Exit (Address onward) and
   * Finish & Exit do it on the way out. The exception is linking a relative:
   * `/users/{id}/family-member` needs an id, so pressing Save in that form
   * creates the member first and then links, rather than refusing.
   *
   * Once set, the form is editing that record: further saves PATCH, so no
   * sequence of presses can produce a second member.
   */
  const [createdId, setCreatedId] = useState(null);
  const memberId = userId ?? createdId;
  const exists = Boolean(memberId);
  /** Whether this form is the caller editing their own record. */
  const isEditingSelf = String(memberId ?? '') === String(callerId ?? '') && Boolean(memberId);

  const createUser = useCreateUser();
  // Child registration posts to /users/{parent}/children instead of /users/.
  const createChild = useCreateChild();
  const updateUser = useUpdateUser(memberId);
  // Role has its own endpoint — PATCH /users/{id} cannot write it. See submit.
  const updateRole = useUpdateRole();
  // Editing yourself does not go through PATCH /users/{id} at all — see submit.
  const selfSave = useSelfSave(memberId);
  // Inline "register a family member" mode on the normal Add-User form: the
  // entered number is already registered and the operator chose to register a
  // child under its owner. Distinct from childMode (the /users/new-child route);
  // both register a child, so `asChild` drives the shared logic below.
  const [familyMode, setFamilyMode] = useState(false);
  const asChild = childMode || familyMode;
  const save = !exists ? (asChild ? createChild : createUser) : isEditingSelf ? selfSave : updateUser;

  // ── Child registration: the parent (guardian) + the child's relation to them.
  // Only used in childMode; the child joins the parent's family and inherits
  // (editable) their address + hierarchy. The parent picker reuses the Mandal
  // directory the Family roster uses.
  const [childParent, setChildParent] = useState('');
  const [childRelation, setChildRelation] = useState('');
  const childParentQ = useProfile(asChild && childParent ? childParent : null);
  // Relations are needed by the childMode route AND by the Add-User "register a
  // family member" popup, so load them on any add form, not only childMode.
  const childRelationsQ = useRelations(childMode || !isEdit);
  const childParentsQ = useMandalUsers(childMode);
  useEffect(() => {
    if (!asChild) return;
    const p = childParentQ.data;
    if (!p) return;
    // Prefill address + hierarchy from the parent, leaving anything the user has
    // already typed intact (|| keeps a chosen value; ?? only fills a blank one).
    setValues((v) => ({
      ...v,
      flat_no: v.flat_no ?? p.flat_no ?? '',
      building_name: v.building_name ?? p.building_name ?? '',
      street_name: v.street_name ?? p.street_name ?? '',
      landmark: v.landmark ?? p.landmark ?? '',
      area: v.area || p.area || '',
      suburb: v.suburb || p.suburb || '',
      pincode: v.pincode || p.pincode || '',
      city: v.city || p.city || '',
      state: v.state || p.state || '',
      country: v.country || p.country || '',
      pradesh_id: v.pradesh_id || p.pradesh_id || '',
      mandal_id: v.mandal_id || p.mandal_id || '',
      sabha_id: v.sabha_id || p.sabha_id || '',
    }));
  }, [asChild, childParentQ.data]);

  // Fix the parent to the number's owner when the flow was entered from the
  // Add-User "register a family member" popup (?parent=<id>).
  useEffect(() => {
    if (childMode && lockedParentId) setChildParent(String(lockedParentId));
  }, [childMode, lockedParentId]);

  // The record being edited. Disabled on the add form, so it costs no request.
  const recordQ = useProfile(isEdit ? userId : null);
  // The photo for the identity card, on the edit form only — there is no
  // member to have one yet while adding. Shares its key with the view pages,
  // so arriving from /users/{id} costs no second request.
  const imageQ = useProfileImage(memberId, isEdit);

  /**
   * Your own open approval request, if you have one.
   *
   * Self-edit only. `GET /information-requests` needs no grant to read your OWN
   * rows — `user_id` is what makes it a self-read rather than the approver
   * queue, which does need USERS:APPROVE_USER_INFO and 403s without it. So the
   * id is not an optional filter here; leaving it off would break the page for
   * every member the feature is for.
   *
   * At most one can be open — a second POST while one is pending is a 409 — so
   * the list is read as its first row rather than rendered as a list.
   */
  const pendingQ = useInfoRequests(isEditingSelf, { status: 'pending', user_id: callerId });
  const pendingRequest = pickRows(pendingQ.data)[0] ?? null;
  const { cancelInfo } = useApprovalActions();

  const cancelPending = async () => {
    if (!pendingRequest?.id || cancelInfo.isPending) return;
    try {
      const res = await cancelInfo.mutateAsync({ id: pendingRequest.id });
      toast.success(res?.detail || 'Request cancelled.');
    } catch (err) {
      toast.error(err?.message);
    }
  };

  // The three checkboxes start defined so React never sees them switch from
  // uncontrolled to controlled — see toFormValues for the same reasoning.
  const [values, setValues] = useState({
    is_ambrish: false, is_nimit_sevak: false, doing_pooja: false,
  });
  const [errors, setErrors] = useState({});
  const [tabIndex, setTabIndex] = useState(0);
  const [submitError, setSubmitError] = useState(null);

  /*
   * LOOKUPS ARE GATED ON THE TAB THAT IS OPEN — `tabIndex === LOOKUP_TAB.x`.
   *
   * This used to be a high-water mark (`maxTab >= LOOKUP_TAB.x`): once a tab had
   * been reached, its lookup stayed enabled for the rest of the session. On the
   * edit form that is nearly every lookup at once, because reaching a late tab
   * such as Family satisfies the gate for every earlier one — so opening Family
   * fired education-levels, user-categories, job-industries, address-master,
   * followup-person-list and assignable-roles, none of which that tab renders.
   *
   * Leaving a tab now disables its lookup, and coming back re-enables it. That
   * is not a refetch: LOOKUP_CACHE keeps the row fresh for ten minutes, so the
   * second visit is served from cache and costs no request.
   */

  // Prefill once. Keyed on the record rather than a boolean so a refetch after
  // saving does not overwrite whatever the user has since typed.
  const prefilledFor = useRef(null);
  /**
   * The record as it was prefilled, in payload shape. Only used when editing
   * yourself, where the save sends differences rather than the whole record —
   * comparing against the form's own starting point rather than against the raw
   * response keeps both sides through the same trimming and coercion.
   */
  const baseline = useRef({});
  /**
   * The role this member is already stored with, as far as this form knows.
   *
   * It exists because "has the role changed?" cannot be asked of `recordQ` on
   * the ADD flow: that query is disabled there (`useProfile(isEdit ? … : null)`),
   * so `recordQ.data` is undefined for the life of the form. Comparing against
   * it made every save after the first one look like a role change, and fired a
   * PATCH /users/{id}/role carrying the role the create had just written.
   *
   * Set from the record when editing, from the create's own payload when adding,
   * and after each successful role PATCH — so it always names what the server
   * holds, on both flows.
   */
  const savedRole = useRef(null);
  useEffect(() => {
    const record = recordQ.data;
    if (!record || prefilledFor.current === record) return;
    prefilledFor.current = record;
    const prefilled = toFormValues(record);
    baseline.current = buildPayload(prefilled);
    savedRole.current = record.role_id ?? null;
    setValues(prefilled);
  }, [recordQ.data]);

  /**
   * WHO GETS THE FAMILY STEP AT ALL.
   *
   *   USERS:UPDATE   the grant its two writes need — POST and DELETE
   *                  `/users/{user_id}/family-member`. Without it the step is a
   *                  roster nobody on this form can change, on a form whose only
   *                  purpose is changing things.
   *   not your own   a member does not put people into their own family; the
   *                  Sevak maintaining their record does. Removed rather than
   *                  shown closed — a step that can only be looked at is a step
   *                  that reads as broken.
   *
   * The tab is REMOVED, not disabled: `visibleTabs` is what the strip and the
   * Next/Finish buttons are built from, while `tabIndex` stays an index into the
   * full TABS. Keeping one index means `LOOKUP_TAB`, `firstInvalidTab` and
   * `validateTab` all go on addressing the same steps they always did.
   */
  // Hidden in childMode too: the Parent + Relation picker above the form is the
  // child's family link, so a second Family roster would be redundant.
  const showFamily = !isEditingSelf && !asChild && can(MODULES.USERS, ACTIONS.UPDATE);
  const visibleTabs = useMemo(
    () => TABS.filter((t) => t.key !== 'family' || showFamily),
    [showFamily]
  );

  const tab = TABS[tabIndex];
  const isFirst = tabIndex === 0;
  // Against the LAST VISIBLE step, not TABS' own end: with Family hidden, Job is
  // where the form finishes, and "Next: Family" would point at nothing.
  const lastVisibleIndex = TABS.indexOf(visibleTabs[visibleTabs.length - 1]);
  const isLast = tabIndex >= lastVisibleIndex;

  /**
   * Which hierarchy levels the caller may choose from, straight out of
   * full-context: a level is selectable exactly when its module's READ action
   * comes back `is_granted: true`. Derived from HIERARCHY_FIELDS rather than
   * written out, so the levels are declared in one place — adding a fourth is an
   * entry in the schema and nothing here.
   *
   * WHY THESE THREE FIELDS ARE GATED WHEN NO OTHER FORM CONTROL IS.
   *
   * The rule everywhere else in this form is that a permission never disables a
   * control: Role and the address lookups are drawn and editable regardless of
   * grants, because the alternative is an empty disabled box on a required
   * field — see `rolesQ` and the note where `lockedWithout` used to be.
   *
   * Pradesh / Mandal / Sabha are the exception because a denied level has a
   * CORRECT ANSWER rather than a blank one: the caller's own placement. Without
   * PRADESH:READ the member is being created inside the caller's own Pradesh by
   * definition, so `applyOwnPlacement` fills it from `me`, the box is disabled,
   * and the id still travels in the payload. Nothing is lost and nothing is
   * guessed — so the list endpoint is genuinely not needed and is not called.
   *
   * That is the test for adding another gate here: is there a right value to
   * show instead? For these three there is. For Role and Address there is not.
   */
  const access = Object.fromEntries(HIERARCHY_FIELDS.map((l) => [l.module, can(l.module, 'READ')]));
  const grantKey = HIERARCHY_FIELDS.map((l) => (access[l.module] ? '1' : '0')).join('');
  const anyHierarchyDenied = HIERARCHY_FIELDS.some((l) => !access[l.module]);

  // ── Lookups ──────────────────────────────────────────────────────────────
  // Each is enabled only once the step that needs it is reachable, so opening
  // the form does not fetch seven dropdowns nobody has looked at yet.
  /**
   * Roles come from GET /role-permissions/user/{id}/assignable-roles, never the
   * full catalogue: the backend rank-filters it to roles strictly beneath the
   * caller's own, so the dropdown cannot offer one the save would reject.
   *
   * WHO the list is asked about differs by form:
   *
   *   adding   the caller — a self-call the endpoint supports explicitly. It
   *            keeps the rank filter and skips the Pradesh clamp, which is the
   *            right question for a member created in the caller's own scope.
   *   editing  the member — the clamp matters now, and the answer is the roles
   *            this caller may move THIS member into.
   *
   * NOT gated on USERS:UPDATE_ROLE. That grant governs whether a role change is
   * accepted, not whether the picker may be drawn — and the endpoint already
   * rank-filters the list to what this caller may grant, so an unpermitted role
   * is not in it to pick. Gating the fetch on the grant left holders of
   * USERS:CREATE staring at an empty, disabled box on a required field.
   *
   * `isEditingSelf` is the one thing that still suppresses it, and it is not a
   * permission: nobody promotes themselves, so there is nothing to choose from.
   */
  const roleEditable = !isEditingSelf;
  const rolesQ = useAssignableRoles(
    isEdit ? memberId : callerId,
    roleEditable && tabIndex === LOOKUP_TAB.roles
  );

  /** The chosen role's name, for the list cache — it stores names, not ids. */
  const roleNameOf = (roleId) => {
    const row = pickRows(rolesQ.data).find((r) => String(r?.id ?? r?.role_id) === String(roleId));
    return row?.role_name ?? row?.name ?? row?.display_name ?? undefined;
  };

  const lookups = {
    categories: useCategories(tabIndex === LOOKUP_TAB.categories),
    roles: rolesQ,
    mandalUsers: useMandalUsers(tabIndex === LOOKUP_TAB.mandalUsers),
    /**
     * Scoped to the Sabha chosen on the Sabha Details step.
     *
     * Unscoped, the endpoint answers for the CALLER's Mandal, while
     * `POST /users/` validates the follow-up against the NEW MEMBER's — it must
     * be an active Mandal Head, Sabha Head or Nimit Sevak in their Pradesh and
     * Mandal. Offering the caller's list let a name be picked that the create
     * then rejected with `Invalid followup_by_id`, on a step the user had
     * already left. `sabha_id` narrows it to the people serving that Sabha.
     */
    followupPersons: useFollowupPersons(
      tabIndex === LOOKUP_TAB.followupPersons && Boolean(values.sabha_id),
      values.sabha_id
    ),
    educationLevels: useEducationLevels(tabIndex === LOOKUP_TAB.educationLevels),
    jobIndustries: useJobIndustries(tabIndex === LOOKUP_TAB.jobIndustries),
    // No naturesOfBusiness lookup: Nature of Business is typed, not picked, so
    // GET /nature-of-business is a request for a list nothing renders. The
    // master still exists — the endpoint backs the Master Data screen, and the
    // job endpoint still resolves a typed name against it server-side.
    relations: useRelations(tab.key === 'family'),
  };

  // ── Per-tab records, fetched when their own tab is opened ────────────────
  const educationsQ = useUserEducations(memberId, exists && tab.key === 'education');
  const jobsQ = useUserJobs(memberId, exists && tab.key === 'job');
  const familyQ = useUserFamily(memberId, exists && tab.key === 'family');

  /**
   * Which query backs each repeatable collection while editing. On the add form
   * there is no member yet, so these stay unused and the collections live in
   * `values` until they are submitted with the rest.
   */
  const RECORD_QUERIES = { educations: educationsQ, jobs: jobsQ };

  // Each row is written on its own once the member exists: Save posts or patches
  // that entry, Delete removes it. On the add form there is no id to hang them
  // off, so entries stay in `values` and travel with the member payload.
  const educationMutations = useEducationMutations(memberId);
  const jobMutations = useJobMutations(memberId);
  const familyMutations = useFamilyMutations(memberId);

  const persistFor = (collection) => {
    if (!exists) return null;
    const m = collection === 'educations' ? educationMutations
      : collection === 'jobs' ? jobMutations
        : null;
    if (!m) return null;
    return {
      create: (payload) => m.create.mutateAsync(payload),
      update: (id, payload) => m.update.mutateAsync({ id, payload }),
      remove: (id) => m.remove.mutateAsync(id),
      busy: m.isPending,
    };
  };

  // ── Mobile already registered? ───────────────────────────────────────────
  // On the edit form the member's own number is registered by definition, so the
  // check only runs once the number has actually been changed — otherwise every
  // edit would open with a duplicate error on an untouched field.
  const originalMobile = recordQ.data?.mobile_number;
  const mobileChanged =
    !isEdit || String(values.mobile_number ?? '') !== String(originalMobile ?? '');
  const mobileQ = useMobileCheck(!asChild && mobileChanged ? values.mobile_number : '');
  // No mobile field is submitted when registering a child (childMode, or the
  // inline family-member mode) — the child's number is a server-generated
  // placeholder — so a taken number never blocks those.
  const mobileTaken = !asChild && mobileChanged && isMobileTaken(mobileQ.data);
  // The warning names who already holds the number — "… with Ravi Patel :
  // Ghatlodia : Vejalpur" — falling back to the plain sentence when the backend
  // sent no details. Built once and reused by the live field error and submit.
  const mobileTakenMsg = mobileTaken ? mobileTakenLabel(mobileQ.data) : null;
  const mobileChecking = mobileQ.isFetching;

  // ── Add-User → "register a family member" offer ──────────────────────────
  // A taken number is not just an error: the holder may want to register a
  // family member (child) who has no SIM of their own under it. When a fully
  // entered number is found taken, offer exactly that — [Yes] opens the child
  // flow with the holder pre-selected (and locked) as the parent; [No] keeps the
  // number flagged so it can be corrected. Declining is remembered per number so
  // the popup does not re-open on the same one.
  const [famOfferDismissed, setFamOfferDismissed] = useState('');
  const takenUser = mobileTaken ? mobileTakenUser(mobileQ.data) : null;
  const showFamilyOffer = Boolean(
    takenUser?.id && values.mobile_number && values.mobile_number !== famOfferDismissed
  );
  // Continue → register a family member (child) under the number's owner. Lock
  // that owner as the parent and drop back to the same form with the relation
  // now inline (editable, required) and the number locked. A relation must be
  // chosen in the popup first. Switching familyMode on makes mobileTaken false,
  // which closes the popup.
  const beginFamilyMember = () => {
    if (!takenUser?.id || !childRelation) return;
    setChildParent(String(takenUser.id));
    setFamilyMode(true);
  };
  const declineFamilyMember = () => {
    setFamOfferDismissed(values.mobile_number);
    setChildRelation('');
  };

  // ── Hierarchy: cascading, each level gated on its own grant ───────────────
  // Only the add form needs the caller's own placement as a fallback; when
  // editing, the record already carries the member's real one.
  const meQ = useMe(anyHierarchyDenied && !isEdit);
  // Not fetched at all when editing: the three levels are read-only there and
  // their names come straight off GET /users/{id}, so a list of options would be
  // three requests for something nobody can choose from.
  const pradeshQ = usePradeshList(access.PRADESH && !isEdit);
  const mandalQ = useMandals(values.pradesh_id, !isEdit && access.MANDAL && Boolean(values.pradesh_id));
  const sabhaQ = useSabhas(values.mandal_id, !isEdit && access.SABHA && Boolean(values.mandal_id));

  // Levels the caller may not choose are filled from their own record, so the
  // payload still carries a complete placement.
  useEffect(() => {
    if (!meQ.data || isEdit) return;
    setValues((v) => applyOwnPlacement(v, meQ.data, access));
  }, [meQ.data, grantKey]);

  // ── PIN code -> address ──────────────────────────────────────────────────
  const addressQ = useAddressByPincode(values.pincode, tabIndex === LOOKUP_TAB.address);
  // One row per selectable AREA, not per PIN code — the endpoint nests its areas
  // and Area is the field the member actually chooses. See toAddressRows.
  const addressRows = useMemo(() => toAddressRows(addressQ.data), [addressQ.data]);

  /**
   * Which area the member picked, as an index into `addressRows`. `null` is
   * "not picked yet" — Area is theirs to choose, so nothing is chosen for them.
   *
   * A sole area is the exception: a one-option choice is not a choice, so it is
   * selected on arrival and the dropdown simply shows it.
   */
  const [areaIndex, setAreaIndex] = useState(null);

  /**
   * A new lookup resets the pick — an index into the previous PIN code's areas
   * means nothing under this one, and left alone it would silently apply.
   *
   * Except when the form already holds an area the new rows contain: that is a
   * saved member's own address arriving back, and clearing it would make the
   * edit form demand a re-pick of something the record already has. Read at the
   * moment the rows land, before the mirrors effect below has run.
   */
  useEffect(() => {
    if (!addressRows.length) { setAreaIndex(null); return; }
    const current = String(values.area ?? '').trim();
    const saved = current ? addressRows.findIndex((r) => readAddress(r).area === current) : -1;
    setAreaIndex(saved >= 0 ? saved : addressRows.length === 1 ? 0 : null);
  }, [addressRows]);

  // The five mirrors follow the PIN-code lookup — but only once one has actually
  // happened. Without this guard the disabled query's empty result would clear
  // the address the record just prefilled, on a step the user has not opened.
  //
  // Suburb / City / State / Country are identical across a code's areas, so they
  // fill as soon as it resolves; Area waits for the pick.
  useEffect(() => {
    if (!addressQ.isFetched) return;
    const first = addressRows[0];
    const picked = areaIndex == null ? null : addressRows[areaIndex];
    setValues((v) => ({
      ...v,
      ...(first
        ? { ...readAddress(first), area: picked ? readAddress(picked).area : '' }
        : { area: '', suburb: '', city: '', state: '', country: '' }),
    }));
  }, [addressRows, areaIndex, addressQ.isFetched]);

  // ── Field plumbing ───────────────────────────────────────────────────────
  const setField = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    // Clearing on change rather than re-validating keeps the message from
    // flickering while a valid value is still being typed.
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };

  /**
   * Changing a hierarchy level clears the levels below it — a Mandal from the
   * previous Pradesh is not a valid choice under the new one.
   *
   * The caller's own placement is then re-applied, because a level they may not
   * READ is not theirs to clear: it renders as a disabled name with no list
   * behind it, so a blank would be a required field nothing on screen can fill.
   * Only levels with a granted READ actually clear.
   */
  const setHierarchy = (name, value) => {
    const changed = HIERARCHY_FIELDS.findIndex((l) => l.name === name);
    setValues((v) => {
      const next = { ...v, [name]: value };
      for (const below of HIERARCHY_FIELDS.slice(changed + 1)) next[below.name] = '';
      return applyOwnPlacement(next, meQ.data, access);
    });
    setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const addItem = (collection, item) =>
    setValues((v) => ({ ...v, [collection]: [...(v[collection] ?? []), item] }));

  // Editing an entry that has not been saved yet: there is no id to write
  // against, so the position in the list is what identifies it.
  const updateItem = (collection, index, item) =>
    setValues((v) => ({
      ...v,
      [collection]: (v[collection] ?? []).map((existing, i) => (i === index ? item : existing)),
    }));

  const removeItem = (collection, index) =>
    setValues((v) => ({ ...v, [collection]: (v[collection] ?? []).filter((_, i) => i !== index) }));

  const land = (index) => {
    setTabIndex(index);
    setSubmitError(null);
  };

  /**
   * Moving to `index`. Going back is always allowed; going forward is refused
   * while any earlier required tab is incomplete, or the mobile number is taken
   * — the click lands on the tab that needs attention, with its errors shown.
   */
  const requestTab = (index) => {
    if (index <= tabIndex) { land(index); return; }

    const blocked = firstInvalidTab(values, index, { editing: isEdit, self: isEditingSelf, child: asChild });
    if (blocked >= 0) {
      setErrors((e) => ({
        ...e,
        ...validateTab(TABS[blocked], values, { editing: isEdit, self: isEditingSelf, child: asChild }),
      }));
      land(blocked);
      return;
    }
    // The number lives on the first tab, so a duplicate blocks every jump past it.
    if (mobileTaken) { land(0); return; }

    land(index);
  };

  const next = () => requestTab(Math.min(tabIndex + 1, lastVisibleIndex));

  // The Skip action is gone with its button: the tab strip already names every
  // destination and clicking one goes there, so a second control that also moved
  // forward — while quietly discarding what had been typed — was both redundant
  // and the more destructive of the two.

  /**
   * Where this form lets go to when it is finished with — saved or cancelled.
   *
   * Editing your own record returns to your own profile, not to the members
   * directory. You reached this form from /profile's Edit button, and the
   * directory is a list of other people; being dropped there after correcting
   * your own email reads as having been moved somewhere else entirely. Some
   * members cannot even open that list — for them the old destination was a
   * page they had no permission for.
   *
   * Editing somebody else returns to THAT member's record, for the same reason:
   * you arrived from /users/:id via its Edit button, so the directory is one
   * step further back than where you were. Landing there means losing your place
   * in a paged list and having to find the person again just to see whether the
   * change you made looks right. `useUpdateUser` invalidates ['user', id], so
   * the record is already refetching as it comes into view.
   *
   * Adding still ends at the directory: a brand-new record has no page you came
   * from, and the list is where it now belongs.
   */
  const exitPath = isEditingSelf
    ? PROFILE_PATH
    : isEdit
      ? `${MEMBERS_PATH}/${userId}`
      : MEMBERS_PATH;

  const cancel = () => navigate(exitPath);

  /**
   * Writes the member and returns the id it wrote to, or null if it could not.
   *
   * Which verb is used follows from whether the record exists yet, not from
   * which button was pressed: the first successful save POSTs, every one after
   * it PATCHes the id that came back. `exit` decides whether the form leaves —
   * linking a relative needs the id but not the exit.
   */
  const submit = async ({ exit = true } = {}) => {
    if (save.isPending) return null;
    setSubmitError(null);

    if (mobileTaken) {
      setErrors((e) => ({ ...e, mobile_number: mobileTakenMsg }));
      land(0);
      return null;
    }

    // Child registration needs a parent and a relation — they live above the
    // tabs, so a missing one is reported at the top rather than inside a step.
    if (asChild && (!childParent || !childRelation)) {
      setSubmitError(
        familyMode
          ? 'Choose the relation to the number’s owner.'
          : 'Choose the parent and the child’s relation to them.'
      );
      land(0);
      return null;
    }

    // `self` skips the fields your own record states rather than offers — see
    // `lockedForSelf` in userFormSchema. A member whose record predates Date of
    // Joining has none, and it is not theirs to supply.
    const found = validateAll(values, { editing: exists, self: isEditingSelf, child: asChild });
    if (Object.keys(found).length) {
      setErrors(found);
      // Land on the first tab that actually has a problem rather than reporting
      // an error the user cannot see.
      const bad = firstInvalidTab(values, TABS.length, { editing: exists, self: isEditingSelf, child: asChild });
      if (bad >= 0) land(bad);
      return null;
    }

    try {
      // Education and job rows are their own endpoints, not fields on the
      // member — see COLLECTION_KEYS. Left in the body they are accepted and
      // discarded, so everything typed on those two steps disappears silently.
      const payload = buildPayload(values);
      const collections = {};
      for (const key of COLLECTION_KEYS) {
        if (payload[key]) collections[key] = payload[key];
        delete payload[key];
      }
      if (exists && isEditingSelf) {
        // Your own record splits in two: name and address are proposed for
        // approval, everything else is written. Only what changed is sent, so a
        // save that touched one field does not re-submit the other twenty.
        const { direct, request, unsupported } = selfChanges(baseline.current, payload);

        if (!Object.keys(direct).length && !Object.keys(request).length) {
          if (unsupported.length) {
            toast.warning(
              `${unsupported.map(humanize).join(', ')} cannot be changed from here. ` +
              'Ask someone who can edit your record.'
            );
          } else {
            toast.info('Nothing has changed.');
          }
          if (exit) navigate(exitPath);
          return memberId;
        }

        const { applied, requested } = await selfSave.mutateAsync({ direct, request });
        // Two calls, two different meanings — "saved" and "sent for approval" —
        // so each reports itself rather than being folded into one word.
        if (applied) toast.success(applied?.detail || 'Profile updated successfully.');
        if (requested) {
          toast.success(
            requested?.detail ||
            `${Object.keys(request).length} change${Object.keys(request).length === 1 ? '' : 's'} sent for approval.`
          );
        }
        if (unsupported.length) {
          toast.warning(`${unsupported.map(humanize).join(', ')} cannot be changed from here.`);
        }
        // The baseline moves on, so pressing Save again sends nothing.
        baseline.current = payload;
        if (exit) navigate(exitPath);
        return memberId;
      }

      if (exists) {
        /**
         * Role is the one field on this form that PATCH /users/{id} cannot
         * write — `UserUpdate` does not declare `role_id`, so left in the body
         * it would be accepted, dropped, and reported as saved. It goes to
         * PATCH /users/{id}/role instead, and only when it actually changed.
         *
         * `UserCreate` DOES declare `role_id`, so the add flow needs no such
         * call — the role travels with the POST. Compared against `savedRole`
         * rather than `recordQ.data`, which is undefined on that flow and so
         * made every later save look like a change and re-send the same role.
         *
         * Sent BEFORE the member update, and awaited: if the role call fails
         * (403 from a rank the caller may not grant), the error surfaces and
         * nothing else is written, rather than reporting a partial save.
         */
        const nextRole = payload.role_id;
        delete payload.role_id;
        const roleChanged =
          roleEditable && nextRole != null && String(nextRole) !== String(savedRole.current ?? '');

        if (roleChanged) {
          await updateRole.mutateAsync({
            userId: memberId,
            roleId: nextRole,
            // The name the dropdown showed for it — the list cache stores names,
            // not ids, and this saves it a refetch to learn one it already had.
            roleName: roleNameOf(nextRole),
          });
          savedRole.current = nextRole;
        }

        // Rows on an existing member are written individually as they are
        // added, so by now only the member itself is left.
        const res = await updateUser.mutateAsync(payload);
        toast.success(res?.detail || 'Member updated successfully.');
        if (roleChanged) toast.success('Role updated.');
        if (exit) navigate(exitPath);
        return memberId;
      }

      {
        // Registering a child (childMode route, or the inline family-member mode)
        // posts to /users/{parent}/children — placeholder mobile, login disabled,
        // family linked; otherwise the normal /users/ create. Both return the same
        // envelope and carry education/job rows the same way. The child has no
        // number of its own, so the mobile fields never travel (in familyMode the
        // locked field is context only — the parent's number).
        let response, failedRecords;
        if (asChild) {
          const childPayload = { ...payload, relation_id: Number(childRelation) };
          delete childPayload.mobile_number;
          delete childPayload.mobile_secondary;
          delete childPayload.whatsapp_number;
          ({ response, failedRecords } = await createChild.mutateAsync({
            parentId: Number(childParent),
            child: childPayload,
            ...collections,
          }));
        } else {
          ({ response, failedRecords } = await createUser.mutateAsync({
            user: payload,
            ...collections,
          }));
        }
        // The backend's own wording, as everywhere else in this app.
        toast.success(
          response?.detail || (asChild ? 'Family member registered successfully.' : 'Member created successfully.')
        );

        // Everything typed on the optional steps travelled with the create. Say
        // plainly what did not make it rather than reporting an unqualified
        // success — the member exists either way.
        if (failedRecords > 0) {
          toast.warning(
            `${failedRecords} education or job entr${failedRecords === 1 ? 'y' : 'ies'} could not be saved. ` +
            'Add them from this member’s Edit screen.'
          );
        }
        // Rows are on the server now; keeping them in `values` as well would
        // show each of them twice once the list refetches.
        if (Object.keys(collections).length) {
          setValues((v) => {
            const next = { ...v };
            for (const key of COLLECTION_KEYS) delete next[key];
            return next;
          });
        }

        // `UserCreate` carries role_id, so the role is stored by this call and
        // no PATCH /users/{id}/role is needed. Recording it here is what stops
        // the next save on this same form from re-sending it as a "change".
        savedRole.current = payload.role_id ?? null;

        const newId = response?.data?.id ?? response?.data?.user_id ?? null;
        if (newId != null) setCreatedId(String(newId));
        if (exit) navigate(exitPath);
        return newId != null ? String(newId) : null;
      }
    } catch (err) {
      // A 422 names the fields it rejected, so each message goes under its own
      // control and the form lands on the tab holding the first of them. Only
      // what has nowhere to render — a field this form does not draw, or an
      // error with no field at all (500, offline) — stays as page-level text.
      const placed = {};
      const unplaced = [];
      for (const [name, message] of Object.entries(err?.fieldErrors ?? {})) {
        if (tabIndexOfField(name) >= 0) placed[name] = message;
        else unplaced.push(`${humanize(name)}: ${message}`);
      }

      // This backend often names the field inside the sentence instead of in a
      // `loc` — "Invalid followup_by_id: followup user must be a Mandal Head…".
      // Any token in it that this form actually draws is the field it means, so
      // the message goes there rather than into a banner at the bottom.
      if (!Object.keys(placed).length) {
        const named = (String(err?.message ?? '').match(/[a-z][a-z0-9_]{2,}/g) ?? [])
          .find((token) => tabIndexOfField(token) >= 0);
        if (named) placed[named] = err.message;
      }

      const names = Object.keys(placed);
      if (names.length) {
        setErrors((e) => ({ ...e, ...placed }));
        land(Math.min(...names.map(tabIndexOfField)));
      }
      // api/client.js already resolved the fallback to presentable wording — the
      // backend's `detail` when it sent one, the status catalogue otherwise.
      setSubmitError(unplaced.length ? unplaced.join(' · ') : names.length ? null : err?.message);
      return null;
    }
  };

  const busy = save.isPending;

  // The duplicate warning is merged in for display rather than stored, so it
  // clears itself the moment the number changes.
  const shownErrors = mobileTaken
    ? { ...errors, mobile_number: mobileTakenMsg }
    : errors;

  // Nothing is rendered until the record is in hand: a form that appeared empty
  // and filled in a moment later would invite edits that the prefill then wipes.
  if (isEdit && recordQ.isLoading) return <PageLoader label={LOADING.page} />;
  if (isEdit && recordQ.error) {
    return (
      <div className="card">
        <ErrorState error={recordQ.error} onRetry={recordQ.refetch} title="Could not load this member" />
      </div>
    );
  }

  /**
   * The last step that carries required fields — Address. Before it, a save
   * would be a guaranteed 422; from it on, the member can exist.
   * Read from the schema so adding or reordering a required step moves it.
   */
  const lastRequiredTab = TABS.reduce((last, t, i) => (t.required ? i : last), -1);
  const canSaveHere = exists || tabIndex >= lastRequiredTab;

  /**
   * What the stepper cannot see in `values`: once the member exists its rows and
   * family live on the server. Each query only runs while its own step is open,
   * so a step not yet visited falls back to what the form is holding — which is
   * the whole truth on the add flow, and catches up on the edit one.
   */
  /**
   * Hierarchy levels the caller may not choose. `applyOwnPlacement` fills these
   * from their own record as soon as the form loads, so counting them would
   * open Sabha Details part-done for work nobody did — and that they have no
   * control to change.
   */
  const lockedLevels = HIERARCHY_FIELDS.filter((l) => !access[l.module]).map((l) => l.name);

  const filledSections = {
    ...Object.fromEntries(
      COLLECTION_KEYS.map((key) => {
        const q = RECORD_QUERIES[key];
        return [key, q?.data ? pickRows(q.data).length > 0 : undefined];
      })
    ),
    family: familyQ.data ? pickRows(familyQ.data.members ?? familyQ.data).length > 0 : undefined,
  };

  return (
    <div className="space-y-5">
      {/*
        The two modes look different on purpose.

        Adding is a progression: nothing exists yet, the steps are walked in
        order, and the stepper's percentages say how much of each is done.

        Editing is navigation around a record that already exists. Every tab is
        already complete, so progress rings would read 100% everywhere and say
        nothing — plain tabs and an identity header are the useful framing.
      */}
      {isEdit ? (
        <>
          {/* The SAME identity card the view pages use, so editing a member
              looks like the record you arrived from rather than a different
              screen about the same person. Only the actions differ — Cancel and
              Save instead of Transfer and Edit. */}
          <ProfileHero
            photo={imageQ.data?.image_url || recordQ.data?.photo_url || null}
            name={recordQ.data?.user_name || 'Member'}
            meta={[
              recordQ.data?.mobile_number,
              [recordQ.data?.sabha_name, recordQ.data?.mandal_name].filter(Boolean).join(' · '),
            ]}
            chips={
              <>
                {recordQ.data?.role_name && (
                  <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary">
                    {recordQ.data.role_name}
                  </span>
                )}
                {recordQ.data?.status != null && recordQ.data.status !== '' && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      isAttending(recordQ.data.status)
                        ? 'bg-success-bg text-success-fg'
                        : 'bg-danger-bg text-danger-fg'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${isAttending(recordQ.data.status) ? 'bg-success-fg' : 'bg-danger-fg'}`} />
                    {statusLabel(recordQ.data.status)}
                  </span>
                )}
              </>
            }
            actions={
              <>
                <Button variant="outline" onClick={cancel} disabled={busy}>Cancel</Button>
                <Button variant="accent" onClick={() => submit()} busy={busy}>Save</Button>
              </>
            }
          />

          <Tabs
            tabs={visibleTabs.map((t) => ({ value: t.key, label: t.label }))}
            value={tab.key}
            onChange={(key) => requestTab(TABS.findIndex((t) => t.key === key))}
          />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                aria-label="Back to members"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-control border border-line-strong bg-surface text-primary transition-colors hover:bg-primary-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h1 className="font-display text-lg font-bold text-primary">{childMode ? 'Register Child' : familyMode ? 'Register Family Member' : 'Add New User'}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={cancel} disabled={busy}>Cancel</Button>
              {canSaveHere && (
                <Button variant="accent" onClick={() => submit()} busy={busy}>
                  {exists ? 'Save' : childMode ? 'Register Child' : familyMode ? 'Register Family Member' : 'Create User'}
                </Button>
              )}
            </div>
          </div>

          {/* Every step starts at 0% and climbs with each detail given — the
              percentage counts what a step asks for, not only what it demands. */}
          <Stepper
            steps={visibleTabs.map((t) => ({
              key: t.key,
              label: t.label,
              badge: `${stepProgress(t, values, {
                editing: isEdit,
                filled: filledSections,
                ignore: lockedLevels,
              })}%`,
            }))}
            value={tab.key}
            onChange={(key) => requestTab(TABS.findIndex((t) => t.key === key))}
          />
        </>
      )}

      {/* Above the form rather than inside it: it is about the record as a
          whole, not about this step, and it stays put as the steps change. */}
      {isEditingSelf && (
        <PendingApprovalCard
          request={pendingRequest}
          onCancel={cancelPending}
          cancelling={cancelInfo.isPending}
        />
      )}

      {/* Child registration: the parent (guardian) + relation, above the tabbed
          form. Choosing the parent prefills the child's address + hierarchy. */}
      {childMode && (
        <div className="card space-y-4">
          <div>
            <h2 className="font-display text-sm font-bold text-primary">Parent &amp; Relation</h2>
            <p className="mt-1 text-xs text-text-muted">
              The child is registered under this parent. No mobile number is asked for — the child inherits the
              parent's family and (editable) address, and is reached on the parent's number.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Parent (guardian)"
              htmlFor="child-parent"
              required
              error={submitError && !childParent ? 'Please choose the parent.' : null}
            >
              {lockedParentId ? (
                // Fixed to the number's owner (arrived from the Add-User popup).
                // Read-only so the placeholder number always derives from them.
                <div className="rounded-xl border border-line-soft bg-bg px-3 py-2 text-sm text-primary">
                  {childParentQ.isLoading
                    ? 'Loading…'
                    : childParentQ.data
                      ? [
                          [childParentQ.data.first_name, childParentQ.data.middle_name, childParentQ.data.last_name]
                            .filter(Boolean).join(' '),
                          childParentQ.data.mobile_number,
                        ].filter(Boolean).join(' · ')
                      : 'Selected parent'}
                </div>
              ) : (
                <Combobox
                  id="child-parent"
                  placement="inline"
                  value={childParent}
                  onChange={setChildParent}
                  options={pickRows(childParentsQ.data)
                    .filter((r) => (r.user_id ?? r.id) != null)
                    .map((r) => ({
                      value: String(r.user_id ?? r.id),
                      label: r.user_name ?? r.name ?? String(r.user_id ?? r.id),
                      meta: r.mobile_number ?? '',
                    }))}
                  disabled={childParentsQ.isLoading}
                  placeholder={childParentsQ.isLoading ? 'Loading…' : 'Search members by name or number…'}
                  emptyLabel="No one matches that name or number."
                />
              )}
            </FormField>
            <FormField
              label="Relation to parent"
              htmlFor="child-relation"
              required
              error={submitError && !childRelation ? 'Please select a relation.' : null}
            >
              <Select
                id="child-relation"
                value={childRelation}
                onChange={(e) => setChildRelation(e.target.value)}
                options={toOptions(pickRows(childRelationsQ.data).filter((r) => !isHeadRelation(r?.name)))}
                disabled={childRelationsQ.isLoading}
                placeholder={childRelationsQ.isLoading ? 'Loading…' : 'Select relation (Son / Daughter…)'}
              />
            </FormField>
          </div>
        </div>
      )}

      {/* Add-User: the number is already registered — offer to register a family
          member (child) under the existing holder. Pick the relation here, then
          Continue drops back to the form with the relation inline + editable and
          the number locked. */}
      <Modal
        isOpen={showFamilyOffer}
        onClose={declineFamilyMember}
        title="Number already registered"
        size="sm"
        footer={
          <>
            <Button onClick={declineFamilyMember}>No</Button>
            <Button variant="primary" onClick={beginFamilyMember} disabled={!childRelation}>
              Continue
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          This number is already registered with{' '}
          <span className="font-semibold text-primary">{takenUser?.fullName || 'an existing member'}</span>.
          {' '}To register a family member under {takenUser?.firstName || 'them'}, choose the relation:
        </p>
        <div className="mt-3">
          <Select
            id="family-relation-popup"
            value={childRelation}
            onChange={(e) => setChildRelation(e.target.value)}
            options={toOptions(pickRows(childRelationsQ.data).filter((r) => !isHeadRelation(r?.name)))}
            disabled={childRelationsQ.isLoading}
            placeholder={childRelationsQ.isLoading ? 'Loading…' : 'Select relation (Son / Daughter…)'}
          />
        </div>
      </Modal>

      {/* Sections carry no heading of their own — they exist only to set a column
          count or to hold a specially rendered group, so the step reads as one
          form under the one heading below. */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-bold text-primary">{tab.heading ?? tab.label}</h2>
            {tab.description && <p className="mt-1 text-xs text-text-muted">{tab.description}</p>}
          </div>
          {/* Placement is set once and moved by Quick Transfer, not by this form,
              so on an existing member the whole step is shown rather than offered. */}
          {isEdit && ['sabha', 'followup'].includes(tab.key) && (
            <span className="rounded-md bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
              Read only
            </span>
          )}
        </div>
        {/* Said before anything is typed, rather than only after a save comes
            back as "sent for approval". Self-edit only: for anyone else editing
            this record these fields are written immediately. */}
        {isEditingSelf && APPROVAL_NOTICE_BY_TAB[tab.key] && (
          <ApprovalNotice>{APPROVAL_NOTICE_BY_TAB[tab.key]}</ApprovalNotice>
        )}
        {tab.sections.map((section, i) => (
          <section key={section.kind ?? `fields-${i}`}>
            {section.kind === 'hierarchy' ? (
              <HierarchySection
                readOnly={isEdit}
                cols={section.cols ?? 2}
                values={values}
                errors={shownErrors}
                access={access}
                // A level the caller cannot READ has no list to choose from, so
                // it shows a name instead: the member's own when editing, the
                // caller's own when adding.
                me={isEdit ? recordQ.data : meQ.data}
                // Keyed by the schema's own field names, so the section looks a
                // level up by `level.name` rather than deriving a key from it.
                queries={{ pradesh_id: pradeshQ, mandal_id: mandalQ, sabha_id: sabhaQ }}
                onChange={setHierarchy}
              />
            ) : section.kind === 'pincode' ? (
              <PincodeSection
                values={values}
                errors={shownErrors}
                onChange={setField}
                query={addressQ}
                rows={addressRows}
                areaIndex={areaIndex}
                onAreaChange={setAreaIndex}
              />
            ) : section.kind === 'family' ? (
              <FamilyRoster
                query={familyQ}
                userId={memberId}
                relations={lookups.relations}
                mutations={familyMutations}
                onError={(err) => toast.error(err?.message)}
                busy={busy}
                /**
                 * `/users/{id}/family-member` needs an id, so on the add form
                 * the first Save in that form creates the member and then
                 * links. Nothing else on this step writes anything: opening the
                 * form is just a form opening.
                 */
                ensureMember={async () => memberId ?? (await submit({ exit: false }))}
              />
            ) : section.kind === 'repeatable' ? (
              <RepeatableSection
                section={section}
                query={RECORD_QUERIES[section.collection]}
                persist={persistFor(section.collection)}
                onError={(err) => toast.error(err?.message)}
                items={
                  exists && RECORD_QUERIES[section.collection]
                    ? pickRows(RECORD_QUERIES[section.collection].data)
                    : values[section.collection] ?? []
                }
                lookups={lookups}
                onAdd={(item) => addItem(section.collection, item)}
                onUpdate={(index, item) => updateItem(section.collection, index, item)}
                onRemove={(index) => removeItem(section.collection, index)}
              />
            ) : (
              <div className={`grid gap-4 ${COL_CLASS[section.cols ?? 2]}`}>
                {/* `hiddenOnEdit` fields are drawn on the add form only — see
                    sampark_id in userFormSchema. They are still validated the
                    same way (`readOnlyOnEdit` already skips them on an edit)
                    and still travel in the payload; only the control goes. */}
                {section.fields
                  .filter((f) => !(isEdit && f.hiddenOnEdit === true))
                  // The three mobile fields carry hiddenForChild — a child has no
                  // number of their own, so they are neither shown nor validated.
                  .filter((f) => !(childMode && f.hiddenForChild === true))
                  .map((field) => {
                  const el = (
                  <PlainField
                    key={field.name}
                    // Labels are fixed except one: `is_ambrish` reads "Ambrish"
                    // or "Sarhadyi" by the gender chosen on this same tab.
                    field={{ ...field, label: labelOf(field, values) }}
                    readOnly={
                      (isEdit && field.readOnlyOnEdit === true)
                      // Your own record: the membership flags and your own role
                      // are stated, not offered. See `lockedForSelf`.
                      || (isEditingSelf && field.lockedForSelf === true)
                      // Family-member mode: the number belongs to the parent and
                      // is shown for context only — the child gets a generated
                      // placeholder — so the field is locked, not edited.
                      || (familyMode && field.name === 'mobile_number')
                      /**
                       * `lockedWithout` — a permission that disabled a control —
                       * is GONE, and deliberately not replaced.
                       *
                       * Permissions gate the route, the buttons, the links and
                       * the left nav. Inside a form, a control that the API can
                       * populate is drawn and is editable; the backend decides
                       * what it will accept on save and says so. Disabling the
                       * control instead produced a required field nobody could
                       * fill, which blocked creation outright.
                       *
                       * `lockedForSelf` above stays: it is a business rule
                       * (nobody promotes themselves), not a grant lookup.
                       */
                    }
                    // A proposal rather than an edit — only on your own record,
                    // and only for the fields PATCH /users/me routes into an
                    // approval request. See utils/selfUpdate.js.
                    needsApproval={isEditingSelf && needsApproval(field.name)}
                    readOnlyText={readOnlyNameOf(recordQ.data, field.name)}
                    value={values[field.name] ?? (field.type === 'checkbox' ? false : '')}
                    error={shownErrors[field.name]}
                    onChange={setField}
                    lookup={field.lookup ? lookups[field.lookup] : null}
                    busy={field.name === 'mobile_number' && mobileChecking}
                  />
                  );
                  // Family-member mode: the relation to the number's owner sits
                  // right beside Sampark ID — editable and required.
                  if (familyMode && field.name === 'sampark_id') {
                    return (
                      <Fragment key="sampark-relation">
                        {el}
                        <FormField
                          label="Relation to number holder"
                          htmlFor="family-relation"
                          required
                          error={submitError && !childRelation ? 'Select a relation.' : null}
                        >
                          <Select
                            id="family-relation"
                            value={childRelation}
                            onChange={(e) => setChildRelation(e.target.value)}
                            options={toOptions(pickRows(childRelationsQ.data).filter((r) => !isHeadRelation(r?.name)))}
                            disabled={childRelationsQ.isLoading}
                            placeholder={childRelationsQ.isLoading ? 'Loading…' : 'Select relation (Son / Daughter…)'}
                          />
                        </FormField>
                      </Fragment>
                    );
                  }
                  return el;
                })}
              </div>
            )}
          </section>
        ))}

        {submitError && (
          <p className="rounded-control border border-danger-fg/30 bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
            {submitError}
          </p>
        )}

        {/* Navigation. First tab offers no Previous; the last swaps Next for the
            create action; optional tabs add Skip. */}
        {/* Named after the steps either side rather than "Previous"/"Next", so
            the buttons say where they go without the stepper being consulted. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
          <div>
            {isFirst ? (
              <Button variant="outline" onClick={cancel} disabled={busy}>Cancel</Button>
            ) : (
              <Button variant="outline" onClick={() => land(tabIndex - 1)} disabled={busy}>
                <ChevronLeft className="h-4 w-4" />
                {TABS[tabIndex - 1].label}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Save & Exit appears as soon as a save would succeed — on the add
                form that is the last required step, Address, because everything
                UserCreate demands has been collected by its end. The steps after
                it are optional, so Next stays alongside for anyone who wants to
                fill them in now rather than come back later. */}
            {!isLast && canSaveHere && (
              <Button variant="outline" onClick={() => submit()} busy={busy}>Save &amp; Exit</Button>
            )}
            {isLast ? (
              <Button variant="primary" onClick={() => submit()} busy={busy}>
                Finish &amp; Exit
                <Check className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="primary" onClick={next} disabled={busy}>
                {TABS[tabIndex + 1].label}
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
