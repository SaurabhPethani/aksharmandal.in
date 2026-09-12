import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '../hooks';
import { LOG_TABS, logsService } from '../services/logsService';
import { masterDataService } from '../services/masterDataService';
import { LOOKUP_CACHE } from '../hooks/cache';
import { MODULES } from '../constants/permissions';
import { BLOCK_SIZE, DEFAULT_PAGE_SIZE, readPageSize } from '../constants/pagination';
import { blocksForPage, readBlockSize, sliceForPage } from '../services/paginationService';
import { EmptyState, PageHeader } from '../components/ui';
import { Pagination } from '../components/DataTable';
import { ActivityLogsTable, CronLogsTable } from '../components/LogsTable';

/**
 * Logs — the audit trail, in three tabs.
 *
 * Each tab is its own endpoint with its OWN permission, so the tab strip only
 * offers what the caller may actually read:
 *
 *   Activity Logs   LOGS:ACTIVITY_LOGS_READ
 *   Module Logs     LOGS:MODULE_LOGS_READ
 *   System Logs     LOGS:CRON_LOGS_READ
 *
 * Three separate grants, none implying another. LOGS declares no plain READ
 * action, so there is no single grant that opens the screen — holding any one of
 * the three is what makes it reachable.
 */

/**
 * `YYYY-MM-DD` in the VIEWER'S timezone — the format the endpoints expect.
 *
 * Deliberately not `toISOString().slice(0, 10)`, which is UTC: at UTC+5:30 every
 * moment between midnight and 05:30 local is still "yesterday" in UTC, so that
 * form would cap the calendar a day early — blocking today from the picker for
 * the first five and a half hours of it.
 */
function localIso(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const todayIso = () => localIso(new Date());

/**
 * A captioned filter control.
 *
 * THE CAPTIONS ARE BACK, and the note they replace argued they were not needed:
 * that From and To are told apart by sitting in reading order, and that "All
 * categories" names its own filter. Both are true of a bar you already know. On
 * arrival it is three identical white boxes, two of them reading `dd-mm-yyyy` —
 * a browser's own placeholder, which says the FORMAT and not the FIELD. Nothing
 * on screen said "date range" at all, and the names were reachable only by
 * hovering a box or running a screen reader.
 *
 * `.eyebrow` is the same small-caps used by the entry count under this bar, so
 * the captions read as the page's own labelling rather than as new furniture.
 *
 * A real `<label htmlFor>` rather than another `aria-label`: it names the
 * control for a screen reader AND enlarges its hit target, and having both would
 * mean two names for one field, with the invisible one winning.
 */
function Field({ label, htmlFor, hint, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="eyebrow mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-snug text-text-faint">{hint}</p>}
    </div>
  );
}

export default function LogsPage() {
  const { can } = usePermissions();

  // Only the tabs whose action is granted. A tab the caller cannot read would
  // render an empty table and a 403 in the console.
  const tabs = useMemo(() => LOG_TABS.filter((t) => can(MODULES.LOGS, t.action)), [can]);

  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const tab = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  // Computed per render rather than at module load, so a tab left open across
  // midnight caps the calendar at the new day rather than yesterday.
  const TODAY = todayIso();

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);

  /**
   * Rows per page on screen — the reader's choice from the pager's dropdown.
   *
   * The log endpoints take no `limit` parameter, so this cannot be asked of the
   * server. One server block is windowed into screens of this size instead: the
   * page number shown is a UI page, and the request only changes when the window
   * crosses into the next block. `total_records` still comes from the server, so
   * the count is real.
   *
   * Changing it restarts at page 1 — page 7 of 10 is not page 7 of 100.
   */
  const [uiPageSize, setUiPageSize] = useState(DEFAULT_PAGE_SIZE);
  const changePageSize = (size) => {
    setUiPageSize(readPageSize(size));
    setPage(1);
  };

  /**
   * The block arithmetic is the shared one — see services/paginationService.js.
   * It used to be written out here as `% serverLimit`, which silently assumed
   * the UI size divided the server's: at 100 a page against 250-record blocks
   * asked for `slice(200, 300)` of a 250-row response and rendered 50 rows as a
   * full page, with the other 50 unreachable at any page number.
   */
  const [serverLimit, setServerLimit] = useState(BLOCK_SIZE);
  const blocks = blocksForPage(page, uiPageSize, serverLimit);
  const spillBlock = blocks.length > 1 ? blocks[1] : null;

  const filters = { fromDate, toDate, category, type };
  const query = useQuery({
    queryKey: ['logs', tab?.key, { serverPage: blocks[0], ...filters }],
    queryFn: () => logsService.list(tab, { page: blocks[0], ...filters }),
    enabled: Boolean(tab),
    keepPreviousData: true,
  });

  // The block after it, when the page straddles a boundary. Its own request and
  // its own cache entry — and it is the next page's primary block, so the second
  // fetch is not spent twice.
  const spillQuery = useQuery({
    queryKey: ['logs', tab?.key, { serverPage: spillBlock, ...filters }],
    queryFn: () => logsService.list(tab, { page: spillBlock, ...filters }),
    enabled: Boolean(tab) && spillBlock != null,
    keepPreviousData: true,
  });

  // Trust the response's own page size rather than assuming a number — if the
  // backend changes it, the window follows instead of silently skipping rows.
  const reportedLimit = readBlockSize(query.data);
  useEffect(() => {
    if (reportedLimit) setServerLimit((current) => (current === reportedLimit ? current : reportedLimit));
  }, [reportedLimit]);

  // Role ids -> names, for the value columns. The log resolves pradesh / mandal /
  // sabha / user ids to names but not role ids, so "Role: 7" arrives raw.
  //
  // Best-effort: /role-permissions/roles needs its own grant, which a logs-only
  // reader may not hold. `retry: false` keeps a 403 from being retried, and the
  // table falls back to printing the id — a missing name must not empty a cell.
  const rolesQuery = useQuery({
    queryKey: ['roles-for-logs'],
    queryFn: masterDataService.roles,
    retry: false,
    ...LOOKUP_CACHE,
  });

  const roleNames = useMemo(() => {
    const rows = Array.isArray(rolesQuery.data) ? rolesQuery.data : [];
    return new Map(rows.map((r) => [r.id, r.role_name ?? r.name]).filter(([id]) => id != null));
  }, [rolesQuery.data]);

  const itemsOf = (data) => (Array.isArray(data?.items) ? data.items : []);
  // The spill lands directly after the primary, so the offsets below — measured
  // from the top of the primary block — address a straddling page as one run.
  const allRows = spillBlock != null
    ? [...itemsOf(query.data), ...itemsOf(spillQuery.data)]
    : itemsOf(query.data);
  const [start, end] = sliceForPage(page, uiPageSize, serverLimit);
  const rows = allRows.slice(start, end);

  /**
   * What the table renders its loading and error states from. A straddling page
   * is not loaded until BOTH halves are — handing over the primary's state alone
   * would draw half a page as though it were a whole one.
   */
  const listQuery = spillBlock == null ? query : {
    ...query,
    isLoading: query.isLoading || spillQuery.isLoading,
    error: query.error ?? spillQuery.error,
    refetch: () => { query.refetch(); spillQuery.refetch(); },
  };

  const totalRecords = query.data?.total_records ?? 0;
  // Never the server's `total_pages`: it counts blocks, and the pager walks UI
  // pages of whatever size is showing.
  const totalPages = Math.max(1, Math.ceil(totalRecords / uiPageSize));

  const switchTab = (key) => {
    setActiveKey(key);
    // The filters belong to the list being looked at — and the tabs do not even
    // share them (category vs type), so carrying them over would send a
    // category the next endpoint has never heard of.
    setPage(1);
    setCategory('');
    setType('');
  };

  if (!tabs.length) {
    return (
      <>
        <PageHeader title="Logs" />
        <div className="card">
          <EmptyState
            title="No access to logs"
            hint="Your role grants none of ACTIVITY_LOGS_READ, MODULE_LOGS_READ or CRON_LOGS_READ."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Logs"
      />

      {/* Underline tabs, not the pill strip Master Data uses: these are views of
          one subject rather than separate lists. */}
      <div className="mb-4 flex flex-wrap items-center gap-6 border-b border-line-soft">
        {tabs.map((t) => {
          const active = t.key === tab.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-1 pb-2.5 text-sm transition-colors ${
                active
                  ? 'border-primary font-bold text-primary'
                  : 'border-transparent font-medium text-text-muted hover:text-primary'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mb-4 rounded-card border border-line-soft bg-surface shadow-card">
        {/* Two per row from the narrowest screen up, so From and To land side by
            side — which is what makes them read as one range rather than two
            dates that happen to be near each other. */}
        <div className="grid grid-cols-2 items-start gap-3 px-4 py-3 lg:grid-cols-3">
          {tab.kind === 'activity' ? (
            <>
              <Field label="From date" htmlFor="logs-from">
                {/* A log is a record of what HAS happened, so tomorrow can only
                    ever return nothing — the calendar stops at today. `From` also
                    stops at `To` when one is set, so the range cannot be inverted
                    into a window that is empty by construction. */}
                <input
                  id="logs-from"
                  title="From date"
                  type="date"
                  className="input-field px-2.5 sm:px-4"
                  value={fromDate}
                  max={toDate && toDate < TODAY ? toDate : TODAY}
                  onChange={(e) => {
                    // `max` stops the picker but not a typed value, so the same
                    // rule is enforced here.
                    const next = e.target.value > TODAY ? TODAY : e.target.value;
                    setFromDate(next);
                    // A From after the current To would ask for an empty window;
                    // drop the To rather than send an inverted range.
                    if (next && toDate && toDate < next) setToDate('');
                    setPage(1);
                  }}
                />
              </Field>
              {/* The hint is only drawn while it applies — a permanent "choose a
                  From date first" under a box that is already usable is noise,
                  and the disabled state on its own explained nothing. */}
              <Field
                label="To date"
                htmlFor="logs-to"
                hint={!fromDate ? 'Pick a From date first' : undefined}
              >
                <input
                  id="logs-to"
                  type="date"
                  className="input-field px-2.5 sm:px-4"
                  value={toDate}
                  min={fromDate || undefined}
                  max={TODAY}
                  onChange={(e) => {
                    let next = e.target.value;
                    if (next > TODAY) next = TODAY;
                    if (fromDate && next && next < fromDate) next = fromDate;
                    setToDate(next);
                    setPage(1);
                  }}
                  // The endpoint rejects to_date without from_date, so the
                  // control is disabled rather than allowed to build a 422.
                  disabled={!fromDate}
                  title={!fromDate ? 'Choose a From date first' : 'To date'}
                />
              </Field>
              <Field label="Category" htmlFor="logs-category">
                <select
                  id="logs-category"
                  className="input-field"
                  value={category}
                  onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                >
                  <option value="">All categories</option>
                  {tab.categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            // Cron logs take neither a date range nor a category — offering
            // those controls here would be three inputs that change nothing.
            <Field label="Job type" htmlFor="logs-type">
              <select
                id="logs-type"
                className="input-field"
                value={type}
                onChange={(e) => { setType(e.target.value); setPage(1); }}
              >
                <option value="">All jobs</option>
                {tab.types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
          {totalRecords} {totalRecords === 1 ? 'entry' : 'entries'}
        </p>
      )}

      {tab.kind === 'cron' ? (
        <CronLogsTable rows={rows} query={listQuery} emptyHint="No scheduled job has run in this view." />
      ) : (
        <ActivityLogsTable
          rows={rows}
          query={listQuery}
          roleNames={roleNames}
          // Module logs record changes to org CONTENT, so they carry no subject
          // and no approval status — that tab drops both columns.
          variant={tab.key === 'module' ? 'module' : 'activity'}
          emptyHint="Nothing was logged for the selected dates and category."
        />
      )}

      {/* Rendered even at one page: the Show dropdown lives here, and it is how
          a reader asks for more rows than one page currently holds. */}
      {totalRecords > 0 && (
        <Pagination page={page} pageCount={totalPages} total={totalRecords} onChange={setPage} pageSize={uiPageSize} onPageSize={changePageSize} />
      )}
    </>
  );
}
