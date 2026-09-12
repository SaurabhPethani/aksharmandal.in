import { useState } from 'react';
import { ChevronDown, HeartHandshake, Search } from 'lucide-react';
import { usePermissions, useYuvaSevaReport } from '../hooks';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { Breadcrumbs } from '../components/Navigation';
import YuvaSevaDialog from '../components/yuva-seva/YuvaSevaDialog';
import ForbiddenPage from './ForbiddenPage';
import { ACTIONS } from '../constants/permissions';
import { formatNumber } from '../utils/format';
import { searchMatches } from '../utils/options';

// Yuva Seva — the caller's follow-up worklist.
//
//   the rows        GET /api/v1/reports/yuva-seva-report
//   Add Yuva Seva   POST /api/v1/yuva-seva          (YUVA_SEVA:ADD)
//
// The report is the whole screen: it already carries each member's latest
// interaction, how stale it is, the counts and the priority, so the list
// endpoint is not read and nothing is paged locally.
//
// SCOPE. A plain Yuva Seva user sees only their own assigned members, and their
// screen is exactly as it always was. A Sabha / Mandal Head sees every
// followed-up member of their Sabha / Mandal — and only then does the screen
// grow the extra detail: WHO the member is assigned to (`assigned_to`, tagged
// "You" for the Head's own), WHO logged the latest seva (`followup_user_name`,
// the creator — possibly the Head, not the assigned person), and a Mine / All
// toggle. That "there are other people's rows here" test is `hasOthers` below;
// it gates every bit of the extra chrome.
//
// The endpoint answers a non-standard envelope — four totals beside `data` —
// but those totals are for the FULL scope, so the tiles are recomputed from the
// visible rows instead, keeping them in step with the toggle.

/**
 * The four KPI tiles summarising the visible rows:
 *   members    — how many members are on this list
 *   distinct15 — unique Yuvak contacted in the last 15 days
 *   distinct30 — unique Yuvak contacted in the last 30 days
 *   yesterday  — Yuva Seva records logged yesterday
 * One member seen three times yesterday counts 1 toward distinct and 3 toward
 * the yesterday record total.
 */
const TOTALS = [
  { key: 'members', label: 'Total Members', unit: 'On follow-up' },
  { key: 'distinct15', label: 'Unique Yuvak · 15 days', unit: 'Contacted' },
  { key: 'distinct30', label: 'Unique Yuvak · 30 days', unit: 'Contacted' },
  { key: 'yesterday', label: 'Yuva Seva Yesterday', unit: 'Follow-up Records' },
];

/** Sum + distinct over the rows currently shown, so the tiles match the toggle. */
function summarise(rows) {
  let count15 = 0, count30 = 0, distinct15 = 0, distinct30 = 0, yesterday = 0;
  for (const r of rows) {
    const c15 = Number(r.last_15_days) || 0;
    const c30 = Number(r.last_1_month) || 0;
    count15 += c15;
    count30 += c30;
    if (c15 > 0) distinct15 += 1;
    if (c30 > 0) distinct30 += 1;
    yesterday += Number(r.yesterday_count) || 0;
  }
  return { members: rows.length, count15, distinct15, count30, distinct30, yesterday };
}

/**
 * Priority is the API's own word, and it is what colours the row: a member
 * nobody has reached is High and reads red, one seen recently is Low and reads
 * green. Derived from the word rather than matched against a fixed list, so an
 * unfamiliar priority still renders — just without a colour.
 */
function tone(priority) {
  const v = String(priority ?? '').toLowerCase();
  // `dot` is the phone accordion's closed-row marker. Stated here rather than
  // sliced off the front of `chip`: those two happen to share a colour today,
  // and a split(' ')[0] would keep agreeing right up until one of them changed.
  if (v.includes('high') || v.includes('urgent')) return { text: 'text-danger-fg', chip: 'bg-danger-bg text-danger-fg', dot: 'bg-danger-fg' };
  if (v.includes('medium') || v.includes('mid')) return { text: 'text-[#B45309]', chip: 'bg-[#FEF3E2] text-[#B45309]', dot: 'bg-[#B45309]' };
  if (v.includes('low')) return { text: 'text-success-fg', chip: 'bg-success-bg text-success-fg', dot: 'bg-success-fg' };
  return { text: 'text-primary', chip: 'bg-primary-50 text-primary', dot: 'bg-primary' };
}

/** "2025-11-22" -> "22 Nov 2025", without a timezone shifting the day. */
function shortDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

/** A small "You" pill, for the Head's own rows in a mixed list. */
function YouTag() {
  return (
    <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
      You
    </span>
  );
}

/**
 * A small Sabha pill beside the member's name — same idea as `YouTag`, for the
 * Sabha the member belongs to. Shown only when the list spans more than one
 * Sabha (a Mandal Head and above), where it tells otherwise-identical rows
 * apart; a Sabha Head's single-Sabha list never shows it. The Sabha name is a
 * proper noun, so unlike "You" it is not upper-cased, and it truncates rather
 * than widening the row.
 */
function SabhaTag({ name }) {
  if (!name) return null;
  return (
    <span className="inline-block max-w-[11rem] truncate rounded-full bg-primary-50 px-2 py-0.5 align-middle text-[10px] font-semibold text-primary">
      {name}
    </span>
  );
}

/**
 * One member on a phone: the name, and everything else a tap away.
 *
 * THE NAME IS THE CONTROL. It is what someone scans this list for, so it is what
 * opens the row — not a chevron they have to aim at.
 *
 * `showAssigned` adds the "Assigned to" fact and the "You" pill; `showCreator`
 * adds the "Last logged by" fact. Both are on only for a Head. In the "My
 * follow-ups" tab every row is the Head's own, so `showAssigned` is off there —
 * "Assigned to: You" on every row says nothing — while `showCreator` stays,
 * since a Head's ad-hoc seva means the logger can differ. For a plain Yuva Seva
 * user neither appears and the row reads exactly as it always did.
 */
function MemberAccordion({ row, canAdd, onAdd, showAssigned, showCreator, showSabha }) {
  const [open, setOpen] = useState(false);
  const t = tone(row.priority);
  const last = shortDate(row.date);
  const creator = row.followup_user_name || null;
  // The closed-row summary the request asked for: "date · creator", or Never.
  const summary = last ? [last, creator].filter(Boolean).join(' · ') : 'Never';

  const facts = [
    ...(showSabha
      ? [{ label: 'Sabha', value: row.sabha_name || '—', className: 'text-primary' }]
      : []),
    ...(showAssigned
      ? [{
          label: 'Assigned to',
          value: row.is_mine ? 'You' : (row.assigned_to || '—'),
          className: row.is_mine ? 'font-semibold text-accent' : 'text-primary',
        }]
      : []),
    // "Never" is a fact worth reading in red — it is the whole reason a member
    // is at the top of this list.
    { label: 'Last seva', value: last ?? 'Never', className: last ? 'text-primary' : 'font-semibold text-danger-fg' },
    ...(showCreator
      ? [{ label: 'Last logged by', value: creator ?? '—', className: 'text-primary' }]
      : []),
    { label: 'Days ago', value: row.days_prior ?? '—', className: `tnum font-semibold ${t.text}` },
    { label: 'Last 15 days', value: formatNumber(row.last_15_days ?? 0), className: `tnum font-semibold ${t.text}` },
    { label: 'Last 30 days', value: formatNumber(row.last_1_month ?? 0), className: `tnum font-semibold ${t.text}` },
  ];

  return (
    <div className="overflow-hidden rounded-card border border-line-soft bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-primary-50/40"
      >
        <span className={`h-3 w-3 shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-primary">{row.user_name}</span>
            {showAssigned && row.is_mine && <YouTag />}
            {showSabha && <SabhaTag name={row.sabha_name} />}
          </span>
          {/* Name · date · creator, always — the one line the row is scanned for
              on a phone, whether or not the Head-scope columns are in play. */}
          <span className={`mt-0.5 block truncate text-xs ${last ? 'text-text-muted' : 'font-semibold text-danger-fg'}`}>
            {summary}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-line-soft px-4 py-3">
          <dl className="space-y-2">
            {facts.map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-text-muted">{f.label}</dt>
                <dd className={`text-sm ${f.className}`}>{f.value}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-text-muted">Priority</dt>
              <dd>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${t.chip}`}>
                  {row.priority}
                </span>
              </dd>
            </div>
          </dl>

          {/* Only with YUVA_SEVA:ADD — the grant POST /yuva-seva itself requires.
              Full width: it is the one thing to DO on an opened row, and a thumb
              should not have to find it. */}
          {canAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-3 w-full rounded-control border border-accent/40 bg-accent/5 px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
            >
              + Add Yuva Seva
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function YuvaSevaPage({ module }) {
  const { can } = usePermissions();
  const moduleName = module?.name ?? 'YUVA_SEVA';

  // Same rule as ModulePage: READ gates the screen only where the module
  // declares a READ action. YUVA_SEVA declares ADD alone, so a hardcoded READ
  // check would black the page out for every role that has it.
  const hasReadAction = Boolean(module?.actions?.READ);
  const mayRead = hasReadAction ? can(moduleName, ACTIONS.READ) : true;

  if (!mayRead) {
    return <ForbiddenPage message={`Viewing ${module?.label ?? 'Yuva Seva'} requires its Read permission.`} />;
  }
  return <YuvaSeva module={module} moduleName={moduleName} />;
}

function YuvaSeva({ module, moduleName }) {
  const { can } = usePermissions();
  const { data, isLoading, error, refetch } = useYuvaSevaReport();
  /** The member a follow-up is being logged against, or null. */
  const [adding, setAdding] = useState(null);
  /** 'all' shows the whole scope; 'mine' filters to the caller's own rows. */
  const [scope, setScope] = useState('all');
  /** Free-text member search — only surfaced once the list grows past 25 rows. */
  const [query, setQuery] = useState('');

  const canAdd = can(moduleName, ACTIONS.ADD);
  const allRows = Array.isArray(data?.data) ? data.data : [];

  // The one test that turns on all the Head-scope chrome: does the list hold
  // rows that are not the caller's own? For a plain Yuva Seva user it never
  // does, so their screen stays exactly as before.
  const hasOthers = allRows.some((r) => !r.is_mine);
  const scopedRows = hasOthers && scope === 'mine' ? allRows.filter((r) => r.is_mine) : allRows;

  // "Assigned to" (and the "You" tag inside it) only earns its place when the
  // list actually MIXES the caller's own follow-ups with others' — i.e. a Head
  // on the "All in scope" tab. On the "My follow-ups" tab every row is the
  // caller's own, so the column would read "You" on every line and say nothing;
  // it is dropped there. "Logged by" stays on `hasOthers`: even among the
  // caller's own members, a Head's ad-hoc seva means the logger can differ.
  const showAssigned = hasOthers && scope !== 'mine';

  // A Sabha tag beside each member, for a Mandal Head and above — detected,
  // like `hasOthers`, from the data rather than a role id: the list spans more
  // than one Sabha. A Sabha Head's list is a single Sabha (tag adds nothing) and
  // a plain Yuva Seva user has no others, so `hasOthers` keeps them both out.
  // Based on `allRows` so it is stable across the Mine / All toggle and search.
  const showSabha = hasOthers && new Set(allRows.map((r) => r.sabha_name).filter(Boolean)).size > 1;

  // A long list is hard to scan for one name, so past 25 rows a search box
  // appears and free-filters the list by member — and, in a Head's mixed list,
  // by who it is assigned to or who logged the seva. The threshold is measured
  // on the scoped list (so the Mine/All toggle can make the box come and go),
  // and the box is hidden entirely below it.
  const showSearch = scopedRows.length > 25;
  // Free search over the MEMBER NAME ONLY, via the one app-wide matcher
  // (`searchMatches`): every typed word must appear somewhere in the name, in
  // any order — so "Amit Gordhan Limbasia" is found by "amit", "lim", "gordhan",
  // "amit limbasia", "limbasia amit". Deliberately NOT the "Assigned to" /
  // "Logged by" columns: searching "amit limbasia" must find the member Amit
  // Limbasia, not every member assigned to or logged by them.
  const q = showSearch ? query.trim() : '';
  const searching = q.length > 0;
  const rows = searching
    ? scopedRows.filter((r) => searchMatches(r.user_name, q))
    : scopedRows;

  // The KPI tiles summarise the whole scope — they are the section's headline,
  // not a readout of the search — so they stay on `scopedRows`. Only the list
  // and its Total row follow the query, via `footer`.
  const totals = summarise(scopedRows);
  const footer = summarise(rows);
  const total15 = footer.count15;
  const total30 = footer.count30;

  const headers = [
    { label: 'Member', align: 'left' },
    ...(showAssigned ? [{ label: 'Assigned to', align: 'left' }] : []),
    { label: 'Last seva', align: 'left' },
    ...(hasOthers ? [{ label: 'Logged by', align: 'left' }] : []),
    { label: 'Days ago', align: 'right' },
    { label: '15 days', align: 'right' },
    { label: '30 days', align: 'right' },
    { label: 'Priority', align: 'left' },
    { label: '', align: 'right' },
  ];
  // The Total row's member-count text spans everything between "Total" and the
  // two count totals: {Assigned to?, Last seva, Last logged by?, Days ago} — so
  // 2 fixed columns plus whichever of Assigned-to / Logged-by are shown.
  const totalTextSpan = 2 + (showAssigned ? 1 : 0) + (hasOthers ? 1 : 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={module?.label ?? 'Yuva Seva'}
        breadcrumbs={<Breadcrumbs items={[{ label: module?.label ?? 'Yuva Seva' }]} />}
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TOTALS.map((t) => <Skeleton key={t.key} className="h-[104px] w-full" />)}
        </div>
      ) : error ? (
        <div className="card">
          <ErrorState error={error} onRetry={refetch} title="Could not load the Yuva Seva report" />
        </div>
      ) : (
        <>
          {/* A Head with other members' rows gets to narrow the whole screen to
              their own follow-ups. The tiles and totals below follow the choice. */}
          {hasOthers && (
            <div className="inline-flex rounded-control border border-line-soft bg-surface p-0.5 text-sm">
              {[
                { key: 'all', label: 'All in scope' },
                { key: 'mine', label: 'My follow-ups' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setScope(opt.key)}
                  className={`rounded-control px-3 py-1.5 font-semibold transition-colors ${
                    scope === opt.key ? 'bg-primary text-white' : 'text-text-muted hover:text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* TWO ACROSS ON A PHONE, not one. Four figures stacked one per row
              pushed the list they summarise off the bottom of the screen before
              it had been seen. They are short numbers under short labels, which
              is what a half-width tile is for. */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {TOTALS.map((total) => (
              <div key={total.key} className="overflow-hidden rounded-card border border-line-soft bg-surface">
                <div className="flex min-h-[3.25rem] items-center justify-center bg-primary px-3 py-2">
                  {/* Wraps rather than truncates: at half width "Yuvak contacted
                      · 15 days" would read "Yuvak contact…", which names nothing.
                      `min-h` keeps the four headers on one baseline whether the
                      label takes one line or two. */}
                  <p className="text-center text-[11px] font-bold uppercase leading-tight tracking-wider text-white">
                    {total.label}
                  </p>
                </div>
                <div className="px-3 py-4 text-center">
                  <p className="tnum font-display text-3xl font-bold leading-none text-primary">
                    {formatNumber(totals[total.key] ?? 0)}
                  </p>
                  <p className="mt-1.5 text-xs leading-tight text-text-muted">{total.unit}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Past 25 rows, a lookup box for the list. Kept above the empty/list
              branch so it stays on screen — and clearable — when a query matches
              nobody. */}
          {showSearch && (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search member by name…"
                aria-label="Search members by name"
                className="w-full rounded-control border border-line-soft bg-surface py-2.5 pl-9 pr-3 text-sm text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
          )}

          {rows.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={HeartHandshake}
                title={searching ? 'No member matches your search' : 'No follow-ups to show'}
                hint={
                  searching
                    ? `No member matches “${query.trim()}”.`
                    : hasOthers && scope === 'mine'
                      ? 'None of these members are assigned to you.'
                      : 'Nobody is assigned to you for Yuva Seva yet.'
                }
              />
            </div>
          ) : (
            <>
              {/* PHONES GET AN ACCORDION, NOT A SIDEWAYS TABLE. The name opens the
                  row — which is the thing being looked up — and everything the
                  table's other columns held is inside it. */}
              <div className="space-y-2 md:hidden">
                {/* The table's total row, as its own card. */}
                <div className="rounded-card border border-line-soft bg-bg/60 px-4 py-3">
                  <p className="text-sm font-bold text-primary">
                    {formatNumber(rows.length)} member{rows.length === 1 ? '' : 's'} on follow-up
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    <span className="tnum font-semibold text-primary">{formatNumber(total15)}</span> in 15 days ·{' '}
                    <span className="tnum font-semibold text-primary">{formatNumber(total30)}</span> in 30 days
                  </p>
                </div>

                {rows.map((row, i) => (
                  <MemberAccordion
                    key={row.user_id ?? i}
                    row={row}
                    canAdd={canAdd}
                    showAssigned={showAssigned}
                    showCreator={hasOthers}
                    showSabha={showSabha}
                    onAdd={() => setAdding(row)}
                  />
                ))}
              </div>

              {/* Its own scroll container from `md` up — the page itself must
                  never scroll sideways. */}
              <div className="card hidden overflow-x-auto p-0 md:block">
              <table className={`w-full border-collapse ${hasOthers ? 'min-w-[840px]' : 'min-w-[720px]'}`}>
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th
                        key={h.label}
                        className={`table-th px-3 py-3.5 ${h.align === 'right' ? '!text-right' : ''}`}
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const t = tone(row.priority);
                    const last = shortDate(row.date);
                    return (
                      <tr key={row.user_id ?? i} className="border-t border-line-soft">
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <div className="text-sm font-bold text-primary">{row.user_name}</div>
                          {/* Sabha chip under the name — only when the list spans
                              more than one Sabha (a Mandal Head and above). */}
                          {showSabha && row.sabha_name && (
                            <div className="mt-1"><SabhaTag name={row.sabha_name} /></div>
                          )}
                        </td>
                        {showAssigned && (
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm">
                            {row.is_mine ? (
                              <span className="font-semibold text-accent">You</span>
                            ) : (
                              <span className="text-text-muted">{row.assigned_to || '—'}</span>
                            )}
                          </td>
                        )}
                        {/* "Never" is a fact worth reading in red — it is the
                            whole reason a member is at the top of this list. */}
                        <td className={`whitespace-nowrap px-3 py-3.5 text-sm ${last ? 'text-text-muted' : 'font-semibold text-danger-fg'}`}>
                          {last ?? 'Never'}
                        </td>
                        {hasOthers && (
                          <td className="whitespace-nowrap px-3 py-3.5 text-sm text-text-muted">
                            {row.followup_user_name || '—'}
                          </td>
                        )}
                        <td className={`tnum whitespace-nowrap px-3 py-3.5 text-right text-sm font-semibold ${t.text}`}>
                          {row.days_prior ?? '—'}
                        </td>
                        <td className={`tnum whitespace-nowrap px-3 py-3.5 text-right text-sm font-semibold ${t.text}`}>
                          {formatNumber(row.last_15_days ?? 0)}
                        </td>
                        <td className={`tnum whitespace-nowrap px-3 py-3.5 text-right text-sm font-semibold ${t.text}`}>
                          {formatNumber(row.last_1_month ?? 0)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${t.chip}`}>
                            {row.priority}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right">
                          {/* Only with YUVA_SEVA:ADD — the grant POST
                              /yuva-seva itself requires. */}
                          {canAdd && (
                            <button
                              type="button"
                              onClick={() => setAdding(row)}
                              className="whitespace-nowrap text-sm font-semibold text-accent transition-colors hover:opacity-80"
                            >
                              + Add
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  <tr className="border-t border-line bg-bg/60">
                    <td className="whitespace-nowrap px-3 py-3.5 text-sm font-bold text-primary">Total</td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-sm text-text-muted" colSpan={totalTextSpan}>
                      {formatNumber(rows.length)} member{rows.length === 1 ? '' : 's'} on follow-up
                    </td>
                    <td className="tnum whitespace-nowrap px-3 py-3.5 text-right text-sm font-bold text-primary">
                      {formatNumber(total15)}
                    </td>
                    <td className="tnum whitespace-nowrap px-3 py-3.5 text-right text-sm font-bold text-primary">
                      {formatNumber(total30)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
              </div>
            </>
          )}
        </>
      )}

      <YuvaSevaDialog
        member={adding}
        isOpen={Boolean(adding)}
        onClose={() => setAdding(null)}
      />
    </div>
  );
}
