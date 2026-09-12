import { api } from '../api/client';

/**
 * Roles & Permissions.
 *
 * Permissions on this screen:
 *   USER_ROLE:READ    view the roles and each role's grants
 *   USER_ROLE:CREATE  create a role, edit its details, and change its grants
 *
 * ⚠ The backend is currently stricter than that on the two EDIT paths:
 * `POST /roles` checks CREATE only when the payload carries no `id` and UPDATE
 * when it does, and `POST /sync` checks UPDATE. Today every writer also holds
 * UPDATE, so the two models agree in practice — but a role granted CREATE alone
 * would see the controls and be refused on save.
 */
export const rolesService = {
  /** Every role, rank-ordered. */
  list: () => api.get('/api/v1/role-permissions/roles'),

  /**
   * Module × Role matrix: for every active module, which actions each active
   * role grants.
   *
   * One request covers EVERY role, which is what lets the list show each role's
   * real coverage instead of the same placeholder sentence on every card. The
   * alternative — a full-context call per role — would be one request per card.
   *
   * Same grant as the list (USER_ROLE:READ), and purely additive: if it fails,
   * the cards simply omit the coverage line.
   */
  matrix: () => api.get('/api/v1/role-permissions/matrix'),

  /**
   * One role's complete permission map — every module with every action and its
   * `is_granted` flag, granted or not. This is what the Edit Permissions dialog
   * renders, and it is per role rather than derived from the caller's own
   * context: the two are different questions.
   */
  fullContext: (roleId) => api.get(`/api/v1/role-permissions/role/${roleId}/full-context`),

  /**
   * Create (no `id`) or update (with `id`) a role.
   * Create: { role_name, hierarchy_rank, has_global_scope, is_active }
   * Update: { id, role_name, is_active } — rank and global scope are fixed once
   * the role exists, and the endpoint's exclude_unset preserves them.
   */
  save: (payload) => api.post('/api/v1/role-permissions/roles', payload, { envelope: true }),

  /**
   * Replace a role's whole permission set.
   *
   * The endpoint is a REPLACE, not a patch: whatever is absent from
   * `permissions` is revoked. The dialog therefore sends every granted pair it
   * is showing, not just the ones toggled — sending only the changes would
   * silently strip every grant the user did not touch.
   */
  syncRole: (roleId, permissions) =>
    api.post('/api/v1/role-permissions/sync', { role_id: roleId, permissions }, { envelope: true }),
};
