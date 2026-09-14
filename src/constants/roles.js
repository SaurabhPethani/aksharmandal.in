import { NIMIT_SEVAK_LABEL } from '../utils/memberFlags';

// The only place a role NAME is written in this app, and the only place a role
// is looked up by one.
//
// WHY THIS IS NOT full-context
//
// `GET /role-permissions/user/{id}/full-context` answers
// `{ user_id, user_name, role_id, role_name, permissions }` — the CALLER's own
// role and nothing else (`UserFullContext` in the OpenAPI document). Everything
// that shows "your role" already reads it from there, through
// `usePermissions().roleName`: the sidebar, the dashboard greeting, your own
// profile. None of that is hardcoded.
//
// What full-context cannot answer is which role OTHER people hold — "who is the
// head of this Mandal", "how many Nimit Sevaks are in this Sabha". Those come
// from `GET /role-permissions/roles`, which lists every role as
// `{ id, role_name, rank, global, is_active }`, and the hierarchy screen matches
// against it to learn the ids. No id is ever written down here: ids are resolved
// at runtime, because a reorder migration exists and a silently-wrong id renders
// a confidently-wrong head rather than failing visibly.
//
// A NAME therefore has to be recognised somewhere, and this is that place. Each
// role lists every spelling it has shipped under, so a rename on either side
// keeps working until this file catches up — the Nimit Sevak rename from
// Karya Karta is exactly the case that motivated it.
//
// ⚠ If a role is renamed to something not listed here, the head line reads
// "unassigned" and the pill reads 0. Both are quiet — add the new spelling to
// the aliases below rather than replacing the old one.

/**
 * ROLES THAT MAY NOT READ THE HELP PAGE — the one place in this app that names a
 * role by ID rather than by name, and the only exception to everything above.
 *
 * `/help` is a static manual with no module and no grant behind it, so there is
 * nothing in full-context to gate it on: every signed-in role could read it.
 * Role 10 was to be shut out of it, and an id is what was specified.
 *
 * ⚠ THIS IS A HARDCODED ID, with the failure mode the top of this file warns
 * about: the reorder migration that renumbers roles would point this at whoever
 * lands on 10 — quietly hiding the manual from the wrong people, and showing it
 * to the ones it was taken from. If the backend ever exposes a HELP module, or
 * a role NAME is an acceptable key, move this rule onto that and delete the list.
 *
 * A list rather than a single id so a second role costs one entry, not a rewrite.
 */
export const HELP_DENIED_ROLE_IDS = [10];

/**
 * May this role open the Help page?
 *
 * Both the header's book icon and the /help route ask this ONE function, so the
 * icon and the URL can never disagree — a hidden entry whose URL still answers
 * is the bug this exists to prevent.
 *
 * An unknown role (full-context still loading, or a response with no role_id)
 * reads as ALLOWED. The page is a manual, not data: showing it to someone who
 * should not have it is a smaller wrong than blanking it for everyone the moment
 * the field is missing, and the backend gates nothing here either way.
 */
export const canReadHelp = (roleId) =>
  roleId == null || !HELP_DENIED_ROLE_IDS.includes(Number(roleId));

/**
 * ROLES THAT SEE ONLY THEIR OWN DASHBOARD — the second and last ID-keyed rule
 * here, and it carries the same ⚠ as the Help one above: a renumbering
 * migration would point it at whoever lands on 10.
 *
 * /dashboard is two dashboards behind a tab strip — the hierarchy the caller
 * oversees, and the caller's own record. A role with nobody under them has
 * nothing to read in the first: `overall` is about other members, and a tab
 * strip offering a choice between "everyone" and "me" is not a choice when the
 * first one is empty or is not theirs to look at. So the strip goes with it —
 * a strip of one is a label, not a choice.
 *
 * DELIBERATELY A SEPARATE LIST from HELP_DENIED_ROLE_IDS even though both hold
 * the same id today. They are two different decisions about one role, and
 * merging them would mean a change to either rule silently moves the other.
 */
export const SELF_DASHBOARD_ONLY_ROLE_IDS = [10];

/**
 * May this role read the hierarchy half of the dashboard?
 *
 * An unknown role (full-context still loading, or a response with no role_id)
 * reads as ALLOWED, and the `overall` block's own emptiness test then decides
 * whether the tab is drawn at all — see hasOverallData. The same reasoning as
 * canReadHelp: a missing field must not take a screen away from the roles that
 * do hold it.
 */
export const canReadOverallDashboard = (roleId) =>
  roleId == null || !SELF_DASHBOARD_ONLY_ROLE_IDS.includes(Number(roleId));

/**
 * Who sees the "Not Login" list (members in their scope who never signed in):
 * Yuva Seva rank and above (hierarchy_rank >= 20). Only the Yuvak role (id 10,
 * the lowest rank) sits below that line, and its data scope is only itself, so
 * the list would always be empty for them.
 *
 * The backend enforces the real cut by scope band ("self"-scoped callers are
 * refused). This list only decides whether the dashboard LINK is drawn — an
 * unknown/custom role reads as ALLOWED (same reasoning as the helpers above),
 * and if the backend disagrees the page shows an empty/permission state rather
 * than a dead link. A SEPARATE list from the two above by policy.
 */
export const NOT_LOGGED_IN_DENIED_ROLE_IDS = [10];
export const canSeeNotLoggedIn = (roleId) =>
  roleId == null || !NOT_LOGGED_IN_DENIED_ROLE_IDS.includes(Number(roleId));

/**
 * ROLES THAT MAY NOT OPEN THE REPORTS KPI DRILL-DOWN — the third ID-keyed rule
 * here, carrying the same ⚠ as the two above.
 *
 * Clicking Lapsed / Retain / New opens a popup listing the members behind the
 * figure, with their mobile numbers on Call and WhatsApp buttons. A count is a
 * statistic; a list of names and numbers is a contact sheet, and Yuvak is the
 * one role that may read its own Sabha's figures without being anybody's
 * follow-up.
 *
 * A SEPARATE LIST again, for the reason SELF_DASHBOARD_ONLY_ROLE_IDS gives:
 * three different decisions about one role, and merging them would mean a change
 * to any rule silently moves the others.
 *
 * ⚠ UNLIKE the two rules above, this one is NOT the security boundary. The
 * backend refuses `/report-overview/members` below Yuva Seva rank
 * (`can_view_kpi_members`), which is rank-based and survives a renumbering. This
 * list only decides whether the number is drawn as a button — so that a Yuvak
 * is never offered a click that answers 403.
 */
export const KPI_DRILLDOWN_DENIED_ROLE_IDS = [10];

/**
 * May this role click a KPI number to see the members behind it?
 *
 * An unknown role (full-context still loading, or a response with no role_id)
 * reads as ALLOWED — same reasoning as canReadHelp, and safe to be generous with
 * here precisely because the backend gate is the real one: the worst case is a
 * button that answers "your role may not see the member names".
 */
export const canDrillIntoKpi = (roleId) =>
  roleId == null || !KPI_DRILLDOWN_DENIED_ROLE_IDS.includes(Number(roleId));

/** Compare two role names ignoring case, spacing and punctuation. */
const normalise = (name) => String(name ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

/** Does this roles-list row go by any of these names? */
export const roleMatches = (row, names) => {
  const actual = normalise(row?.role_name ?? row?.name);
  return actual !== '' && names.some((n) => normalise(n) === actual);
};

/** The id of the first role in `rows` going by any of `names`, or null. */
export function findRoleId(rows, names) {
  const row = (Array.isArray(rows) ? rows : []).find((r) => roleMatches(r, names));
  return row?.id ?? row?.role_id ?? null;
}

/**
 * The role that heads each hierarchy level.
 *
 * Not a column on the hierarchy tables — there is no `head_user_id` — so it is
 * inferred from the users table: the member holding this role whose
 * pradesh_id / mandal_id / sabha_id points at the row.
 */
export const HEAD_ROLES = {
  pradesh: ['Pradesh Head'],
  mandal: ['Mandal Head'],
  sabha: ['Sabha Head'],
};

/**
 * The roles tallied on each Sabha row of the hierarchy tree.
 *
 * `label` is what the pill says — always the current word, whatever spelling the
 * backend answered with.
 */
export const COUNTED_ROLES = [
  { label: NIMIT_SEVAK_LABEL, names: ['Nimit Sevak', 'Karya Karta', 'Karyakarta'] },
  { label: 'Yuvak', names: ['Yuvak'] },
];
