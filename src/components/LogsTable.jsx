import { EmptyState, ErrorState, Skeleton } from './ui';

/**
 * The logs, as a table — every field of a row on screen at once, with the old
 * and new values side by side.
 *
 * A summary card per entry reads better but answers a different question: an
 * audit trail is consulted to find out exactly WHAT changed, so the pair of
 * values is the point of the view and is never truncated behind a "details"
 * click. The table scrolls horizontally rather than dropping columns.
 */

/**
 * Fields dropped from both value columns.
 *
 * `role_change_wipe` ("Role Change Wipe: Role_id=7, Wiped=2") is bookkeeping the
 * backend emits when changing a member's role clears their per-user permission
 * overrides. It reports a COUNT, not what changed, so it tells a reader nothing
 * actionable while crowding out the role change it accompanies.
 *
 * Compared on the normalized label, so it matches whatever casing the backend
 * title-cases it into.
 */
const HIDDEN_FIELDS = new Set(['role change wipe']);

const isHiddenField = (field) =>
  HIDDEN_FIELDS.has(String(field ?? '').trim().toLowerCase());

/**
 * Labels that name the SAME thing under different backend field names.
 *
 * A transfer writes the follow-up person twice under one request uuid:
 * `followup_id` on `user_transfer_notifications` and `followup_by_id` on
 * `users`. The backend labels those "Followup" and "Followup By", so they are
 * not exact repeats and survived the duplicate filter — the reader saw the same
 * name on two consecutive lines.
 *
 * Grouping them under one key collapses the pair, and also lets the old/new
 * comparison match a value that arrives under one name on one side and the
 * other name on the other.
 */
const FIELD_ALIASES = new Map([
  ['followup', 'followup'],
  ['followup by', 'followup'],
]);

/** The key a field is deduped and compared under. */
const canonicalField = (field) => {
  const norm = String(field ?? '').trim().toLowerCase();
  return FIELD_ALIASES.get(norm) ?? norm;
};

/**
 * Split a merged "Field: value" blob into its entries.
 *
 * The backend joins with ", " but VALUES THEMSELVES CONTAIN COMMAS — "Akshar
 * Yuvak Mandal, Dahisar" is one value, not two entries — so a plain comma split
 * shreds them. Entries are separated on a newline, or on a comma only where what
 * follows looks like a new `Field:` label.
 */
export function parseFields(value) {
  if (!value) return [];
  const parts = String(value)
    .split(/\r?\n|,\s*(?=[^,:\n]{1,80}:)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf(':');
      if (at === -1) return { field: part, detail: null, raw: part };
      return {
        field: part.slice(0, at).trim(),
        detail: part.slice(at + 1).trim(),
        raw: part,
      };
    });

  // Drop exact repeats.
  //
  // One logical change is often recorded against TWO tables — a Sabha transfer
  // writes `sabha_id` to both `user_transfer_notifications` and `users` under the
  // same request uuid — so the backend, which merges every row in the group,
  // emits "Sabha: A, Sabha: A". That is one change reported twice, not two.
  //
  // Keyed on field AND value, so a field that genuinely carries two different
  // values in one group still shows both; only identical repeats collapse.
  const seen = new Set();
  return parts.filter((p) => {
    if (isHiddenField(p.field)) return false;
    const key = `${canonicalField(p.field)}\u0000${p.detail ?? p.raw}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Only what actually changed.
 *
 * A transfer logs the whole hierarchy on both sides — Pradesh, Mandal and Sabha
 * — even when just the Sabha moved. Printing all three twice buries the one line
 * that matters, so a field carrying the same value on both sides is dropped from
 * BOTH columns and only the differing ones survive.
 *
 * Fields present on one side only always survive: an added or removed field is a
 * change. Unlabelled fragments are compared whole.
 */
export function diffValues(oldValue, newValue) {
  const oldParts = parseFields(oldValue);
  const newParts = parseFields(newValue);

  // Looked up by canonical key, so "Followup" on one side matches "Followup By"
  // on the other instead of both surviving as changes.
  const valueOf = (parts, key) => {
    const hit = parts.find((p) => canonicalField(p.field) === key);
    return hit ? hit.detail ?? hit.raw : undefined;
  };

  const differs = (part, others) => {
    const other = valueOf(others, canonicalField(part.field));
    if (other === undefined) return true; // only on this side
    return other !== (part.detail ?? part.raw);
  };

  return {
    oldParts: oldParts.filter((p) => differs(p, newParts)),
    newParts: newParts.filter((p) => differs(p, oldParts)),
  };
}

/**
 * A role field, by its rendered label.
 *
 * The backend turns `role_id` into the label "Role" and `from_role_id` into
 * "From Role", so matching the tail is what catches every variant.
 */
const isRoleField = (field) => /(^|\s)role$/i.test(String(field ?? '').trim());

/**
 * Show the role's name where the log recorded its id.
 *
 * The endpoint resolves pradesh / mandal / sabha / user ids to names but its
 * `_FK_ENTITY` map has no entry for `role_id`, so a role change arrives as
 * "Role: 7". Anything not a bare number is left alone (a name already resolved
 * upstream must not be mangled), and an unknown id falls back to itself rather
 * than being blanked.
 */
function displayValue(part, roleNames) {
  const raw = part.detail;
  if (raw == null) return raw;
  if (!isRoleField(part.field) || !roleNames) return raw;
  if (!/^\d+$/.test(raw.trim())) return raw;
  return roleNames.get(Number(raw.trim())) ?? raw;
}

/**
 * State words that carry a verdict, and the colour that says so.
 *
 * Colour is applied by MEANING, not by column. Tinting the whole "old" column
 * red made every ordinary rename read as an error; colouring only the words that
 * genuinely describe an on/off state — Granted, Denied, Active, Inactive — makes
 * a permission change scannable without misreporting anything else.
 */
const STATE_TONE = new Map([
  ['granted', 'text-success-fg'], ['denied', 'text-danger-fg'],
  ['active', 'text-success-fg'], ['inactive', 'text-danger-fg'],
  ['approved', 'text-success-fg'], ['rejected', 'text-danger-fg'],
  ['cancelled', 'text-danger-fg'], ['requested', 'text-primary'],
  ['enabled', 'text-success-fg'], ['disabled', 'text-danger-fg'],
  ['yes', 'text-success-fg'], ['no', 'text-danger-fg'],
  ['true', 'text-success-fg'], ['false', 'text-danger-fg'],
  ['present', 'text-success-fg'], ['absent', 'text-danger-fg'],
]);

const stateTone = (value) =>
  STATE_TONE.get(String(value ?? '').trim().toLowerCase()) ?? '';

/**
 * One treatment everywhere: the FIELD LABEL is grey, the VALUE is body colour —
 * except state words, which take their verdict colour (see STATE_TONE).
 */
function ValueCell({ parts, roleNames }) {
  if (!parts?.length) return <span className="text-sm text-text-faint">—</span>;

  return (
    <div className="space-y-0.5">
      {parts.map((part, i) => (
        <div key={`${part.field}-${i}`} className="break-words text-sm leading-snug text-primary">
          {part.detail !== null ? (
            <>
              <span className="text-text-muted">{part.field}: </span>
              <span className={stateTone(displayValue(part, roleNames))}>
                {displayValue(part, roleNames)}
              </span>
            </>
          ) : (
            <span className={stateTone(part.raw)}>{part.raw}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * What the entry is ABOUT — not always a member.
 *
 * A permission-sync record changes a ROLE, not a person: the backend leaves
 * `user_name` empty on those and fills `role_name` instead. Printing user_name
 * regardless left the column showing "—" for exactly the rows where the subject
 * was most obvious.
 *
 * Falls back the other way too, so a category that carries only one of the two
 * still names its subject.
 */
function subjectOf(row) {
  const isRoleEntry = String(row?.category ?? '').toLowerCase().includes('role');
  const name = isRoleEntry ? row.role_name ?? row.user_name : row.user_name ?? row.role_name;
  return {
    name: name ?? '—',
    // Says WHICH kind of thing was named, so "Sabha Head" is not mistaken for a
    // person's name sitting in the same column.
    kind: isRoleEntry && row.role_name ? 'Role' : null,
  };
}

function when(value) {
  if (!value) return { date: '—', time: '' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: String(value), time: '' };
  return {
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

/**
 * Who acted, on one line beneath the member's name.
 *
 * The backend routes the actor into one of four fields depending on what
 * happened, so all four are read and labelled — a request that was then approved
 * carries two, and showing only the first would credit the wrong person.
 *
 * Rendered inside the Member cell rather than in a column of its own: it is
 * about that member's record, and most rows carry one actor at most.
 */
function ActorLine({ row }) {
  const actors = [
    ['Requested', row.requested_by],
    ['Approved', row.approved_by],
    ['Rejected', row.rejected_by],
    ['Cancelled', row.cancelled_by],
  ].filter(([, who]) => who);

  if (!actors.length) return null;

  return (
    // One step below the row's own text: the actor qualifies the entry rather
    // than being the entry, so it sits under the name without competing with it.
    <div className="mt-0.5 text-xs leading-snug text-text-muted">
      {actors.map(([label, who], i) => (
        <span key={label}>
          {/* Separator only BETWEEN actors — the leading dash read as a bullet
              for a list that usually has one item. */}
          {i > 0 && ' / '}
          {label}: <span className="text-text-muted">{who}</span>
        </span>
      ))}
    </div>
  );
}

// The shared `.table-th` sets `whitespace-nowrap`; on a narrow phone the longest
// header ("Date & Time") then overflows its fixed-percentage column and drags a
// horizontal scrollbar onto the whole table. Let headers wrap below `sm` and only
// hold to one line once there is room for it.
const TH = 'table-th px-3 py-2.5 whitespace-normal sm:whitespace-nowrap';
const TD = 'px-3 py-3 align-top';

/**
 * `widths` is an optional list of CSS widths, one per column.
 *
 * Supplied through a <colgroup> with `table-fixed`, because auto layout sizes
 * columns by their CONTENT — which gives the widest share to whichever column
 * happens to hold the longest unbroken string, not to the one that matters.
 * Without it the cron table's execution log, the column most worth reading, was
 * squeezed by short cells beside it.
 */
function Shell({ headers, minWidth, widths, children }) {
  return (
    <div className="overflow-hidden rounded-card border border-line-soft bg-surface shadow-card">
      <div className="overflow-x-auto">
        {/* `minWidth` is opt-in. A table that declares one always scrolls once
            the viewport is narrower than it, so a table whose columns can wrap
            should not declare one at all. */}
        <table
          className={`w-full border-collapse text-left ${widths ? 'table-fixed' : ''}`}
          style={minWidth ? { minWidth } : undefined}
        >
          {widths && (
            <colgroup>
              {widths.map((w, i) => (
                <col key={headers[i] ?? i} style={{ width: w }} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function States({ query, rows, headers, minWidth, emptyHint }) {
  if (query.isLoading) {
    return (
      <Shell headers={headers} minWidth={minWidth}>
        {Array.from({ length: 5 }, (_, i) => (
          <tr key={i} className="border-b border-line-soft last:border-0">
            {headers.map((h) => (
              <td key={h} className={TD}><Skeleton className="h-3 w-20" /></td>
            ))}
          </tr>
        ))}
      </Shell>
    );
  }
  if (query.error) {
    return (
      <div className="card">
        <ErrorState error={query.error} onRetry={query.refetch} title="Couldn’t load the logs" />
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="card">
        <EmptyState title="Nothing logged" hint={emptyHint} />
      </div>
    );
  }
  return null;
}

/**
 * Four columns, both variants.
 *
 *   Category · Old Value · New Value · Date & Time
 *
 * The first column carries everything that identifies the entry — what kind of
 * change it was, what it was about, its workflow status, and who did it. They
 * were separate columns, but "Role & Permission" and "Sabha Head" are one fact
 * read together, and splitting them left two narrow columns of short strings
 * while the values — the reason the page exists — were squeezed.
 *
 * What appears there differs by variant. Module logs record changes to org
 * CONTENT (job posts, events, prasangam), so they carry no member or role and no
 * approval workflow: subject and status simply do not render.
 */
const HEADERS = ['Category', 'Old Value', 'New Value', 'Date & Time'];

// The identity column is wider than a category name needs, because it stacks up
// to four lines; the two value columns take the rest.
const WIDTHS = ['26%', '28%', '28%', '18%'];

export function ActivityLogsTable({ rows, query, emptyHint, roleNames, variant = 'activity' }) {
  const isModule = variant === 'module';

  const state = States({ query, rows, headers: HEADERS, emptyHint });
  if (state) return state;

  return (
    <Shell headers={HEADERS} widths={WIDTHS}>
      {rows.map((row, i) => {
        const t = when(row.datetime);
        const subject = subjectOf(row);
        const { oldParts, newParts } = diffValues(row.old_value, row.new_value);
        return (
          <tr key={row.id ?? i} className="border-b border-line-soft last:border-0">
            {/* Everything that identifies the entry, stacked: what kind of
                change, what it was about, its status, and who did it. */}
            <td className={TD}>
              {/* Same size and weight as the value cells — the three read as one
                  sentence across the row, so none of them shouts over the others. */}
              <div className="text-sm leading-snug text-primary">{row.category ?? '—'}</div>
              {!isModule && subject.name !== '—' && (
                // "For:" labels who or what the change was applied to, and is
                // styled identically to the actor line below it — both are
                // qualifiers hanging off the category, so they read as one block
                // rather than as two facts of differing weight.
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs leading-snug text-text-muted">
                  <span>For: {subject.name}</span>
                  {subject.kind && (
                    <span className="rounded-full bg-primary-50 px-1.5 py-0.5 text-xs font-semibold text-primary">
                      {subject.kind}
                    </span>
                  )}
                </div>
              )}
              <ActorLine row={row} />
            </td>
            <td className={TD}>
              <ValueCell parts={oldParts} roleNames={roleNames} />
            </td>
            <td className={TD}>
              <ValueCell parts={newParts} roleNames={roleNames} />
            </td>
            <td className={TD}>
              <div className="text-xs font-semibold text-primary sm:whitespace-nowrap">{t.date}</div>
              <div className="text-xs text-text-muted sm:whitespace-nowrap">{t.time}</div>
            </td>
          </tr>
        );
      })}
    </Shell>
  );
}

// Job carries three facts about the same run — which job, how it ended, and who
// ran it — so they sit in one cell rather than three columns that repeat the
// same subject. Date is last, matching the activity table.
//
// No min-width: four columns, all of which wrap, so forcing one only guaranteed
// a horizontal scrollbar at ordinary window sizes.
const CRON_HEADERS = ['Job', 'Affected', 'Execution Log', 'Date & Time'];

// Execution Log gets half the table. It is the only free-text column here — the
// other three hold a name, a short list and a timestamp, all of which are
// readable narrow — so the space belongs to the one that actually needs it.
const CRON_WIDTHS = ['20%', '20%', '48%', '12%'];

/**
 * System (cron) logs are a different row entirely — a job run, not a field
 * change — so they get their own columns rather than being forced into the
 * activity shape with most cells empty.
 */
export function CronLogsTable({ rows, query, emptyHint }) {
  const state = States({ query, rows, headers: CRON_HEADERS, emptyHint });
  if (state) return state;

  return (
    <Shell headers={CRON_HEADERS} widths={CRON_WIDTHS}>
      {rows.map((row, i) => {
        const t = when(row.datetime);
        const entries = row.entries ?? [];
        return (
          <tr key={row.id ?? i} className="border-b border-line-soft last:border-0">
            <td className={`${TD} sm:min-w-[12rem]`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm leading-snug text-primary">{row.type ?? '—'}</span>
                {/* `status` here is a boolean run outcome, not the activity log's
                    Requested/Approved wording. */}
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-sm font-semibold ${
                    row.status ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'
                  }`}
                >
                  {row.status ? 'Success' : 'Failed'}
                </span>
              </div>
              {row.run_by && (
                // Same treatment as the activity table's actor line — one step
                // down, grey, normal weight. It answers the same question ("who
                // did this"), so it should not look like a different kind of fact.
                <div className="mt-0.5 text-xs leading-snug text-text-muted">
                  Run by: <span className="text-text-muted">{row.run_by}</span>
                </div>
              )}
            </td>
            <td className={TD}>
              {entries.length === 0 ? (
                <span className="text-sm text-text-faint">—</span>
              ) : (
                <div className="space-y-0.5">
                  {/* A run can touch hundreds of rows; showing a few and saying
                      how many more beats an unreadable wall. */}
                  {entries.slice(0, 3).map((e) => (
                    <div key={e.id} className="text-sm leading-snug text-primary">
                      {e.user_name || e.sabha_name || e.entity_type}
                      <span className="text-text-faint"> · {e.status}</span>
                    </div>
                  ))}
                  {entries.length > 3 && (
                    <div className="text-sm text-text-faint">+{entries.length - 3} more</div>
                  )}
                </div>
              )}
            </td>
            <td className={TD}>
              {row.execution_logs ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-snug text-primary">
                  {row.execution_logs}
                </p>
              ) : (
                <span className="text-sm text-text-faint">—</span>
              )}
            </td>
            <td className={TD}>
              <div className="text-xs font-semibold text-primary sm:whitespace-nowrap">{t.date}</div>
              <div className="text-xs text-text-muted sm:whitespace-nowrap">{t.time}</div>
            </td>
          </tr>
        );
      })}
    </Shell>
  );
}
