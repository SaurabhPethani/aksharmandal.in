// ---------------------------------------------------------------------------
// ADD USER — FIELD SCHEMA AND VALIDATION
// ---------------------------------------------------------------------------
// The whole form is described here and rendered generically, so correcting a
// field name, moving a field between tabs or adding one is an edit to this file
// alone — no JSX changes.
//
// FIELD NAMES ARE VERIFIED against the live OpenAPI document (2026-07-31):
// `UserCreate` / `UserUpdate` for the member itself, `UserEducationCreate` and
// `UserJobCreate` for the two repeatable collections. Running the backend
// locally, read it at http://127.0.0.1:10000/docs (spec:
// http://127.0.0.1:10000/openapi.json). Otherwise fetch
// https://api.aksharmandal.in/aksharconnect/openapi.json — it answers 200 to a
// plain HTTP client even though /docs 403s anything that is not a browser.
//
// They were previously inferred from the snake_case shape used elsewhere, and
// six of them were wrong: `dob`, `mobile_secondary`, `reference_by_id`,
// `street_name`, the Ambrish flag and the Nimit Sevak flag are the real names.
// Two of those are required, so every create 422'd. Re-check against the spec
// rather than the conventions before adding a field here.
//
// The Nimit Sevak flag is `is_nimit_sevak`; older backends called it
// `is_karya_karta`. utils/memberFlags.js owns that name and the aliases a record
// is still read under.
//
// Dropdowns backed by an API pull their options from
// services/masterDataService.js. Gender, blood group and marital status carry
// fixed option lists because those values were specified directly rather than
// exposed by an endpoint — they are the only hardcoded options in the form.

import {
  RULES,
  buildPayload,
  isBlank,
  validateField,
  validateFields,
} from './validation';
import {
  DOING_POOJA_LABEL,
  NIMIT_SEVAK_LABEL,
  SWAYAM_SEVAK_LABEL,
  ambrishLabel,
  readMemberField,
} from './memberFlags';

// Rules and payload building are shared with the other schema-driven forms; they
// live in utils/validation.js. Re-exported so existing importers of this module
// keep working.
export { RULES, buildPayload, validateField };

// Fixed option lists — specified directly, not served by any endpoint.
//
// Male and Female only: "Other" was removed on request. A record already stored
// as "Other" therefore matches no option and renders as the placeholder on the
// edit form, which — since gender is required — forces a choice before saving.
export const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
];

export const BLOOD_GROUP_OPTIONS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
].map(g => ({
  value: g,
  label: g,
}));

// Single / Married / Widowed only — "Divorced" was removed on request. Same
// caveat as gender above, except this field is optional, so a stored "Divorced"
// reads as blank and, being blank, is dropped from the payload rather than
// overwritten. See buildPayload in utils/validation.js.
export const MARITAL_STATUS_OPTIONS = [
  { value: 'Single', label: 'Single' },
  { value: 'Married', label: 'Married' },
  { value: 'Widowed', label: 'Widowed' },
];

/**
 * Tabs, in order. `required: true` gates progress — neither Next nor a click on
 * a later tab is allowed until it validates. Optional tabs may be skipped.
 *
 * `lookup` names a hook key wired up in UserFormPage. `kind` marks a section the
 * page renders itself: `hierarchy` (cascading, permission-gated levels),
 * `pincode` (address-master lookup) and `repeatable` (add-many lists).
 *
 * Sections have no heading. They are a structural split, not a visual one — a
 * tab needs more than one only to change the column count or to hold a
 * specially rendered group. `cols` sets that count (2 by default).
 */
export const TABS = [
  {
    key: 'personal',
    label: 'Personal',
    heading: 'Personal Details',
    required: true,
    sections: [
      // The three name parts share one row.
      {
        cols: 3,
        fields: [
          {
            name: 'first_name',
            label: 'First Name',
            type: 'text',
            placeholder: 'Enter first name',
            rules: ['required'],
          },
          // Required by both UserCreate and UserUpdate, not optional as it reads.
          {
            name: 'middle_name',
            label: 'Middle Name',
            type: 'text',
            placeholder: 'Enter middle name',
            rules: ['required'],
          },
          {
            name: 'last_name',
            label: 'Last Name',
            type: 'text',
            placeholder: 'Enter surname',
            rules: ['required'],
          },
        ],
      },
      {
        cols: 2,
        fields: [
          // Checked against /users/check-mobile as it is typed; see UserFormPage.
          // `readOnlyOnEdit` freezes a field once the member exists. The mobile number
          // is the login identity and the Sampark ID is externally issued — neither is
          // this form's to change.
          {
            name: 'mobile_number',
            label: 'Mobile Number',
            type: 'tel',
            placeholder: '10-digit mobile number',
            inputMode: 'numeric',
            maxLength: 10,
            digitsOnly: true,
            readOnlyOnEdit: true,
            hiddenForChild: true,
            rules: ['required', 'mobile'],
          },
          {
            name: 'mobile_secondary',
            label: 'Secondary Mobile',
            type: 'tel',
            placeholder: '10-digit mobile number',
            inputMode: 'numeric',
            maxLength: 10,
            digitsOnly: true,
            hiddenForChild: true,
            rules: ['mobile', 'notPrimaryMobile'],
          },
          // Separate WhatsApp number for members whose WhatsApp is on a
          // different SIM than the one they call from. Blank = same as the
          // Mobile Number (the backend falls OTP + notifications back to it).
          // `lockedForSelf`: a member may see it but never edit their own — only
          // rank >= 30 (Sabha DB Manager+) manages it (enforced on the backend).
          {
            name: 'whatsapp_number',
            label: 'WhatsApp Number',
            type: 'tel',
            placeholder: '10-digit WhatsApp number',
            inputMode: 'numeric',
            maxLength: 10,
            digitsOnly: true,
            lockedForSelf: true,
            hiddenForChild: true,
            rules: ['mobile'],
            hint: 'Leave blank if same as Mobile Number.',
          },
          {
            name: 'email',
            label: 'Email',
            type: 'email',
            placeholder: 'name@example.com',
            rules: ['email'],
          },
          // Gender, then the two dates — read in that order because the pair of
          // dates belong together and a select between them split them apart.
          {
            name: 'gender',
            label: 'Gender',
            type: 'select',
            placeholder: 'Select gender',
            options: GENDER_OPTIONS,
            rules: ['required'],
          },
          // type=date renders the platform picker and ignores placeholder.
          // `max: 'today'` greys out every future day in that picker; the
          // `notFuture` rule is what actually rejects one, since the attribute
          // only constrains the calendar and not a typed or pasted value. Both
          // dates below carry the pair.
          {
            name: 'dob',
            label: 'Date of Birth',
            type: 'date',
            max: 'today',
            rules: ['required', 'date', 'notFuture'],
          },
          /**
           * When the member joined — required, and never in the future, for the
           * same reason a date of birth is not: a joining date the org has not
           * reached yet is a typo, not a plan.
           *
           * NOT DECLARED BY THE LIVE SPEC as of 2026-08-13 (checked against
           * `UserCreate` / `UserUpdate` / `UserSelfUpdate`). It is sent under the
           * conventional snake_case name and is listed in KNOWN_UNPERSISTED in
           * scripts/verify-contract.mjs, so the contract check warns rather than
           * fails until the backend declares it. Delete that line once it does —
           * and if the backend picks another spelling, this is the name to
           * change, with the old one added to FIELD_ALIASES below.
           *
           * `lockedForSelf`: shown, never editable, on your own record.
           * `UserSelfUpdate` does not declare it either, so a change here would
           * be accepted by the form, dropped by PATCH /users/me and read as
           * saved. Someone who may edit your record still sets it normally.
           */
          {
            name: 'date_of_joining',
            label: 'Date of Joining',
            type: 'date',
            max: 'today',
            lockedForSelf: true,
            rules: ['required', 'date', 'notFuture'],
          },
          {
            name: 'blood_group',
            label: 'Blood Group',
            type: 'select',
            placeholder: 'Select blood group',
            options: BLOOD_GROUP_OPTIONS,
          },
          {
            name: 'marital_status',
            label: 'Marital Status',
            type: 'select',
            placeholder: 'Select marital status',
            options: MARITAL_STATUS_OPTIONS,
          },
          /**
           * `lockedForSelf`: a member sees their Category but may never change
           * their own — which category someone belongs to (Yuvak, Yuvati, Bal,
           * Vadil …) is a classification the Mandal makes about them, not a
           * preference they set.
           *
           * IT NEVER SAVED FROM HERE ANYWAY. `UserSelfUpdate` does not declare
           * `category_id`, so PATCH /users/me drops it — `selfChanges` already
           * put it in `unsupported` and the form toasted "Category cannot be
           * changed from here" AFTER the member had chosen a new one and
           * pressed Save. Locking the control moves that answer to before the
           * work instead of after it.
           *
           * Someone editing SOMEBODY ELSE's record still gets the normal
           * dropdown, and the Add form is untouched — `lockedForSelf` applies
           * only when the record being edited is the caller's own.
           */
          {
            name: 'category_id',
            label: 'Category',
            type: 'select',
            placeholder: 'Select category',
            lookup: 'categories',
            lockedForSelf: true,
            rules: ['required'],
          },
          // `hiddenOnEdit` — drawn on the ADD form only. `UserCreate` REQUIRES
          // sampark_id, so the field cannot simply go: without it every member
          // creation comes back 422 and `npm run verify:contract` fails. On an
          // edit it was a disabled box restating a number nobody can change, so
          // that is what was removed. The value still rides along in `values`
          // and is dropped by `UserUpdate` exactly as before.
          {
            name: 'sampark_id',
            label: 'Sampark ID',
            type: 'text',
            placeholder: 'e.g. 12345',
            inputMode: 'numeric',
            maxLength: 7,
            digitsOnly: true,
            readOnlyOnEdit: true,
            hiddenOnEdit: true,
            rules: ['required', 'samparkId'],
            hint: '3 to 7 digits.',
          },
        ],
      },
      {
        // THREE ACROSS, and the last row of the step. They are one question
        // asked three ways — which standings does this member hold — so they
        // read as a row of three rather than as two-and-a-stray-one, which is
        // what a 2-column grid made of them.
        cols: 3,
        fields: [
          // "Ambrish" for a man, "Sarhadyi" for a woman — one flag, two words
          // for it, so the label follows the gender chosen a few fields up.
          // `labelFor` is resolved at render; `label` is the fallback for
          // anything that reads the schema without values (validation messages).
          //
          // `lockedForSelf`: shown, never editable, when the record being
          // edited is your own. Neither of the first two flags is something a
          // member awards themselves — and `UserSelfUpdate` declares neither,
          // so a tick here would be accepted by the form, dropped by the
          // endpoint, and read as saved. Someone who may edit your record still
          // sets both normally.
          //
          // `is_ambrish` was `is_amrish` until 2026-08; the backend column was
          // renamed in place, and utils/memberFlags.js still READS the old name.
          // The three CONFERRED standings — Ambrish, Nimit Sevak, Swayam Sevak —
          // carry `minRank: 30`: they are drawn only for Sabha DB Manager and
          // above (hierarchy_rank >= 30), and hidden from a Nimit Sevak (Yuva
          // Seva, rank 20) even where they can otherwise open the member form.
          // `doing_pooja` below has NO minRank — it is the member's own practice.
          {
            name: 'is_ambrish',
            label: 'Ambrish',
            labelFor: values => ambrishLabel(values?.gender),
            type: 'checkbox',
            lockedForSelf: true,
            minRank: 30,
          },
          // `is_nimit_sevak` — the current name for what older backends called
          // `is_karya_karta`. Spelled out rather than taken from the constant so
          // scripts/verify-contract can still find it: that script reads this
          // file as text. See utils/memberFlags.js.
          {
            name: 'is_nimit_sevak',
            label: NIMIT_SEVAK_LABEL,
            type: 'checkbox',
            lockedForSelf: true,
            minRank: 30,
          },
          // Swayam Sevak — a special standing (ready for other Seva). Admin-
          // conferred like the two above, so `lockedForSelf` + `minRank: 30`.
          {
            name: 'is_swayam_sevak',
            label: SWAYAM_SEVAK_LABEL,
            type: 'checkbox',
            lockedForSelf: true,
            minRank: 30,
          },
          // Deliberately NOT `lockedForSelf`. A daily pooja is the member's own
          // practice rather than a standing conferred on them, so
          // `UserSelfUpdate` declares it and PATCH /users/me writes it — see
          // DIRECT_FIELDS in utils/selfUpdate.js. Ticking it on your own record
          // saves, unlike the two above.
          { name: 'doing_pooja', label: DOING_POOJA_LABEL, type: 'checkbox' },
        ],
      },
    ],
  },

  {
    key: 'sabha',
    label: 'Sabha Details',
    heading: 'Sabha Details',
    required: true,
    sections: [
      // Pradesh / Mandal / Sabha share one row. Each is gated on its own READ
      // grant and falls back to the caller's own value, disabled.
      { kind: 'hierarchy', cols: 3 },
      {
        cols: 2,
        fields: [
          // Frozen once the member exists, and `UserUpdate` drops it anyway: who
          // introduced a member is a fact about their creation.
          // Required by UserCreate — the form used to treat it as optional.
          // `searchable`: a type-to-filter Combobox (like the Change-Follow-up
          // dialog), because `mandalUsers` can be a long list of every member in
          // the Mandal — scrolling a plain select to find one is painful.
          {
            name: 'reference_by_id',
            label: 'Reference Person',
            type: 'select',
            searchable: true,
            placeholder: 'Search reference person',
            lookup: 'mandalUsers',
            readOnlyOnEdit: true,
            rules: ['required'],
          },
          //
          // Role is the ONE Sabha detail an edit may change — everything else on
          // this step is fixed once the member exists. It does not travel in the
          // PATCH: `UserUpdate` does not declare `role_id`, so the page sends a
          // change through PATCH /users/{id}/role instead, the same endpoint the
          // Assign Role dialog uses. See UserFormPage.submit.
          //
          //   lockedForSelf  your own record — nobody promotes themselves
          //
          // There is deliberately NO permission lock here. `lockedWithout:
          // ROLE_UPDATE_ACTION` used to disable this box for anyone without
          // USERS:UPDATE_ROLE, which on the add form meant a required field that
          // could not be filled — creation was impossible for a caller holding
          // only USERS:CREATE. Permissions gate routes, buttons, links and nav,
          // not the contents of a form control; assignable-roles is already
          // rank-filtered by the backend, and the save is validated there.
          {
            name: 'role_id',
            label: 'Role',
            type: 'select',
            placeholder: 'Select role',
            lookup: 'roles',
            lockedForSelf: true,
            rules: ['required'],
          },
        ],
      },
    ],
  },

  {
    key: 'address',
    label: 'Address',
    heading: 'Address',
    required: true,
    sections: [
      {
        cols: 2,
        fields: [
          // Optional, as UserCreate and UserUpdate both declare it — the form
          // used to demand it and was stricter than the API.
          {
            name: 'flat_no',
            label: 'Flat No.',
            type: 'text',
            placeholder: 'Flat / house number',
          },
          {
            name: 'building_name',
            label: 'Building',
            type: 'text',
            placeholder: 'Building or society name',
          },
          {
            name: 'street_name',
            label: 'Street',
            type: 'text',
            placeholder: 'Street or road',
          },
          {
            name: 'landmark',
            label: 'Landmark',
            type: 'text',
            placeholder: 'Nearby landmark',
          },
        ],
      },
      // PIN code drives Area / Suburb / City / State / Country.
      { kind: 'pincode' },
    ],
  },

  {
    key: 'followup',
    label: 'Followup',
    heading: 'Assign Followup',
    description:
      'Select a Nimit Sevak who will be responsible for following up with this user.',
    optional: true,
    sections: [
      {
        cols: 2,
        fields: [
          // Scoped to the Sabha chosen two steps back — see the lookup in
          // UserFormPage. Optional here and assignable later through
          // PATCH /users/update-pending-followup/{id}, which is why an empty
          // list says so rather than blocking anything.
          {
            name: 'followup_by_id',
            label: 'Select Followup Person',
            type: 'select',
            // Frozen once the member exists. `UserUpdate` ignores this field
            // anyway — reassignment has its own endpoint and its own grant
            // (USERS:UPDATE_FOLLOWUP), so offering it here was a control whose
            // value was silently dropped on save.
            readOnlyOnEdit: true,
            placeholder: 'Select followup person',
            emptyLabel: 'Nobody is following up in this Sabha yet',
            hint: 'Optional — it can be assigned after the member exists.',
            lookup: 'followupPersons',
          },
        ],
      },
    ],
  },

  {
    key: 'education',
    label: 'Education',
    heading: 'Education',
    optional: true,
    sections: [
      {
        kind: 'repeatable',
        collection: 'educations',
        addLabel: 'Add Education',
        emptyLabel: 'No education entries yet. Add your first one below.',
        // Columns shown in the list of added entries.
        summary: ['school_college_name', 'study_field', 'education_year'],
        // Names verified against `UserEducationCreate`. Only education_level_id
        // is required by the API; the institute stays required here as a UX
        // choice, since an entry with no name is not worth storing.
        itemFields: [
          {
            name: 'education_level_id',
            label: 'Education Level',
            type: 'select',
            placeholder: 'Select education level',
            lookup: 'educationLevels',
            rules: ['required'],
          },
          {
            name: 'school_college_name',
            label: 'Institute',
            type: 'text',
            placeholder: 'School / college / university',
            rules: ['required'],
          },
          {
            name: 'study_field',
            label: 'Specialization',
            type: 'text',
            placeholder: 'e.g. Computer Engineering',
          },
          {
            name: 'education_year',
            label: 'Year of Passing',
            type: 'text',
            placeholder: 'e.g. 2018',
            inputMode: 'numeric',
            maxLength: 4,
            digitsOnly: true,
            rules: ['year'],
          },
        ],
      },
    ],
  },

  {
    key: 'job',
    label: 'Job',
    heading: 'Job',
    optional: true,
    sections: [
      {
        kind: 'repeatable',
        collection: 'jobs',
        addLabel: 'Add Job / Business',
        emptyLabel: 'No entries yet. Add your first job or business below.',
        summary: ['company_name', 'job_title', 'city'],

        // Employment and self-employment are described by different fields, so
        // the add form switches between two sets rather than showing the union
        // and leaving half of it meaningless. `variantField` records which was
        // chosen, so an entry can be read back into the right form later.
        //
        // Every field name below is verified against `UserJobCreate`, which
        // declares no required fields. `employment_type` is the one exception:
        // it is a frontend-only discriminator the API neither stores nor
        // returns, so an entry read back from the server carries no answer at
        // all. `variantOf` recovers it from the row's own fields — the two
        // variants share only company_name / years_of_experience / city, and
        // each has fields the other does not.
        variantField: 'employment_type',
        variants: [
          {
            value: 'JOB',
            label: 'Employed / Job',
            itemFields: [
              {
                name: 'job_title',
                label: 'Job Title',
                type: 'text',
                placeholder: 'e.g. Software Engineer',
              },
              {
                name: 'company_name',
                label: 'Company',
                type: 'text',
                placeholder: 'Company name',
                rules: ['required'],
              },
              {
                name: 'job_industry_id',
                label: 'Industry',
                type: 'select',
                placeholder: 'Select',
                lookup: 'jobIndustries',
              },
              {
                name: 'years_of_experience',
                label: 'Years of Experience',
                type: 'text',
                placeholder: 'e.g. 5',
                inputMode: 'numeric',
                maxLength: 2,
                digitsOnly: true,
              },
              {
                name: 'city',
                label: 'City',
                type: 'text',
                placeholder: 'e.g. Mumbai',
              },
            ],
          },
          {
            value: 'BUSINESS',
            label: 'Business',
            // No Industry here — it belongs to the Employed variant only. A
            // business is described by its nature, and being asked for both read
            // as the same question twice.
            itemFields: [
              {
                name: 'company_name',
                label: 'Business Name',
                type: 'text',
                placeholder: 'Business name',
                rules: ['required'],
              },
              /**
               * TYPED, NOT PICKED — and it still posts as `nature_of_business_id`.
               *
               * That field takes an integer OR a string: a string is matched
               * case-insensitively against the `nature_of_business` master and
               * reused if it is there, or added as a new row if it is not. So a
               * member types whatever describes their business and the master
               * grows from real answers instead of gating them on a list that
               * never has the right entry.
               *
               * `readFrom` is what makes an EXISTING entry editable: the API
               * returns the stored FK in `nature_of_business_id` and the words in
               * `nature_of_business_name`, and a text box showing "17" would be
               * both meaningless and destructive to save.
               */
              {
                name: 'nature_of_business_id',
                label: 'Nature of Business',
                type: 'text',
                placeholder: 'e.g. Textile trading',
                readFrom: 'nature_of_business_name',
              },
              {
                name: 'years_of_experience',
                label: 'Years in Business',
                type: 'text',
                placeholder: 'e.g. 5',
                inputMode: 'numeric',
                maxLength: 2,
                digitsOnly: true,
              },
              {
                name: 'city',
                label: 'Base Location / Address',
                type: 'text',
                placeholder: 'e.g. Mumbai',
              },
            ],
          },
        ],
      },
    ],
  },

  {
    key: 'family',
    label: 'Family',
    heading: 'Family',
    optional: true,
    // The real family lives in its own tables and is written through
    // /users/{id}/family-member — see the `family` section below.
    //
    // This tab used to also collect `father_name`, `mother_name`, `spouse_name`,
    // `emergency_contact_number` and `remarks`. None of them exist on UserCreate
    // or UserUpdate (checked against the spec on 2026-07-31 and again on
    // 2026-08-02), so they were typed, submitted, ignored by the backend and
    // lost. They are gone: a relative is now linked as a real member, which is
    // what the five fields were standing in for.
    sections: [{ kind: 'family' }],
  },
];

/**
 * The tabs a member gets when editing their OWN record.
 *
 * Family is not among them. A member may SEE their family — the profile's read
 * view lists it — but the roster is maintained on the Families page under
 * FAMILY:MANAGE, so offering the tab here would show controls that a member's
 * own screen has no business carrying.
 */
export const SELF_EDIT_TABS = TABS.filter(t => t.key !== 'family');

/**
 * Fields the PIN-code lookup fills. Read-only — they mirror the address master,
 * so their placeholder says where the value will come from rather than inviting
 * input that would be ignored.
 */
export const PINCODE_FIELDS = [
  { name: 'area', label: 'Area', placeholder: 'Filled from PIN code' },
  { name: 'suburb', label: 'Suburb', placeholder: 'Filled from PIN code' },
  { name: 'city', label: 'City', placeholder: 'Filled from PIN code' },
  { name: 'state', label: 'State', placeholder: 'Filled from PIN code' },
  { name: 'country', label: 'Country', placeholder: 'Filled from PIN code' },
];

export const HIERARCHY_FIELDS = [
  { name: 'pradesh_id', label: 'Pradesh', module: 'PRADESH' },
  { name: 'mandal_id', label: 'Mandal', module: 'MANDAL' },
  { name: 'sabha_id', label: 'Sabha', module: 'SABHA' },
];

/** Every plain field on a tab — repeatable items are not included. */
export function fieldsOf(tab) {
  return (tab.sections ?? []).flatMap(s => s.fields ?? []);
}

/**
 * A field's label as it should read for THESE values.
 *
 * Almost every field's label is fixed; `is_ambrish` is the exception, reading
 * "Ambrish" or "Sarhadyi" depending on the gender chosen. Resolved at render
 * rather than baked into the schema, which is a module-level constant and has no
 * values to consult.
 */
export const labelOf = (field, values) =>
  (typeof field?.labelFor === 'function' ? field.labelFor(values) : null) ??
  field?.label ??
  '';

/** Collection keys (`educations`, `jobs`) declared by a tab's repeatable sections. */
export function collectionsOf(tab) {
  return (tab.sections ?? [])
    .filter(s => s.kind === 'repeatable')
    .map(s => s.collection);
}

/**
 * Every repeatable collection on the form.
 *
 * These are NOT fields on the member: `UserCreate` and `UserUpdate` declare
 * neither, and each row has its own endpoint (`/users/{id}/educations`,
 * `/users/{id}/jobs`). They have to be split out of the payload before it is
 * sent, or they are silently dropped and the entries the user typed vanish
 * without an error.
 */
export const COLLECTION_KEYS = TABS.flatMap(collectionsOf);

/**
 * The fields one entry of a repeatable section is made of.
 *
 * Without variants that is simply `itemFields`. With them it depends on which
 * variant the entry is — a Business entry has no Job Title — so the choice
 * recorded on the entry itself decides, falling back to the first variant for an
 * entry that predates the field.
 */
export function itemFieldsFor(section, item) {
  if (!section?.variants?.length) return section?.itemFields ?? [];
  // One rule for both the fields and the list label — see variantOf.
  return (variantOf(section, item) ?? section.variants[0]).itemFields ?? [];
}

/**
 * A stored row -> the draft the add/edit form holds.
 *
 * Almost every field reads itself. `readFrom` is the exception: a field whose
 * stored value and its EDITABLE value are different keys on the same row —
 * `nature_of_business_id` holds the resolved FK, `nature_of_business_name` the
 * words that produced it. Editing has to start from the words, or the box shows
 * an id and saving it means something else entirely.
 *
 * The fallback matters as much as the mapping: a row written before the master
 * resolved a name has the id and nothing else, and the field's own value is a
 * better answer than an empty box.
 */
export function itemDraftFrom(section, item) {
  const draft = { ...(item ?? {}) };
  for (const field of itemFieldsFor(section, item)) {
    if (!field.readFrom) continue;
    const preferred = item?.[field.readFrom];
    if (preferred != null && String(preferred).trim() !== '')
      draft[field.name] = preferred;
  }
  return draft;
}

/** Does this row carry a value for this field, under either of its two keys? */
function fieldIsFilled(item, field) {
  // `readFrom` matters here: a stored business keeps its words in
  // `nature_of_business_name` while `nature_of_business_id` holds the FK, and
  // either one proves the row is a business.
  for (const key of [field.name, field.readFrom]) {
    if (!key) continue;
    const value = item?.[key];
    if (value != null && String(value).trim() !== '') return true;
  }
  return false;
}

/** The fields this variant has and no other variant does — its fingerprint. */
function distinctiveFields(section, variant) {
  const elsewhere = new Set(
    section.variants
      .filter(v => v !== variant)
      .flatMap(v => (v.itemFields ?? []).map(f => f.name)),
  );
  return (variant.itemFields ?? []).filter(f => !elsewhere.has(f.name));
}

/**
 * Which variant an entry belongs to — for labelling it in the list AND for
 * choosing the fields its edit form shows.
 *
 * `variantField` is the answer whenever the entry carries one, which is every
 * entry the add form produced in this session.
 *
 * IT IS ABSENT ON ANYTHING READ BACK FROM THE SERVER. `employment_type` is a
 * frontend-only discriminator that `UserJobCreate` does not declare, so the API
 * never stores it and never returns it. Falling straight through to
 * `variants[0]` therefore opened EVERY saved entry as a Job — a business row
 * edited as "Job Title / Company / Industry", with its Nature of Business
 * nowhere on the form and dropped on save.
 *
 * So the row is asked instead: whichever variant's OWN fields — the ones no
 * other variant has — actually carry values is the variant it belongs to. A
 * business fills `nature_of_business_id`, a job fills `job_title` or
 * `job_industry_id`, and neither fills the other's.
 *
 * A row that answers for neither (an empty draft, or an entry holding only the
 * fields both variants share) still falls back to the first variant, which is
 * what an add form opens on.
 */
export function variantOf(section, item) {
  if (!section?.variants?.length) return null;

  const declared = section.variants.find(
    v => v.value === item?.[section.variantField],
  );
  if (declared) return declared;

  let best = null;
  let bestScore = 0;
  for (const variant of section.variants) {
    const score = distinctiveFields(section, variant).filter(f =>
      fieldIsFilled(item, f),
    ).length;
    if (score > bestScore) {
      best = variant;
      bestScore = score;
    }
  }
  return best ?? section.variants[0];
}

/** Validates the add-form of a repeatable section, against its active variant. */
export function validateItem(section, item) {
  return validateFields(itemFieldsFor(section, item), item);
}

/**
 * Fields to validate on a tab, in the current mode.
 *
 * `readOnlyOnEdit` fields are skipped while editing. They are rendered disabled
 * — the mobile number is the login identity, the Sampark ID is externally
 * issued — so a stored value that fails its own rule is not something the user
 * can fix, and blocking on it locks them out of every later step of their own
 * record. It happens: a member seeded with `sampark_id: "0"` fails the 3-to-7
 * digit rule, and before this the Personal step could never be left.
 *
 * The value is not this form's to change either way, so nothing is lost by not
 * checking it.
 *
 * `self` does the same for `lockedForSelf` fields, for exactly the same reason:
 * on your own record they are rendered as a stated value, so a required one that
 * is EMPTY is a wall. Date of Joining is why this exists — every member who
 * predates the field has none, and without this a required field they cannot
 * fill would block them off their own Personal step forever. None of these
 * fields is sent by the self-edit path either (`UserSelfUpdate` declares neither
 * them nor the role), so nothing is lost by not checking them.
 */
function validatableFields(tab, editing, self = false, child = false) {
  return fieldsOf(tab).filter(f => {
    if (editing && f.readOnlyOnEdit === true) return false;
    if (self && f.lockedForSelf === true) return false;
    // Child registration has no mobile fields — they carry hiddenForChild so
    // they are neither rendered nor validated when registering a child.
    if (child && f.hiddenForChild === true) return false;
    return true;
  });
}

/**
 * Validates one tab. Hierarchy and PIN-code sections are checked here too, since
 * their required-ness is part of the tab's contract even though the page renders
 * them specially.
 *
 * `editing` marks the edit form, where the frozen fields above are not checked;
 * `self` marks your own record, where the locked ones are not either.
 */
export function validateTab(
  tab,
  values,
  { editing = false, self = false, child = false } = {},
) {
  const errors = validateFields(
    validatableFields(tab, editing, self, child),
    values,
  );

  if (tab.sections?.some(s => s.kind === 'hierarchy')) {
    for (const level of HIERARCHY_FIELDS) {
      if (isBlank(values[level.name]))
        errors[level.name] = 'This field is required.';
    }
  }

  if (tab.sections?.some(s => s.kind === 'pincode')) {
    const message =
      RULES.required(values.pincode) ?? RULES.pincode(values.pincode);
    // Everything except `area` is filled by the lookup; `area` is the member's
    // own pick from the dropdown, so the two are reported separately.
    const unresolved = PINCODE_FIELDS.filter(
      f => f.name !== 'area' && isBlank(values[f.name]),
    );

    if (message) {
      errors.pincode = message;
    } else if (unresolved.length) {
      // UserCreate requires area / suburb / city / state / country, and the only
      // thing that fills them is the PIN-code lookup. A code that resolved to
      // nothing would otherwise submit an incomplete address and come back as a
      // 422 naming fields this form never showed as inputs.
      errors.pincode = 'This PIN code has not resolved to an address yet.';
    }

    // Belongs on the Area control, not on the PIN code above it. Harmless before
    // a code resolves: with no areas to list, Area renders as a plain disabled
    // mirror that shows no message at all.
    if (isBlank(values.area)) errors.area = 'Select an area.';
  }

  return errors;
}

/** Validates every required tab. Optional tabs are format-checked, not required. */
export function validateAll(
  values,
  { editing = false, self = false, child = false } = {},
) {
  return TABS.reduce((acc, tab) => {
    if (tab.optional) {
      // Skipped tabs still must not carry a malformed value (a half-typed year).
      for (const field of validatableFields(tab, editing, self, child)) {
        for (const ruleName of (field.rules ?? []).filter(
          r => r !== 'required',
        )) {
          const message = RULES[ruleName]?.(values[field.name], values);
          if (message) {
            acc[field.name] = message;
            break;
          }
        }
      }
      return acc;
    }
    return { ...acc, ...validateTab(tab, values, { editing, self, child }) };
  }, {});
}

/** Names of everything a tab requires, including its specially rendered groups. */
export function requiredNames(tab, editing) {
  const names = validatableFields(tab, editing)
    .filter(f => (f.rules ?? []).includes('required'))
    .map(f => f.name);

  if (tab.sections?.some(s => s.kind === 'hierarchy')) {
    names.push(...HIERARCHY_FIELDS.map(level => level.name));
  }
  // `area` counts as well as `pincode`: it is the member's own choice, so a tab
  // showing 100% while Next still refuses would be the stepper lying.
  if (tab.sections?.some(s => s.kind === 'pincode'))
    names.push('pincode', 'area');

  return names;
}

/**
 * Every detail a tab asks for, required or not — what its percentage counts.
 *
 * Checkboxes are left out: `false` is a real answer, so they are never "empty"
 * and counting them would start the tab above zero. The PIN-code mirrors are
 * left out too — Area and the code itself are what the user acts on, and the
 * other four arrive together from one lookup, which would jump the number by
 * two thirds in a single keystroke.
 */
function progressNames(tab, editing) {
  const names = validatableFields(tab, editing)
    .filter(f => f.type !== 'checkbox')
    .map(f => f.name);

  if (tab.sections?.some(s => s.kind === 'hierarchy')) {
    names.push(...HIERARCHY_FIELDS.map(level => level.name));
  }
  if (tab.sections?.some(s => s.kind === 'pincode'))
    names.push('pincode', 'area');

  return names;
}

/** The add-many and family sections on a tab, which count one unit each. */
function progressSections(tab) {
  const keys = collectionsOf(tab);
  if (tab.sections?.some(s => s.kind === 'family')) keys.push('family');
  return keys;
}

/**
 * How complete a tab is, 0-100 — the number the stepper shows in its circle.
 *
 * Every tab starts at 0% and climbs with each detail given, required or not, so
 * a step with a dozen fields moves in eights rather than jumping between two
 * states. Optional tabs are counted the same way: they used to show their step
 * number instead, which said nothing about what was in them.
 *
 * It measures **presence, not correctness**. A malformed email is a validation
 * error but not missing progress; letting it pull the number down would make it
 * mean two things at once.
 *
 * `filled` answers for what lives on the server rather than in `values` — the
 * education and job rows of a member that already exists, and the family. Each
 * counts as one unit: `{ educations: true, family: false }`. Without it those
 * fall back to what the form is holding, which is right on the add flow.
 *
 * `ignore` drops fields the user is not the one filling in. A hierarchy level
 * the caller may not READ is filled from their own record the moment the form
 * loads — real data, but not their work, and counting it opened Sabha Details
 * at 60% (three levels of five units) before they had touched anything.
 */
export function stepProgress(
  tab,
  values,
  { editing = false, filled = {}, ignore = [] } = {},
) {
  const skip = new Set(ignore);
  const names = progressNames(tab, editing).filter(name => !skip.has(name));
  const sections = progressSections(tab);
  const total = names.length + sections.length;
  if (!total) return 0;

  const hasRows = key =>
    filled[key] ?? (Array.isArray(values[key]) && values[key].length > 0);
  const done =
    names.filter(name => !isBlank(values[name])).length +
    sections.filter(hasRows).length;

  return Math.round((done / total) * 100);
}

/**
 * Which tab shows a given field, or -1 if nothing on this form does.
 *
 * Used to place a message the server sent back — a 422 names its field, and the
 * message belongs under that control, on its own tab. A name this does not
 * recognise has nowhere to render, so the caller keeps it as page-level text
 * rather than attaching it to a field that is never drawn.
 */
export function tabIndexOfField(name) {
  if (isBlank(name)) return -1;
  return TABS.findIndex(tab => {
    if (fieldsOf(tab).some(f => f.name === name)) return true;
    if (tab.sections?.some(s => s.kind === 'hierarchy')) {
      if (HIERARCHY_FIELDS.some(l => l.name === name)) return true;
    }
    if (tab.sections?.some(s => s.kind === 'pincode')) {
      if (name === 'pincode' || PINCODE_FIELDS.some(f => f.name === name))
        return true;
    }
    return false;
  });
}

/**
 * The first required tab that does not validate, or -1 when all of them do.
 * Used to refuse a jump forward and to land submit on a fixable tab.
 */
export function firstInvalidTab(
  values,
  before = TABS.length,
  { editing = false, self = false, child = false } = {},
) {
  for (let i = 0; i < Math.min(before, TABS.length); i += 1) {
    if (!TABS[i].required) continue;
    if (
      Object.keys(validateTab(TABS[i], values, { editing, self, child })).length
    )
      return i;
  }
  return -1;
}

/**
 * A fetched user record -> form values: the inverse of buildPayload, derived
 * from the same schema. A field added to TABS above is prefilled by the edit
 * form without touching this function.
 *
 * Everything is stringified because <select> compares option values as strings
 * and a number would never match its option; dates are trimmed to yyyy-mm-dd
 * because a native date input rejects a full ISO timestamp and silently renders
 * blank.
 */
/**
 * Any date the API might send -> `yyyy-MM-dd`, which is the only thing a native
 * date input will render.
 *
 * This is why a saved Date of Birth came back blank: an ISO timestamp truncates
 * correctly, but `28-10-2012` does not — the first ten characters are already
 * the whole string, in the wrong order, and the input silently shows nothing
 * rather than complaining. Day-first and slash-separated forms are reordered;
 * anything already `yyyy-MM-dd` passes straight through.
 */
export function toDateInputValue(raw) {
  const text = String(raw).trim();
  if (!text) return '';

  // 2012-10-28, or the date half of an ISO timestamp.
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // 28-10-2012 or 28/10/2012.
  const dayFirst = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}`;

  // Anything else (a locale string, an epoch) — let Date decide, and give up
  // rather than guess if it cannot.
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/**
 * Other keys a record might use for a field.
 *
 * The form's names follow the conventions the rest of this API uses, but
 * GET /users/{id} is not documented here, so a field returned under another
 * spelling would render blank with nothing to indicate why. Reading through
 * these makes the prefill survive that; the empty case still ends up empty.
 */
const FIELD_ALIASES = {
  // The first entry of each list is this form's own former name, kept so a
  // response that still uses the old spelling prefills rather than reading blank.
  dob: [
    'date_of_birth',
    'birth_date',
    'birthdate',
    'dateOfBirth',
    'date_of_birth_str',
  ],
  // The backend does not declare this one yet, so which spelling it settles on
  // is still open — the three it plausibly picks all prefill the same box.
  date_of_joining: ['joining_date', 'date_of_join', 'dateOfJoining'],
  mobile_secondary: [
    'secondary_mobile_number',
    'secondary_mobile',
    'alternate_mobile_number',
    'secondary_number',
  ],
  street_name: ['street'],
  reference_by_id: ['reference_person_id', 'reference_id'],
  sampark_id: ['sampark_no', 'samparkId'],
  followup_by_id: ['followup_by', 'followup_person_id'],
};

/** The record's value for a form field, under its own name or a known alias. */
function readField(user, name) {
  if (user[name] != null && user[name] !== '') return user[name];
  for (const alias of FIELD_ALIASES[name] ?? []) {
    if (user[alias] != null && user[alias] !== '') return user[alias];
  }
  return null;
}

export function toFormValues(user) {
  if (!user) return {};
  const values = {};

  const put = (name, type) => {
    const raw = readField(user, name);
    if (raw == null) return;
    if (type === 'date') values[name] = toDateInputValue(raw);
    else values[name] = String(raw);
  };

  for (const tab of TABS) {
    for (const field of fieldsOf(tab)) {
      if (field.type !== 'checkbox') put(field.name, field.type);
    }
    for (const key of collectionsOf(tab)) {
      if (!Array.isArray(user[key])) continue;
      values[key] = user[key].map(item =>
        Object.fromEntries(
          Object.entries(item ?? {}).map(([k, v]) => [
            k,
            v == null ? '' : String(v),
          ]),
        ),
      );
    }
  }

  for (const level of HIERARCHY_FIELDS) put(level.name);
  for (const field of PINCODE_FIELDS) put(field.name);
  put('pincode');

  // Checkboxes are set unconditionally: a record that omits the key would
  // otherwise leave the control with an undefined value and React would switch
  // it from controlled to uncontrolled mid-render. The former misspellings are
  // still read, so a record written before the rename still prefills.
  values.is_ambrish = readMemberField(user, 'is_ambrish') === true;
  values.is_nimit_sevak = readMemberField(user, 'is_nimit_sevak') === true;
  // Loaded even when the caller's rank hides the control, so a lower-rank editor's
  // save re-sends the member's OWN standing rather than resetting it to false.
  values.is_swayam_sevak = readMemberField(user, 'is_swayam_sevak') === true;
  values.doing_pooja = readMemberField(user, 'doing_pooja') === true;

  return values;
}

// buildPayload lives in utils/validation.js and is re-exported at the top of
// this file — the repeatable collections on this form recurse through it.
