import { api } from '../api/client';

// Every hierarchy READ endpoint is gated by a single HIERARCHY:READ. What a
// caller can see is decided by the backend's role scoping (SuperAdmin -> all,
// Pradesh Head -> own Pradesh, Mandal Head -> own Mandal, and so on), so the
// frontend asks and renders whatever comes back rather than inferring a level
// from permissions.
//
// Writing is the opposite: it is gated per level by PRADESH / MANDAL / SABHA
// CREATE and UPDATE. HIERARCHY:CREATE and HIERARCHY:UPDATE no longer exist —
// so reading the tree and editing a node are two different grants, and a role
// can hold one without the other.
//
// Card fields available: { id, <level>_name, status, member_count } plus parent
// names on Mandal/Sabha.
//
// Every list here asks for the envelope rather than letting the interceptor
// unwrap it to `data`. The three top-level lists return HierarchyListResponse,
// which carries a top-level `member_count` — "Total members across the caller's
// entire visible scope (ignores skip/limit)" — beside the rows. Unwrapping
// would throw that away and leave the scope total needing a second request to
// the same URL. The /pradesh/{id}/mandals and /mandal/{id}/sabhas drill-downs
// have no such field; they return the plain envelope and are read the same way.
export const hierarchyService = {
  pradeshList: (params) => api.get('/api/v1/pradesh', { params, envelope: true }),
  mandalsOfPradesh: (pradeshId) => api.get(`/api/v1/pradesh/${pradeshId}/mandals`, { envelope: true }),
  sabhasOfMandal: (mandalId) => api.get(`/api/v1/mandal/${mandalId}/sabhas`, { envelope: true }),
  mandalList: (params) => api.get('/api/v1/mandal', { params, envelope: true }),
  sabhaList: (params) => api.get('/api/v1/sabha', { params, envelope: true }),

  // ── One hierarchy row by id, with its `head` / `DB_head` arrays attached ──
  //
  // The list endpoints return only names and counts; these two also carry the
  // head assignments (see `_attach_heads` in the backend). Used by the
  // "My Spiritual Friends" card, which needs the Sabha Head and Mandal Head
  // of the caller's own placement — one call per level.
  sabhaById: (sabhaId) => api.get(`/api/v1/sabha/${sabhaId}`),
  mandalById: (mandalId) => api.get(`/api/v1/mandal/${mandalId}`),

  // ── Writes ────────────────────────────────────────────────────────────────
  //
  // Each level is gated by its OWN module, not by HIERARCHY: POST /pradesh wants
  // PRADESH:CREATE, PATCH /mandal/{id} wants MANDAL:UPDATE, and so on. HIERARCHY
  // declares READ alone — it is what opens the screen, never what permits a write.
  //
  // Status is not a field on the edit form. Deactivating is its own act, so it
  // goes through `setStatus` below — the same PATCH endpoint and the same
  // <LEVEL>:UPDATE grant, but carrying only `status` so a rename can never ride
  // along with it (or be undone by it).
  createPradesh: (payload) => api.post('/api/v1/pradesh', payload, { envelope: true }),
  updatePradesh: (id, payload) => api.patch(`/api/v1/pradesh/${id}`, payload, { envelope: true }),
  createMandal: (payload) => api.post('/api/v1/mandal', payload, { envelope: true }),
  updateMandal: (id, payload) => api.patch(`/api/v1/mandal/${id}`, payload, { envelope: true }),
  createSabha: (payload) => api.post('/api/v1/sabha', payload, { envelope: true }),
  updateSabha: (id, payload) => api.patch(`/api/v1/sabha/${id}`, payload, { envelope: true }),
};

/**
 * The write calls for one level, keyed by the level name the tree already uses.
 * Lets a single dialog serve all three without a switch in the component.
 *
 * `parentKeys` are the ids a create needs beyond the name. A Sabha carries both
 * `mandal_id` and `pradesh_id` because SabhaCreate requires both — sending only
 * the Mandal is a 422, and the backend cross-checks that the pair agrees.
 */
export const LEVEL_WRITES = {
  pradesh: {
    nameKey: 'pradesh_name',
    parentKeys: [],
    create: (payload) => hierarchyService.createPradesh(payload),
    update: (id, payload) => hierarchyService.updatePradesh(id, payload),
  },
  mandal: {
    nameKey: 'mandal_name',
    parentKeys: ['pradesh_id'],
    create: (payload) => hierarchyService.createMandal(payload),
    update: (id, payload) => hierarchyService.updateMandal(id, payload),
  },
  sabha: {
    nameKey: 'sabha_name',
    parentKeys: ['mandal_id', 'pradesh_id'],
    create: (payload) => hierarchyService.createSabha(payload),
    update: (id, payload) => hierarchyService.updateSabha(id, payload),
  },
};
