import { api } from '../api/client';

// Lookup endpoints that populate the Add/Edit User form's dropdowns.
//
// Every option shown in that form comes from here — nothing is hardcoded, so a
// category or role added in the backend appears without a frontend change.
//
// Paths carry the `/api/v1` prefix the rest of the app uses. The feature spec
// writes some of these bare (`/education-levels`), but moduleRegistry.js already
// resolves that same endpoint as `/api/v1/education-levels`, so the prefix is the
// app's actual convention and the bare form is shorthand.
export const masterDataService = {
  categories: () => api.get('/api/v1/user-categories'),
  roles: () => api.get('/api/v1/role-permissions/roles'),
  educationLevels: () => api.get('/api/v1/education-levels'),
  jobIndustries: () => api.get('/api/v1/job-industries'),
  naturesOfBusiness: () => api.get('/api/v1/nature-of-business'),
  /** Relation types for the Family section. */
  relations: () => api.get('/api/v1/relations'),

  /** Candidates for "Reference Person" — members of the caller's mandal. */
  mandalUsers: () => api.get('/api/v1/users/get-all-mandal-users'),
  /**
   * Candidates for "Follow-up Person", scoped to one Sabha.
   *
   * `sabha_id` is the id of the Sabha actually selected — on the members list
   * the one drilled into, on the user form the one chosen in the Sabha tab. With
   * nothing selected the param is omitted and the backend answers for the
   * caller's own scope.
   *
   * Callers must wrap this in an arrow rather than hand it to React Query as a
   * queryFn directly: React Query invokes a queryFn with the query context, and
   * that would arrive here as `sabhaId`.
   */
  followupPersons: (sabhaId) =>
    api.get('/api/v1/users/get-followup-person-list', {
      params: sabhaId ? { sabha_id: sabhaId } : undefined,
    }),

  /**
   * PIN-code lookup that fills Area / Suburb / City / State / Country.
   * Returns whatever rows the backend has for the code; the form treats an empty
   * result as "not found" rather than clearing what the user typed.
   */
  addressByPincode: (pincode) => api.get('/api/v1/address-master', { params: { pincode } }),

  /**
   * GET /api/v1/users/check-mobile/{mobile} — is this number already registered?
   *
   * The response shape is not documented in this repo; `isMobileTaken` in
   * utils/options.js reads the common spellings and errs toward "free", so an
   * unreadable answer never blocks a legitimate create.
   *
   * Lives here rather than in usersService because it backs a *form control* —
   * it validates a field as it is typed, like the address lookup above, rather
   * than reading or writing a member record.
   */
  checkMobile: (mobile) => api.get(`/api/v1/users/check-mobile/${mobile}`),

  // ── Master Data admin screen ──────────────────────────────────────────────
  //
  // The lookups above are read as dropdown fodder (active rows only, no params).
  // The admin screen reads the SAME endpoints but needs archived rows too, so it
  // passes `include_inactive` — the convention every one of these lists shares.
  list: (path, { includeInactive = false } = {}) =>
    api.get(path, { params: includeInactive ? { include_inactive: true } : undefined }),
  create: (path, payload) => api.post(path, payload, { envelope: true }),
  update: (path, id, payload) => api.patch(`${path}/${id}`, payload, { envelope: true }),

  /** Full Address Master — pincodes with their areas inline. */
  addressMaster: ({ includeInactive = false } = {}) =>
    api.get('/api/v1/address-master', {
      params: includeInactive ? { include_inactive: true } : undefined,
    }),

  /**
   * Address Master writes. Two tables, two endpoints — a pincode carries the
   * geography, an area is a child row pointing at it via `pincode_id`. There is
   * no combined create, so adding an address with an area is two calls in order.
   */
  createPincode: (payload) =>
    api.post('/api/v1/address-master/pincodes', payload, { envelope: true }),
  createArea: (payload) =>
    api.post('/api/v1/address-master/areas', payload, { envelope: true }),
  /**
   * Both PATCH bodies are entirely optional fields, so an edit sends only what
   * actually changed rather than resubmitting the whole row.
   */
  updatePincode: (pincodeId, payload) =>
    api.patch(`/api/v1/address-master/pincodes/${pincodeId}`, payload, { envelope: true }),
  updateArea: (areaId, payload) =>
    api.patch(`/api/v1/address-master/areas/${areaId}`, payload, { envelope: true }),
};

/**
 * The six Master Data tabs, as data.
 *
 * Every simple tab is the same screen over a different endpoint — one `name`
 * column, a status, and the same two verbs — so the page renders them from this
 * table instead of carrying six near-identical components.
 *
 * ⚠ `statusKey` is NOT uniform. Five of these lists spell the flag `is_active`;
 * `user-categories` spells it `status`. Writing one of those names everywhere
 * silently breaks the other tab's status column AND its Deactivate, so the name
 * is declared per tab and read through it.
 */
export const MASTER_DATA_TABS = [
  {
    key: 'address-master',
    label: 'Address Master',
    description: 'Pincode-to-area mappings used by user creation and address lookups.',
    // Its own shape entirely — pincode + geography + inline areas — so it gets a
    // dedicated renderer rather than the shared name/status table.
    kind: 'address',
    newLabel: 'New Address',
  },
  {
    key: 'education-levels',
    label: 'Education Levels',
    description: 'Qualification levels offered on a member’s Education records.',
    kind: 'simple',
    path: '/api/v1/education-levels',
    statusKey: 'is_active',
    newLabel: 'New Education Level',
    searchPlaceholder: 'Search education levels',
  },
  {
    key: 'job-industries',
    label: 'Job Industries',
    description: 'Industries offered on a member’s Job records and in the Job Portal.',
    kind: 'simple',
    path: '/api/v1/job-industries',
    statusKey: 'is_active',
    newLabel: 'New Job Industry',
    searchPlaceholder: 'Search job industries',
  },
  {
    key: 'nature-of-business',
    label: 'Business',
    description: 'Business types offered when a member records self-employment.',
    kind: 'simple',
    path: '/api/v1/nature-of-business',
    statusKey: 'is_active',
    newLabel: 'New Nature of Business',
    searchPlaceholder: 'Search business types',
  },
  {
    key: 'relations',
    label: 'Relations',
    description: 'Family relationship labels used when adding a family member.',
    kind: 'simple',
    path: '/api/v1/relations',
    statusKey: 'is_active',
    newLabel: 'New Relation',
    searchPlaceholder: 'Search relations',
  },
  {
    key: 'user-categories',
    label: 'User Category',
    description: 'Categories a member can be classified as — Yuvak, Yuvati, Bal, Vadil and so on.',
    kind: 'simple',
    path: '/api/v1/user-categories',
    // The odd one out — see the warning above.
    statusKey: 'status',
    newLabel: 'New User Category',
    searchPlaceholder: 'Search user categories',
  },
];
// Today's Thoughts moved OUT of Master Data into the SuperAdmin Control Panel
// (Control Panel → Today's Thought → Library / Report tabs). See
// pages/TodaysThoughtPoolPage.jsx.
