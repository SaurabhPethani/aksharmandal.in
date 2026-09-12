import { useMemo, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { searchMatches } from '../utils/options';

/*
 * Read-only reference manual for who can do what across the app.
 *
 * All content lives in SECTIONS below. Each section carries:
 *   - id, number, title, group (used by the sidebar and heading)
 *   - text (a searchable blob — every meaningful word in the section, so the
 *     top search field can hide non-matching sections)
 *   - render() (the JSX for the section body)
 *
 * The two-pass structure — searchable string alongside JSX — is deliberate.
 * Searching the rendered DOM would work but re-runs on every keystroke and
 * pulls React internals into the loop; a static string lets the filter be a
 * simple `.includes()` on stable data.
 */

const ROLE_COLS = [
  { key: 'mh',  short: 'MH',  label: 'Mandal Head' },
  { key: 'mdb', short: 'MDB', label: 'Mandal DB Mgr' },
  { key: 'sh',  short: 'SH',  label: 'Sabha Head' },
  { key: 'sdb', short: 'SDB', label: 'Sabha DB Mgr' },
  { key: 'ys',  short: 'YS',  label: 'Yuva Seva' },
  { key: 'yv',  short: 'YV',  label: 'Yuvak' },
];

/*
 * Permission cell — one of "yes", "no", "limited", "approval", or a plain
 * dash. Rendered as a compact coloured pill instead of an emoji so both
 * themes stay legible and there is no font-fallback risk.
 */
function Cell({ value }) {
  if (value === 'yes')      return <Pill tone="ok"     label="Yes" glyph="✓" />;
  if (value === 'no')       return <Pill tone="muted"  label="No"  glyph="–" />;
  if (value === 'limited')  return <Pill tone="warn"   label="Limited (see note)" glyph="◐" />;
  if (value === 'approval') return <Pill tone="info"   label="Needs approval" glyph="⧗" />;
  return <span className="text-text-faint">—</span>;
}

function Pill({ tone, label, glyph }) {
  const styles = {
    ok:    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    muted: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
    warn:  'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
    info:  'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  }[tone];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs font-bold leading-none ${styles}`}
    >
      {glyph}
    </span>
  );
}

/* Renders the standard 6-column matrix table used across most sections. */
function RoleMatrix({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-soft text-left">
            <th scope="col" className="table-th py-2 pr-3">Activity</th>
            {ROLE_COLS.map((c) => (
              <th
                key={c.key}
                scope="col"
                title={c.label}
                className="table-th !text-center px-2 py-2"
              >
                <span className="block text-[11px] leading-none">{c.short}</span>
                <span className="block text-[10px] font-normal leading-tight text-text-muted">{c.label.split(' ').slice(-1)[0]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line-soft/70 last:border-b-0">
              <td className="py-2.5 pr-3 text-primary">{r.label}</td>
              {ROLE_COLS.map((c) => (
                <td key={c.key} className="px-2 py-2.5 text-center">
                  <Cell value={r[c.key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({ tone = 'info', children }) {
  const styles = {
    info: 'border-sky-200 bg-sky-50/60 text-sky-900',
    warn: 'border-amber-200 bg-amber-50/60 text-amber-900',
  }[tone];
  return (
    <div className={`mt-4 rounded-control border px-4 py-3 text-sm leading-snug ${styles}`}>
      {children}
    </div>
  );
}

function Steps({ children }) {
  return <ol className="mt-2 ml-5 list-decimal space-y-1 text-sm text-primary">{children}</ol>;
}

function Q({ children }) {
  return <p className="mt-4 font-semibold text-primary">{children}</p>;
}
function A({ children }) {
  return <p className="mt-1 text-sm text-primary">{children}</p>;
}

/* ─── Section content ─────────────────────────────────────────────────── */

const SECTIONS = [
  {
    id: 'roles',
    number: '1',
    group: 'Overview',
    title: 'The Roles Covered in This Manual',
    text: 'roles mandal head db manager sabha yuva seva yuvak nimit sevak',
    render: () => (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-soft text-left">
              <th className="table-th py-2 pr-3">Role</th>
              <th className="table-th py-2 pr-3">What They Do</th>
              <th className="table-th py-2 pr-3">Area</th>
            </tr>
          </thead>
          <tbody className="text-primary">
            {[
              ['Mandal Head', 'Runs a Mandal — oversees all Sabhas under it', 'One Mandal'],
              ['Mandal DB Manager', 'Handles data entry & records for a Mandal', 'One Mandal'],
              ['Sabha Head', 'Runs a Sabha — the person on the ground', 'One Sabha'],
              ['Sabha DB Manager', 'Handles data entry & records for a Sabha', 'One Sabha'],
              ['Yuva Seva', 'Follows up with assigned Yuvaks', 'Their assigned Yuvaks only'],
              ['Yuvak (Member)', 'Regular Yuvak using the app', 'Their own profile only'],
            ].map(([role, does, area]) => (
              <tr key={role} className="border-b border-line-soft/70 last:border-b-0">
                <td className="py-2.5 pr-3 font-semibold">{role}</td>
                <td className="py-2.5 pr-3">{does}</td>
                <td className="py-2.5 pr-3 text-text-muted">{area}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },

  /* ── Yuvaks / Users ── */
  {
    id: 'user-add',
    number: '2.1',
    group: 'Yuvaks',
    title: 'Who Can Add a New Yuvak?',
    text: 'add new yuvak register create user mandal sabha head db manager',
    render: () => (
      <>
        <RoleMatrix rows={[
          { label: 'Add a new Yuvak', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'no', yv: 'no' },
        ]} />
        <Callout>
          <strong>Note:</strong> A new Yuvak is created immediately (no approval needed). Mandal-level Nimit Sevaks can only add into their own Sabha if a Sabha is assigned. A QR code is generated automatically.
        </Callout>
      </>
    ),
  },
  {
    id: 'user-edit',
    number: '2.2',
    group: 'Yuvaks',
    title: "Who Can Edit a Yuvak's Profile / Information?",
    text: 'edit profile information manage user update yuva seva follow-up scope',
    render: () => (
      <>
        <RoleMatrix rows={[
          { label: 'Edit a Yuvak\'s profile', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'limited', yv: 'approval' },
        ]} />
        <Callout>
          <strong>Yuva Seva rule:</strong> If Yuvak <em>B</em>'s follow-up person is set to Yuva Seva <em>A</em>, then <em>A</em> can edit <em>B</em>'s profile directly (no approval). For any other Yuvak, <em>A</em> gets an "outside your scope" error.<br/>
          <strong>Yuvak rule:</strong> Members can only submit their own profile changes, which need approval before taking effect.
        </Callout>
      </>
    ),
  },
  {
    id: 'user-approvals',
    number: '2.3',
    group: 'Yuvaks',
    title: 'Profile Change Requests (Maker–Checker)',
    text: 'change request approval yuvak submit approve reject nimit sevak yuva seva profile edit',
    render: () => (
      <>
        <RoleMatrix rows={[
          { label: 'Submit a change request (for own profile)', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'yes', yv: 'yes' },
          { label: 'Approve someone else\'s request', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'limited', yv: 'no' },
        ]} />
        <Callout>
          <strong>Approval Rule:</strong> Any Nimit Sevak above the requester — or the Yuva Seva assigned to the requester — can approve/reject/correct the change. Until they act, the Yuvak's saved profile is unchanged. Approvers see requests scoped to their hierarchy (Mandal-wide, Sabha-wide, or follow-up only).
        </Callout>
      </>
    ),
  },
  {
    id: 'user-role',
    number: '2.4',
    group: 'Yuvaks',
    title: "Who Can Change a Yuvak's Role?",
    text: 'change role manage user role rank assign hierarchy sabha db manager',
    render: () => (
      <>
        <RoleMatrix rows={[
          { label: 'Change a Yuvak\'s role', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'no', ys: 'no', yv: 'no' },
        ]} />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-soft text-left">
                <th className="table-th py-2 pr-3">Role</th>
                <th className="table-th py-2 pr-3">Roles They Can Assign</th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {[
                ['Mandal Head', 'Mandal DB Mgr, Sabha Head, Sabha DB Mgr, Yuva Seva, Yuvak'],
                ['Mandal DB Manager', 'Sabha Head, Sabha DB Mgr, Yuva Seva, Yuvak'],
                ['Sabha Head', 'Sabha DB Mgr, Yuva Seva, Yuvak'],
              ].map(([role, assigns]) => (
                <tr key={role} className="border-b border-line-soft/70 last:border-b-0">
                  <td className="py-2.5 pr-3 font-semibold">{role}</td>
                  <td className="py-2.5 pr-3">{assigns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Callout>
          <strong>The rule:</strong> You can only assign roles that rank <em>strictly below</em> your own.
        </Callout>
      </>
    ),
  },
  {
    id: 'user-followup',
    number: '2.5',
    group: 'Yuvaks',
    title: 'Who Can Assign a Follow-up Person to a Yuvak?',
    text: 'assign follow up person yuva seva sabha head mandal',
    render: () => (
      <RoleMatrix rows={[
        { label: 'Assign / Change follow-up person', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'no', yv: 'no' },
      ]} />
    ),
  },
  {
    id: 'user-bulk',
    number: '2.6',
    group: 'Yuvaks',
    title: 'Who Can Enable / Disable Yuvaks in Bulk?',
    text: 'bulk activate deactivate status update mass sabha head db manager',
    render: () => (
      <RoleMatrix rows={[
        { label: 'Bulk activate / deactivate', mh: 'no', mdb: 'no', sh: 'yes', sdb: 'yes', ys: 'no', yv: 'no' },
      ]} />
    ),
  },
  {
    id: 'user-qr',
    number: '2.7',
    group: 'Yuvaks',
    title: "Who Can Get / Regenerate a Yuvak's QR Code?",
    text: 'qr code generate download scan attendance',
    render: () => (
      <RoleMatrix rows={[
        { label: 'Generate / regenerate QR code', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'no', yv: 'no' },
      ]} />
    ),
  },

  /* ── Visibility ── */
  {
    id: 'visibility',
    number: '3',
    group: 'Overview',
    title: 'Which Yuvak Information Is Visible to Which Role?',
    text: 'visible see view scope jurisdiction mandal sabha yuva seva follow-up',
    render: () => (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-soft text-left">
              <th className="table-th py-2 pr-3">Role</th>
              <th className="table-th py-2 pr-3">What They See</th>
            </tr>
          </thead>
          <tbody className="text-primary">
            {[
              ['Mandal Head', 'Every Yuvak inside their Mandal (all Sabhas under it)'],
              ['Mandal DB Manager', 'Every Yuvak inside their Mandal'],
              ['Sabha Head', 'Every Yuvak inside their Sabha'],
              ['Sabha DB Manager', 'Every Yuvak inside their Sabha'],
              ['Yuva Seva', 'Only Yuvaks whose follow-up person is set to them'],
              ['Yuvak', 'Only their own record'],
            ].map(([role, sees]) => (
              <tr key={role} className="border-b border-line-soft/70 last:border-b-0">
                <td className="py-2.5 pr-3 font-semibold">{role}</td>
                <td className="py-2.5 pr-3">{sees}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },

  /* ── Org structure ── */
  {
    id: 'org',
    number: '4',
    group: 'Structure',
    title: 'Sabhas, Mandals, Pradeshs (Organisation Structure)',
    text: 'org structure hierarchy pradesh mandal sabha view create edit',
    render: () => (
      <RoleMatrix rows={[
        { label: 'See the org structure (view only)', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'yes', yv: 'no' },
        { label: 'Add a new Pradesh',                 mh: 'no', mdb: 'no',  sh: 'no',  sdb: 'no',  ys: 'no', yv: 'no' },
        { label: 'Edit an existing Pradesh',          mh: 'no', mdb: 'no',  sh: 'no',  sdb: 'no',  ys: 'no', yv: 'no' },
        { label: 'Add a new Mandal',                  mh: 'no', mdb: 'no',  sh: 'no',  sdb: 'no',  ys: 'no', yv: 'no' },
        { label: 'Edit an existing Mandal',           mh: 'no', mdb: 'no',  sh: 'no',  sdb: 'no',  ys: 'no', yv: 'no' },
        { label: 'Add a new Sabha',                   mh: 'yes', mdb: 'yes', sh: 'no',  sdb: 'no',  ys: 'no', yv: 'no' },
        { label: 'Edit an existing Sabha',            mh: 'yes', mdb: 'yes', sh: 'no',  sdb: 'no',  ys: 'no', yv: 'no' },
      ]} />
    ),
  },

  /* ── Transfers ── */
  {
    id: 'transfers',
    number: '5',
    group: 'Movements',
    title: 'Transfers (Moving a Yuvak Between Sabhas)',
    text: 'transfer move sabha request submit accept reject cancel approval nimit sevak',
    render: () => (
      <>
        <RoleMatrix rows={[
          { label: 'View transfers (list, history, pending)',    mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'no', yv: 'no' },
          { label: 'Submit a transfer request',                  mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'no', yv: 'no' },
          { label: 'Accept / Reject / Cancel a transfer request', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'no', yv: 'no' },
        ]} />
        <Callout>
          <strong>⧗ Approval Rule:</strong> Every Sabha transfer requires approval from the receiving side. A transfer request is not effective until the receiving Sabha/Mandal head (or their DB Manager) accepts it. The submitter can cancel it while it is still pending.
        </Callout>
      </>
    ),
  },

  /* ── Events ── */
  {
    id: 'events',
    number: '6',
    group: 'Programmes',
    title: 'Events',
    text: 'event create edit register attend view',
    render: () => (
      <>
        <RoleMatrix rows={[
          { label: 'See events',              mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'yes', yv: 'yes' },
          { label: 'Create / Edit an event',  mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'no',  yv: 'no'  },
          { label: 'Register a Yuvak for an event', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'yes', yv: 'yes' },
        ]} />
        <Callout>No approval is required for creating or editing events.</Callout>
      </>
    ),
  },

  /* ── Jobs ── */
  {
    id: 'jobs',
    number: '7',
    group: 'Programmes',
    title: 'Jobs (Job Portal — Maker–Checker Flow)',
    text: 'jobs job portal post approve pending pause reject close maker checker',
    render: () => (
      <>
        <RoleMatrix rows={[
          { label: 'See job posts (public board)',                    mh: 'yes',      mdb: 'yes',      sh: 'yes',      sdb: 'yes',      ys: 'yes',      yv: 'yes'      },
          { label: 'Create a job post (submits as Pending)',          mh: 'approval', mdb: 'approval', sh: 'approval', sdb: 'approval', ys: 'approval', yv: 'approval' },
          { label: 'Approve / Pause / Reject / Close a job post',     mh: 'yes',      mdb: 'yes',      sh: 'yes',      sdb: 'no',       ys: 'no',       yv: 'no'       },
        ]} />
        <Callout>
          <strong>⧗ Approval Rule:</strong> A job post is not visible on the live board until a Sabha Head, Mandal DB Manager, or Mandal Head approves it.
        </Callout>
      </>
    ),
  },

  /* ── Attendance ── */
  {
    id: 'attendance',
    number: '8',
    group: 'Programmes',
    title: 'Attendance',
    text: 'attendance mark update correct scan sabha meeting present absent vakta topic',
    render: () => (
      <RoleMatrix rows={[
        { label: 'See attendance records',              mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'yes', yv: 'no' },
        { label: 'Mark attendance',                      mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'no',  yv: 'no' },
        { label: 'Correct / update an attendance entry', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'no',  yv: 'no' },
      ]} />
    ),
  },

  /* ── Reports ── */
  {
    id: 'reports',
    number: '9',
    group: 'Programmes',
    title: 'Reports',
    text: 'reports view download export sabha attendance trend absent members special',
    render: () => (
      <>
        <RoleMatrix rows={[
          { label: 'View performance reports',   mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'limited', yv: 'limited' },
          { label: 'Download / export reports',  mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'yes',     yv: 'no'      },
        ]} />
        <Callout>
          <strong>Limited (◐) notes:</strong>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            <li>Yuva Seva sees report data only for their assigned follow-up Yuvaks.</li>
            <li>Yuvak sees report data only for themselves.</li>
          </ul>
        </Callout>
      </>
    ),
  },

  /* ── Yuva Seva Register ── */
  {
    id: 'ys-register',
    number: '10',
    group: 'Programmes',
    title: 'Yuva Seva Register (Follow-up Interactions)',
    text: 'yuva seva register add edit interaction follow up visit call meeting notes',
    render: () => (
      <>
        <RoleMatrix rows={[
          { label: 'Add / Edit a Yuva Seva interaction record', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'yes', yv: 'no' },
        ]} />
        <Callout>
          A record can only be created for a Yuvak whose <strong>follow-up person is set to you</strong>. So in day-to-day use, this is primarily a Yuva Seva activity.
        </Callout>
      </>
    ),
  },

  /* ── Master Data ── */
  {
    id: 'master-data',
    number: '11',
    group: 'Admin',
    title: 'System / Master Data (dropdown values)',
    text: 'master data system dropdown values education job industry country state city view edit add',
    render: () => (
      <RoleMatrix rows={[
        { label: 'View system data (dropdown values)', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'yes', yv: 'no' },
        { label: 'Add / Edit system data',              mh: 'yes', mdb: 'yes', sh: 'no',  sdb: 'no',  ys: 'no',  yv: 'no' },
      ]} />
    ),
  },

  /* ── Logs ── */
  {
    id: 'logs',
    number: '12',
    group: 'Admin',
    title: 'Logs (Audit Trail)',
    text: 'logs audit trail cron activity module jobs events prasangam',
    render: () => (
      <RoleMatrix rows={[
        { label: 'See automated (Cron) job logs',                              mh: 'yes', mdb: 'no',  sh: 'no',  sdb: 'no', ys: 'no',  yv: 'no' },
        { label: 'See member activity logs',                                   mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'yes', ys: 'yes', yv: 'no' },
        { label: 'See module activity logs (Jobs / Events / Prasangam)',       mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'no',  ys: 'no',  yv: 'no' },
      ]} />
    ),
  },

  /* ── Prasangam ── */
  {
    id: 'prasangam',
    number: '13',
    group: 'Programmes',
    title: 'Prasangam',
    text: 'prasangam view add edit pradesh',
    render: () => (
      <>
        <RoleMatrix rows={[
          { label: 'View Prasangam details',    mh: 'no', mdb: 'no', sh: 'no', sdb: 'no', ys: 'no', yv: 'no' },
          { label: 'Add a new Prasangam',        mh: 'no', mdb: 'no', sh: 'no', sdb: 'no', ys: 'no', yv: 'no' },
          { label: 'Edit an existing Prasangam', mh: 'no', mdb: 'no', sh: 'no', sdb: 'no', ys: 'no', yv: 'no' },
        ]} />
        <Callout>Prasangam access is handled at Pradesh level and above and is not available to the six roles covered in this manual.</Callout>
      </>
    ),
  },

  /* ── Access roles ── */
  {
    id: 'access-roles',
    number: '14',
    group: 'Admin',
    title: 'Role & Access Management',
    text: 'role access management add edit user role permissions',
    render: () => (
      <>
        <RoleMatrix rows={[
          { label: 'Add / Edit an Access Role', mh: 'yes', mdb: 'yes', sh: 'yes', sdb: 'no', ys: 'no', yv: 'no' },
        ]} />
        <Callout>Assigning per-user access-rights overrides is handled by SuperAdmin only.</Callout>
      </>
    ),
  },

  /* ── Admin menu ── */
  {
    id: 'admin-menu',
    number: '15',
    group: 'Admin',
    title: 'Admin Menu',
    text: 'admin menu top-level navigation access',
    render: () => (
      <RoleMatrix rows={[
        { label: 'Access the Admin menu (top-level container)', mh: 'yes', mdb: 'no', sh: 'yes', sdb: 'yes', ys: 'yes', yv: 'no' },
      ]} />
    ),
  },

  /* ── Approvals summary ── */
  {
    id: 'approvals-summary',
    number: '16',
    group: 'Overview',
    title: 'All Activities That Need Approval (Maker–Checker)',
    text: 'approval maker checker summary transfer job post profile change',
    render: () => (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-soft text-left">
              <th className="table-th py-2 pr-3">Activity</th>
              <th className="table-th py-2 pr-3">Who Submits (Maker)</th>
              <th className="table-th py-2 pr-3">Who Approves (Checker)</th>
            </tr>
          </thead>
          <tbody className="text-primary">
            {[
              ['Yuvak updates their own profile', 'Yuvak', 'Mandal Head, Mandal DB Manager, Sabha Head, Sabha DB Manager, or the Yuva Seva assigned to that Yuvak'],
              ['Job post goes live', 'Any role — everyone can create a post', 'Sabha Head, Mandal DB Manager, or Mandal Head'],
              ['Transfer a Yuvak to another Sabha', 'Sabha DB Mgr / Sabha Head / Mandal DB Mgr / Mandal Head', "The receiving side's Head or DB Manager"],
            ].map(([act, maker, checker]) => (
              <tr key={act} className="border-b border-line-soft/70 last:border-b-0 align-top">
                <td className="py-2.5 pr-3 font-semibold">{act}</td>
                <td className="py-2.5 pr-3">{maker}</td>
                <td className="py-2.5 pr-3">{checker}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-text-muted">Everything else takes effect immediately without a second person's approval.</p>
      </div>
    ),
  },

  /* ── FAQ ── */
  {
    id: 'faq-users',
    number: '17.1',
    group: 'FAQ',
    title: 'FAQ — Yuvaks',
    text: 'faq add yuvak edit profile approve pending change role bulk qr followup jurisdiction',
    render: () => (
      <>
        <Q>How do I add a new Yuvak?</Q>
        <Steps>
          <li>Open the <strong>Users</strong> menu → click <strong>Add User</strong> / <strong>New Member</strong>.</li>
          <li>Fill in Name, Mobile (10 digits), Date of Birth, Gender, Pincode + Area + City + State + Country.</li>
          <li>Pick a <strong>Category</strong>, a <strong>Role</strong> (defaults to Yuvak), and optionally a <strong>Follow-up Person</strong>.</li>
          <li>Save. Pradesh / Mandal / Sabha are locked to yours — you cannot register a Yuvak into a Sabha you don't run.</li>
        </Steps>

        <Q>I got an error like "Pradesh ID must match Registrar's Pradesh ID". What's wrong?</Q>
        <A>You are trying to register into a Sabha outside your own. Non-SuperAdmin users can only add Yuvaks inside their own Pradesh + Mandal + Sabha.</A>

        <Q>How do I edit a Yuvak's profile?</Q>
        <Steps>
          <li><strong>Users</strong> → search / filter → click the Yuvak.</li>
          <li>Click <strong>Edit</strong>.</li>
          <li>Change fields (role, follow-up, mobile, hierarchy each have their own dedicated action). Save.</li>
          <li>If you are a <strong>Yuva Seva</strong>, this only works for Yuvaks whose Follow-up Person is set to you.</li>
        </Steps>

        <Q>I'm a Yuvak. Why doesn't my profile edit show up right away?</Q>
        <A>Member-submitted changes go through a Nimit Sevak (Sabha or Mandal level) or your Yuva Seva for approval. Once one of them approves, your record is updated.</A>

        <Q>How do I approve someone's pending profile change?</Q>
        <Steps>
          <li>Open <strong>User Info Requests</strong> (the "Approval" tab under Users).</li>
          <li>Filter by <strong>Pending</strong>.</li>
          <li>Click a request → <strong>Approve</strong>, <strong>Reject</strong> with reason, or <strong>Approve with corrections</strong>.</li>
          <li>On approve, the Yuvak's record is updated immediately.</li>
        </Steps>

        <Q>How do I change someone's role?</Q>
        <Steps>
          <li><strong>Users</strong> → open the Yuvak → click <strong>Change Role</strong>.</li>
          <li>Pick the new role. The dropdown only shows roles strictly below your own rank.</li>
          <li>Save. Any per-user access overrides the Yuvak previously held are cleared automatically.</li>
        </Steps>

        <Q>Why does my Change Role dropdown show only Yuva Seva and Yuvak?</Q>
        <A>You are a Sabha Head. Your rank allows assigning ranks strictly below — Sabha DB Manager, Yuva Seva, Yuvak.</A>

        <Q>How do I mass activate / deactivate Yuvaks?</Q>
        <Steps>
          <li>(Sabha Head or Sabha DB Manager only.) <strong>Users</strong> → tick the checkboxes.</li>
          <li>Click <strong>Bulk Status</strong> → choose <strong>Activate</strong> or <strong>Deactivate</strong> → Confirm.</li>
        </Steps>

        <Q>How do I generate a Yuvak's QR code?</Q>
        <Steps>
          <li><strong>Users</strong> → open the Yuvak → <strong>QR Code</strong> button.</li>
          <li>Preview / download / regenerate as needed.</li>
        </Steps>

        <Q>Why don't I see a specific Yuvak in my list?</Q>
        <A>Jurisdiction. Sabha roles see only their Sabha. Mandal roles see their whole Mandal. Yuva Seva sees only Yuvaks whose Follow-up = them. Yuvak sees only themselves.</A>
      </>
    ),
  },
  {
    id: 'faq-attendance',
    number: '17.2',
    group: 'FAQ',
    title: 'FAQ — Attendance',
    text: 'faq attendance mark past date correct fix yuva seva deadline absent report',
    render: () => (
      <>
        <Q>How do I mark attendance for a Sabha meeting?</Q>
        <Steps>
          <li>Open <strong>Attendance</strong> → pick the <strong>Sabha</strong> and the <strong>date</strong>.</li>
          <li>The roster of Yuvaks in that Sabha appears.</li>
          <li>Mark <strong>Present / Absent</strong> for each. Optionally add Vakta and Topic.</li>
          <li>Save.</li>
        </Steps>

        <Q>I marked attendance wrong for a past date. Can I fix it?</Q>
        <A>Yes — you need the Update Attendance Record permission (Sabha Head, Sabha DB Manager, Mandal Head, Mandal DB Manager).</A>
        <Steps>
          <li><strong>Attendance</strong> → filter to the date and Sabha.</li>
          <li>Open the entry → change the values → Save.</li>
        </Steps>

        <Q>Why can't Yuva Seva mark attendance?</Q>
        <A>Yuva Seva has view-only access to attendance. Marking and correcting is limited to Sabha/Mandal Nimit Sevaks.</A>

        <Q>I forgot to mark attendance for last Sunday. Is there a deadline?</Q>
        <A>There is no hard cut-off — attendance for a past date can still be entered. Delayed entries reduce report accuracy, so mark it as soon as you can.</A>

        <Q>Where do I see who has been absent for many weeks?</Q>
        <A>Reports section → <strong>Absent Members Report</strong>. Filter by period, Sabha, and threshold.</A>
      </>
    ),
  },
  {
    id: 'faq-reports',
    number: '17.3',
    group: 'FAQ',
    title: 'FAQ — Reports',
    text: 'faq reports where find available download export yuvak yuva seva empty filter',
    render: () => (
      <>
        <Q>Where do I find reports?</Q>
        <A>Open the <strong>Reports</strong> menu. Data is scoped: Sabha roles see their Sabha; Mandal roles see their Mandal; Yuva Seva sees follow-up Yuvaks only; Yuvak sees only their own record.</A>

        <Q>What reports are available?</Q>
        <A>Typical set: Sabha Report, Special Sabha Report, Absent Members Report, Attendance Trend, Member Directory Export.</A>

        <Q>How do I download a report?</Q>
        <Steps>
          <li><strong>Reports</strong> → pick a report → set filters (date range, Sabha, category).</li>
          <li>Click <strong>Download / Export</strong> — the file (Excel/CSV) is generated and downloaded.</li>
          <li>Every download is audited.</li>
        </Steps>

        <Q>Yuvak — why don't I see a Download button?</Q>
        <A>Yuvak has view-only access to their own row. Downloading exports is not permitted for the Yuvak role.</A>

        <Q>Yuva Seva — what data appears in my reports?</Q>
        <A>Only Yuvaks whose Follow-up Person is set to you.</A>

        <Q>Why is my report empty?</Q>
        <A>Common reasons: filters too narrow, Sabha/Mandal outside your jurisdiction, or no active follow-up Yuvaks in the selected period (if you are a Yuva Seva).</A>
      </>
    ),
  },
  {
    id: 'faq-ys',
    number: '17.4',
    group: 'FAQ',
    title: 'FAQ — Yuva Seva Register',
    text: 'faq yuva seva register interaction follow up owner rule edit past',
    render: () => (
      <>
        <Q>What is the Yuva Seva Register?</Q>
        <A>A log of every follow-up interaction you have with your assigned Yuvaks — visits, calls, meetings, notes.</A>

        <Q>How do I add a follow-up interaction?</Q>
        <Steps>
          <li>Open <strong>Yuva Seva</strong> menu → <strong>Add Interaction</strong>.</li>
          <li>Pick the <strong>Yuvak</strong> (only Yuvaks whose Follow-up = you appear).</li>
          <li>Enter date, type (call / visit / meeting / other), and notes.</li>
          <li>Save.</li>
        </Steps>

        <Q>Can I add an interaction for a Yuvak not on my follow-up list?</Q>
        <A>No. A record can only be written for a Yuvak whose Follow-up Person = you.</A>

        <Q>Can I edit a past interaction?</Q>
        <A>Yes — the same Add / Edit Yuva Seva permission covers both. Open the entry, change the fields, and save.</A>

        <Q>Sabha Head / Mandal Head — can I also add Yuva Seva records?</Q>
        <A>Yes, the permission is available. The follow-up-owner rule still applies — you can only record for Yuvaks whose Follow-up Person = you.</A>

        <Q>I stopped being the follow-up for a Yuvak. Do my old records disappear?</Q>
        <A>No. Old records stay in the register. You just cannot add new ones for that Yuvak.</A>
      </>
    ),
  },
  {
    id: 'faq-transfers',
    number: '17.5',
    group: 'FAQ',
    title: 'FAQ — Transfers & Approvals',
    text: 'faq transfer submit approve reject cancel pending receiving side failed error',
    render: () => (
      <>
        <Q>How do I submit a Transfer?</Q>
        <Steps>
          <li><strong>Transfers</strong> → <strong>New Transfer Request</strong>.</li>
          <li>Pick the <strong>Yuvak</strong>, the <strong>destination Sabha / Mandal / Pradesh</strong>, and add remarks if needed.</li>
          <li>Submit. The request appears on the receiving side's <strong>Pending Transfers</strong> list.</li>
          <li>Until they accept, the Yuvak stays in their current Sabha.</li>
        </Steps>

        <Q>Where do I see pending transfer requests?</Q>
        <A><strong>Transfers</strong> menu → <strong>Pending</strong> tab. Two views: <strong>Incoming</strong> (waiting for you) and <strong>My Requests</strong> (you submitted, still pending).</A>

        <Q>How do I approve or reject an incoming transfer?</Q>
        <Steps>
          <li><strong>Transfers</strong> → <strong>Pending → Incoming</strong>.</li>
          <li>Open the request → review Yuvak details.</li>
          <li><strong>Accept</strong> (optionally assign a Follow-up Person at destination) — the Yuvak moves immediately.</li>
          <li>Or <strong>Reject</strong> with a reason. The requester sees the rejection in <strong>My Requests</strong>.</li>
        </Steps>

        <Q>Can I cancel a transfer I submitted?</Q>
        <A>Yes, while it is still pending. Open <strong>My Requests</strong>, find the pending one, click <strong>Cancel</strong>. Once accepted or rejected, it cannot be cancelled.</A>

        <Q>My transfer request failed with a rank / hierarchy error. Why?</Q>
        <ul className="mt-1 ml-5 list-disc text-sm text-primary">
          <li>The destination Sabha does not belong to the Mandal you chose (broken nesting).</li>
          <li>The Yuvak is inactive — reactivate first.</li>
          <li>The follow-up person you selected is not in the destination Sabha or is not a Yuva Seva or higher.</li>
        </ul>

        <Q>Yuvak / Yuva Seva — can I submit or approve transfers?</Q>
        <A>No. Transfers are restricted to the four Nimit Sevak roles. Yuvaks cannot request their own move.</A>

        <Q>A transfer was accepted but the Yuvak's Sabha is unchanged in my view.</Q>
        <A>Refresh the page. If it still hasn't updated, remember the Yuvak has moved out of the source Sabha's roster.</A>
      </>
    ),
  },
  {
    id: 'faq-jobs',
    number: '17.6',
    group: 'FAQ',
    title: 'FAQ — Jobs (Maker–Checker)',
    text: 'faq jobs post pending approve pause reject close sabha db manager',
    render: () => (
      <>
        <Q>I posted a job — why is it not on the public board?</Q>
        <A>New posts land in <strong>Pending</strong>. A Sabha Head, Mandal DB Manager, or Mandal Head must approve it. Check <strong>My Job Posts</strong> for the status.</A>

        <Q>I'm a Sabha DB Manager — why can I post but not approve?</Q>
        <A>Approval is limited to Sabha Head, Mandal DB Manager, and Mandal Head. Ask one of them to approve.</A>

        <Q>Can a job post be paused or rejected later?</Q>
        <A>Yes — approvers can Pause, Reject, or Close a post at any time. Rejected/closed posts stop accepting applications.</A>
      </>
    ),
  },
  {
    id: 'faq-events',
    number: '17.7',
    group: 'FAQ',
    title: 'FAQ — Events',
    text: 'faq events create edit register',
    render: () => (
      <>
        <Q>How do I create an event?</Q>
        <Steps>
          <li><strong>Events</strong> menu → <strong>Create Event</strong>.</li>
          <li>Fill in name, date, venue, description, and target audience filters.</li>
          <li>Save. Events go live immediately — no approval.</li>
        </Steps>

        <Q>Where is the "Edit" permission for an existing event?</Q>
        <A>There is no separate edit permission — the same "Create / Edit Event" grant covers both.</A>

        <Q>How do I register a Yuvak for an event?</Q>
        <A>Open the event → <strong>Register</strong> → pick the Yuvak. Every role, including Yuvak, can register (Yuvak can register themselves).</A>
      </>
    ),
  },
  {
    id: 'faq-master',
    number: '17.8',
    group: 'FAQ',
    title: 'FAQ — System / Master Data',
    text: 'faq master data system data dropdown values sabha head edit',
    render: () => (
      <>
        <Q>Where do I edit dropdown values (Education, Job Industry, etc.)?</Q>
        <A><strong>Master Data</strong> menu (also called <strong>System Data</strong>).</A>

        <Q>I'm a Sabha Head — can I edit Master Data?</Q>
        <A>No — edit rights are limited to Mandal-level roles. Sabha-level roles have view-only. Ask a Mandal Head or Mandal DB Manager to add the value you need.</A>
      </>
    ),
  },
  {
    id: 'faq-org',
    number: '17.9',
    group: 'FAQ',
    title: 'FAQ — Hierarchy & Organisation',
    text: 'faq mandal pradesh create sabha org structure',
    render: () => (
      <>
        <Q>As a Mandal Head, can I create a new Mandal or Pradesh?</Q>
        <A>No — creating Mandals or Pradeshs is above your role. You <em>can</em> create new Sabhas under your Mandal.</A>
      </>
    ),
  },
  {
    id: 'faq-admin',
    number: '17.10',
    group: 'FAQ',
    title: 'FAQ — Admin Menu',
    text: 'faq admin menu container access roles master data logs',
    render: () => (
      <>
        <Q>What does the Admin menu contain?</Q>
        <A>A top-level container for administrative pages such as Access Roles, Master Data, Logs, and Hierarchy. The items you see inside depend on your other permissions.</A>

        <Q>I don't see the Admin menu — is that expected?</Q>
        <A>Yes for Mandal DB Manager and Yuvak; both do not have access to the Admin container. All other roles do.</A>
      </>
    ),
  },
];

/* Sidebar sections grouped by their `group` field, preserving the array order. */
function groupSections(sections) {
  const order = [];
  const byGroup = {};
  for (const s of sections) {
    if (!byGroup[s.group]) {
      byGroup[s.group] = [];
      order.push(s.group);
    }
    byGroup[s.group].push(s);
  }
  return order.map((g) => ({ group: g, items: byGroup[g] }));
}

export default function HelpPage() {
  const [query, setQuery] = useState('');

  // Filter sections by title/keywords/group, via the app-wide matcher: every
  // typed word must appear somewhere in the section, in any order (see
  // searchMatches). Kept as a memo so a re-render from anywhere else does not
  // re-scan.
  const q = query.trim();
  const visible = useMemo(() => {
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) =>
      searchMatches(`${s.number} ${s.title} ${s.group} ${s.text}`, q),
    );
  }, [q]);

  const grouped = useMemo(() => groupSections(visible), [visible]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header card */}
      <div className="rounded-card border border-line-soft bg-surface shadow-card">
        <div className="flex flex-col gap-4 border-b border-line-soft px-5 py-5 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-50 text-primary">
              <BookOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold leading-tight text-primary">
                Help &amp; FAQ
              </h1>
              <p className="text-sm text-text-muted">
                Who can do what — a plain-English guide. <span className="ml-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary">v{import.meta.env.VITE_APP_VERSION}</span>
              </p>
            </div>
          </div>

          <div className="sm:ml-auto sm:w-72">
            <label htmlFor="help-search" className="sr-only">Search the manual</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
              <input
                id="help-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sections…"
                className="w-full rounded-control border border-line-soft bg-white py-2 pl-9 pr-9 text-sm text-primary outline-none transition-shadow focus:ring-2 focus:ring-accent/40"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-text-muted transition-colors hover:bg-primary-50/60 hover:text-primary"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Legend row — teaches the four cell states once, then never again. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 text-xs text-text-muted">
          <span className="flex items-center gap-1.5"><Cell value="yes" /> Yes</span>
          <span className="flex items-center gap-1.5"><Cell value="no" /> No</span>
          <span className="flex items-center gap-1.5"><Cell value="limited" /> Limited — see note</span>
          <span className="flex items-center gap-1.5"><Cell value="approval" /> Needs approval</span>
        </div>
      </div>

      {/* Two-column layout: sticky sidebar + content */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <nav
            aria-label="Manual sections"
            className="max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-card border border-line-soft bg-surface p-3 shadow-card"
          >
            {grouped.length === 0 ? (
              <p className="px-2 py-4 text-sm text-text-muted">No sections match "{query}".</p>
            ) : grouped.map(({ group, items }) => (
              <div key={group} className="mb-3 last:mb-0">
                <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-text-faint">
                  {group}
                </p>
                <ul className="space-y-0.5">
                  {items.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="flex items-baseline gap-2 rounded-control px-2 py-1.5 text-sm text-primary transition-colors hover:bg-primary-50/50"
                      >
                        <span className="w-9 shrink-0 font-mono text-[11px] text-text-muted">§{s.number}</span>
                        <span className="min-w-0 leading-snug">{s.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-5">
          {visible.length === 0 && (
            <div className="rounded-card border border-line-soft bg-surface p-6 text-center text-sm text-text-muted shadow-card">
              No sections match "{query}". Try a different word — e.g. <em>transfer</em>, <em>attendance</em>, <em>role</em>.
            </div>
          )}

          {visible.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-20 rounded-card border border-line-soft bg-surface p-5 shadow-card"
            >
              <div className="mb-3 flex items-baseline gap-2">
                <span className="font-mono text-xs font-semibold text-text-muted">§{s.number}</span>
                <h2 className="font-display text-lg font-bold text-primary">{s.title}</h2>
              </div>
              {s.render()}
            </section>
          ))}

          <p className="px-1 py-2 text-xs text-text-faint">
            This manual reflects the current permission configuration. Individual users may have per-user overrides applied by SuperAdmin, which override anything shown here.
          </p>
        </div>
      </div>
    </div>
  );
}
