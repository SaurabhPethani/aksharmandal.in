// The only place an action or module name is written as a literal.
//
// Nothing here grants anything — every decision still comes from full-context's
// `is_granted`. These constants exist so that the *names* being looked up live
// in one file: if the backend renames an action, one line changes instead of a
// grep across every screen.

// Verified against a live full-context on 2026-08-02: the module and action
// names below are the ones the API actually returns.

export const MODULES = {
  USERS: 'USERS',
  TRANSFER: 'TRANSFER',
  ATTENDANCE: 'ATTENDANCE',
  /**
   * The hierarchy tree screen. Declares READ and nothing else — it opens the
   * page and lists the Pradeshes, and grants no writes at all.
   *
   * Adding and editing are gated per level by PRADESH / MANDAL / SABHA below.
   * `HIERARCHY:CREATE` and `HIERARCHY:UPDATE` were removed from the backend as a
   * redundant second way to say the same thing, so do not reintroduce them here.
   */
  HIERARCHY: 'HIERARCHY',
  /**
   * The lookup lists behind the Add/Edit User form — education levels, job
   * industries, business types, relations, user categories, address master.
   *
   * The GET endpoints are deliberately ungated (the user form needs them before
   * anyone has been granted anything); CREATE and UPDATE are what this module
   * actually governs, and they gate every write on the Master Data screen.
   */
  MASTER_DATA: 'MASTER_DATA',
  /**
   * Events and their registrations.
   *
   * Its four actions are genuinely independent SERVER-SIDE — READ, CREATE,
   * UPDATE and REGISTER — and the backend enforces that with its own resolver so
   * a partial grant cannot leak the others. Nimit Sevak and Yuvak hold REGISTER
   * alone, so `GET /events` 403s for them: never gate the event list on anything
   * but READ.
   *
   * ⚠ THE FRONTEND NARROWS THIS. By explicit request, EventsPage requires READ
   * *in addition to* REGISTER before it offers registering at all
   * (`EventsPage.jsx`, `canRegister`). A REGISTER-only role therefore sees the
   * "No access" branch rather than the Registered tab. That is a product
   * decision layered on top of the grants, not a description of them — the
   * backend would still accept those registrations. Restore access by granting
   * EVENTS:READ to the role.
   */
  EVENTS: 'EVENTS',
  /** Audit trail. Declares ACTIVITY_LOGS_READ and CRON_LOGS_READ, no plain READ. */
  LOGS: 'LOGS',
  /**
   * Roles and the grants attached to them — the Roles & Permissions screen.
   * READ views roles and their permission maps; CREATE covers creating a role,
   * editing its details, and changing its grants.
   */
  USER_ROLE: 'USER_ROLE',
  PRADESH: 'PRADESH',
  MANDAL: 'MANDAL',
  SABHA: 'SABHA',
  /** Dashboard figures and the exportable reports. Declares READ and DOWNLOAD. */
  REPORTS: 'REPORTS',
  /** The Compare report — its own module, one action (VIEW), managed via RBAC
   *  independently of Reports. Route /compare, nav item after Reports. */
  COMPARE: 'COMPARE',
  /**
   * The follow-up worklist — who each Nimit Sevak is responsible for, and the
   * contacts logged against them. Declares ADD and nothing else, so a READ check
   * against it can never come back true: gate on ADD, or on `visible` — which is
   * exactly what YuvaSevaPage does, and why it checks READ only when the module
   * turns out to declare one.
   *
   * ⚠ Its LIST is a reports endpoint (`/reports/yuva-seva-report`); only the
   * write is YUVA_SEVA:ADD.
   */
  YUVA_SEVA: 'YUVA_SEVA',
  /**
   * Daily Thoughts — the spiritual quote on My Dashboard, admin-managed
   * from a Master Data tab. TWO actions:
   *   READ    view the admin list (opens the tab)
   *   CREATE  add AND delete a thought — one write grant covers both,
   *           same pattern MASTER_DATA uses.
   * Random-pick reads on the dashboard are NOT gated by these — every
   * authenticated member sees the card (see thoughts.py).
   */
  THOUGHTS: 'THOUGHTS',
  /**
   * Delegable Control-Panel member administration. Declares CHANGE_MOBILE, which
   * gates the "Change Mobile" tool. A non-SuperAdmin grantee is clamped to their
   * hierarchy scope by the backend. Grant it to a role (e.g. DB Manager) in the
   * Roles UI to let them use the tool.
   */
  USER_ADMIN: 'USER_ADMIN',
  /**
   * Governs who may retune permissions on the Permissions tab.
   *
   * Was `ROLE_PERMISSIONS`, which full-context has never returned — so the
   * check behind it could not come back true and the tab was read-only for
   * everyone, including SuperAdmin. The real module is `USER_PERMISSION`
   * ("User Permissions"), with READ and UPDATE.
   */
  USER_PERMISSION: 'USER_PERMISSION',
  /**
   * The job board. A maker/checker module, and its three actions divide along
   * that line rather than along CRUD:
   *
   *   READ     the board, one post, my posts — AND applying. Applying is a
   *            read-side act: a member registers interest, they author nothing.
   *   CREATE   posting, editing, and closing your own post. There is NO UPDATE
   *            action on this module, so do not gate an edit button on one.
   *   APPROVE  moving a post to Active / Paused / Rejected / Closed. The only
   *            route onto the public board, since every post starts Pending.
   */
  JOB_PORTAL: 'JOB_PORTAL',
  /**
   * The Admin SECTION of the Left Navigation — Hierarchy, Master Data, Logs and
   * User Roles sit under it, and it declares READ.
   *
   * It has no page of its own: nothing routes to `/admin`, and the heading in
   * the sidebar is a disclosure button rather than a link. What `ADMIN:READ`
   * gates is ENTRY TO THE SECTION, which is why the four modules inside it each
   * need it IN ADDITION to their own grant — see ADMIN_SECTION_MODULES in
   * routes/AppRouter.jsx.
   */
  ADMIN: 'ADMIN',
};

/**
 * The modules that live inside the Admin section, and therefore need ADMIN:READ
 * as well as their own READ.
 *
 * Two permissions, because there are two questions: may this caller into the
 * Admin section at all, and may they read this particular thing once inside.
 * Holding LOGS:READ without ADMIN:READ answers the second and not the first.
 *
 * This is the same rule the Left Navigation already applies — a section's grant
 * gates its whole branch (see services/navigation.service.js), so without
 * ADMIN:READ these four never appear in the menu. Declaring it here as well is
 * what stops the URL being the way around the menu.
 */
export const ADMIN_SECTION_MODULES = [
  MODULES.HIERARCHY,
  MODULES.MASTER_DATA,
  MODULES.LOGS,
  MODULES.USER_ROLE,
];

export const ACTIONS = {
  READ: 'READ',
  // The COMPARE module's sole action — distinct from READ.
  VIEW: 'VIEW',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  BULK_STATUS_UPDATE: 'BULK_STATUS_UPDATE',
  /** USER_ADMIN's only action — gates the delegable "Change Mobile" tool. */
  CHANGE_MOBILE: 'CHANGE_MOBILE',
  /** Pulling a report out as an Excel file — every /export endpoint wants it. */
  DOWNLOAD: 'DOWNLOAD',
  /** Logging a record against a member — YUVA_SEVA declares this and no other. */
  ADD: 'ADD',
  /**
   * The checker's verb on the job board — `JOB_PORTAL:APPROVE`.
   *
   * Independent of CREATE: someone may be trusted to post a vacancy without
   * being trusted to put one live, which is the whole point of a post starting
   * Pending.
   */
  APPROVE: 'APPROVE',
  /**
   * Signing members up for an event — `EVENTS:REGISTER`.
   *
   * Independent of EVENTS:READ, and the only EVENTS action Nimit Sevak and
   * Yuvak hold. Holding it does NOT imply being able to list events.
   */
  REGISTER: 'REGISTER',
  /**
   * Reviewing a member's own edits to their profile — what puts the Info
   * Changes queue on the Approvals screen. Its own action, not a variant of
   * USERS:UPDATE: approving somebody else's change is a different trust from
   * editing the record yourself.
   */
  APPROVE_USER_INFO: 'APPROVE_USER_INFO',
  /**
   * The LOGS module's three actions. It declares no plain READ — these are the
   * whole of it, and each gates one tab of the Logs screen:
   *
   *   ACTIVITY_LOGS_READ  member-record changes   GET /activity-logs
   *   MODULE_LOGS_READ    org-content changes     GET /module-logs
   *   CRON_LOGS_READ      scheduled job runs      GET /cron-logs
   *
   * Activity and Module are SEPARATE grants, not one: a role can be trusted with
   * job postings and events without seeing changes to members' records.
   */
  ACTIVITY_LOGS_READ: 'ACTIVITY_LOGS_READ',
  MODULE_LOGS_READ: 'MODULE_LOGS_READ',
  CRON_LOGS_READ: 'CRON_LOGS_READ',
};

/**
 * Editing a member — `USERS:UPDATE` ("Manage User Information").
 *
 * This used to accept `EDIT` as well, on the chance that the backend had picked
 * that word. It has not: the live USERS module declares APPROVE_USER_INFO,
 * BULK_STATUS_UPDATE, BULK_UPLOAD, CREATE, GENERATE_QR, READ, UPDATE,
 * UPDATE_FOLLOWUP and UPDATE_ROLE — no EDIT. Accepting the extra name also let
 * a caller with only UPDATE_ROLE see an Edit button whose form then refused
 * them, since the form itself gates on UPDATE.
 */
export const USER_EDIT_ACTION = ACTIONS.UPDATE;

/**
 * Changing another member's granted actions — `USER_PERMISSION:UPDATE`
 * ("Manage User Access Rights"). One action, not a list of guesses.
 */
export const PERMISSION_SYNC_ACTION = ACTIONS.UPDATE;

/**
 * `TRANSFER:QUICK_TRANSFER` — what reveals the transfer icon on a members-list
 * row. Named for where it appears rather than for what it calls: the icon opens
 * the same dialog as the member page's Transfer button and files the same
 * request. Two grants, one act, so a role can be allowed to transfer from one
 * screen and not the other.
 */
export const QUICK_TRANSFER_ACTION = 'QUICK_TRANSFER';

/**
 * Filing a transfer request from a member's own page — `TRANSFER:CREATE`.
 *
 * The members list's row icon does the same thing behind
 * `TRANSFER:QUICK_TRANSFER` above; both POST /notifications/transfer-request,
 * which asks the destination side to accept rather than moving anyone. The
 * TRANSFER module declares CREATE, QUICK_TRANSFER, READ and UPDATE.
 */
export const TRANSFER_START_ACTION = ACTIONS.CREATE;

/**
 * Reassigning who follows a member up, from the Follow-up column.
 *
 * Its own action, not a variant of the edit grant: someone may be trusted to
 * hand a member to a different Nimit Sevak without being trusted to edit the
 * member's record.
 */
export const FOLLOWUP_UPDATE_ACTION = 'UPDATE_FOLLOWUP';

/**
 * Assigning a member a different role.
 *
 * Its own action, like the follow-up one: moving someone up the hierarchy is a
 * far heavier decision than editing their record, and is granted separately.
 */
export const ROLE_UPDATE_ACTION = 'UPDATE_ROLE';
