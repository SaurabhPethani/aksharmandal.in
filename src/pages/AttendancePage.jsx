import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CalendarCheck, CalendarDays, Clock, Mic, Plus } from 'lucide-react';
import {
  useClientPagination, usePermissions, useSabhaDetails, useSabhaSchedules, useToast,
} from '../hooks';
import { ACTIONS, MODULES } from '../constants/permissions';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { Breadcrumbs } from '../components/Navigation';
import { MemberPager } from '../components/hierarchy/MemberList';
import AttendanceRecordDialog from '../components/attendance/AttendanceRecordDialog';
import { SABHA_SESSION_FORM, SCHEDULE_FORM, SPECIAL_SABHA_FORM } from '../utils/attendanceFormSchema';
import { daysBetween, readDate, readTime, todayKey } from '../utils/dates';
import { pickRows } from '../utils/options';

// Attendance landing.
//
// Three tabs — Regular Sabha, Special Sabha, Schedules — each backed by its own
// endpoint:
//   Regular  -> GET /attendance/sabhadetails?type=regular&status=true
//   Special  -> GET /attendance/sabhadetails?type=special   (no status: a special
//               Sabha is a one-off, and filtering to active would hide every one
//               that has already been held)
//   Schedule -> GET /attendance/sabhaschedule
//
// All three are fetched, not just the visible one: the tabs carry counts, and a
// count cannot be shown for a list that has not been read. They are small.
//
// The module is routable only because full-context granted something on
// ATTENDANCE (AppRouter emits no route otherwise). Within the page, READ gates
// the lists, CREATE gates marking attendance and adding records, and UPDATE
// gates amending one that exists — all three read from full-context.
//
// MARKING STARTS HERE, ON THE SITTING. The page header used to carry a Mark
// Attendance button to a screen whose first control asked which Sabha was meant
// — a question every card here already answers. The Mark link on a card opens
// the same scanner and member list against that sitting's `sabha_detail_id`, so
// there is no second chance to pick the wrong one.

/**
 * One sitting's attendance report. `/attendance/sabha/…`, not `/special/…`: the
 * Report button is offered on regular sittings too now, and a URL that called
 * every one of them special would misname most of what it opens. The old path
 * is still routed — see AppRouter — so anything already bookmarked still works.
 */
const SABHA_REPORT_PATH = (id) => `/attendance/sabha/${id}/report`;

/**
 * Taking attendance for one sitting. A PAGE, not a popup — see
 * pages/AttendanceMarkPage.jsx for why a camera, a member list, a search box and
 * a pager do not belong inside a dialog.
 */
const SABHA_MARK_PATH = (id) => `/attendance/${id}/mark`;

/**
 * A special Sabha names itself. Everything else falls back to `sabha_name`,
 * which the API has ALREADY dated — "Suvas - 24-07-2026" — so nothing is
 * appended here; doing so printed the date twice on every regular row.
 */
const titleOf = (row) => row?.special_sabha_name || row?.sabha_name || `#${row?.id ?? ''}`;

// One step down from the app's default body scale, across all three tabs: a
// sitting is a dense card of five facts, and at `text-sm`/`text-base` the list
// read as a stack of headings.
//
// NO TYPE OR STATUS PILLS. Every card used to carry a "Regular"/"Special" chip
// and an "Active"/"Inactive" one. The first repeated the tab the reader is
// already standing on; the second was a badge on almost every card in the list.
// Both are gone, and so is the internal Sabha id that sat under a schedule's
// name — a database key printed on a card nobody can act on it with.
//
// AND NO DATE TILE. A sitting used to lead with a navy 14×14 block reading
// "24 / JUL", which made its card a different object from a schedule's: one
// began with a graphic, the other with a name. The date is now a meta line under
// the title like every other fact, so all three tabs are one card with different
// facts in it — and the line says "24 Jul 2026 · Friday · 8:00" in full, where
// the tile had room for a number and a month and no year at all.

/**
 * THE ONE GRID ALL THREE TABS LAY OUT IN.
 *
 * Regular, Special and Schedules are the same kind of thing — a list of sittings
 * — and used to be drawn two different ways: Schedules as this grid of cards,
 * the other two as full-width list rows. One screen, two layouts, switched by a
 * tab. They now share this, so moving between tabs changes what is listed and
 * nothing about how it reads.
 *
 * THREE ACROSS AT THE WIDEST, not four. A fourth column fits, but a Sabha's name
 * is long enough that four of them wrap to two lines each and the row reads as a
 * block of text — and the date, day, time and vakta line underneath then wraps
 * as well. Three keeps every card's facts on the lines they were laid out for.
 */
const CARD_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';

/**
 * A card's action button: white, blue-bordered, and filling with that blue on
 * hover — which is `btn-outline`'s own hover, so the fill and the border agree
 * without being restated here.
 *
 * The border is the only override. `btn-outline` draws it in `line-strong`, a
 * grey that reads as disabled next to a filled button; `primary` is the same
 * blue the button turns on hover, so the resting state announces what it does.
 *
 * Every action on every tab uses this. Mark used to be a solid navy button,
 * which made it the loudest thing in a grid of otherwise quiet cards and put a
 * different weight on the Regular tab than on Schedules.
 */
const CARD_ACTION = 'min-w-0 flex-1 !border-primary !py-2 !text-xs';

/**
 * A meta line inside a card — an accent icon and one fact.
 *
 * Shared by both card kinds, which is what keeps the time on a schedule and the
 * time on a sitting looking like the same fact.
 *
 * A POINT SMALLER THAN THE CARD'S OTHER SMALL TEXT (11px against `text-xs`). A
 * sitting carries four of these — date, day, time, vakta — and at `text-xs` the
 * longer dates pushed the row onto a second line on some cards and not others,
 * so cards in one grid row stopped agreeing on where anything sat. The point
 * back is what fits the four across.
 */
function CardMeta({ icon: Icon, children, tnum = false }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-4 text-primary ${tnum ? 'tnum' : ''}`}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * One sitting — regular or special — as a card.
 *
 * TWO ACTIONS, EACH ON ITS OWN GRANT (see the page's `canUpdate` / `canCreate`):
 *
 *   Vakta  ATTENDANCE:UPDATE — opens the edit form, whose job on a sitting the
 *          cron already created is naming the speaker. The label is the noun
 *          rather than "Add Vakta": the form edits one as readily as it adds
 *          one, and three buttons across a card of this width read better as
 *          three words than as one word and a phrase.
 *   Mark   ATTENDANCE:CREATE — marking is a write, and the same verb the
 *          /attendance/scan route is gated on.
 *
 * Report is the third and is gated on REPORTS:READ, decided by the page.
 *
 * `h-full` with the actions pushed down by `mt-auto`: cards in one grid row are
 * stretched to the tallest, and without it a card whose Sabha has no vakta ends
 * with its buttons floating halfway up.
 */
function SabhaCard({ row, canEdit, canMarkAttendance, onEdit, onMark, onReport }) {
  const when = readDate(row?.date);
  const time = readTime(row?.time);
  // `is_available_for_attendance` is the BACKEND's answer to "is this sitting
  // open for marking" — a grant is not enough, and offering Mark on a sitting it
  // has closed leads to a write it will refuse.
  const isOpen = row?.is_available_for_attendance === true || row?.is_available_for_attendance === 1;
  const showMark = canMarkAttendance && isOpen;

  return (
    <div className="card flex h-full flex-col p-4">
      {/* Two lines, not one: a card is a quarter of the width a row had, and
          truncating to one line hides which Sabha this is. */}
      <h3 className="line-clamp-2 font-display text-sm font-bold leading-snug text-primary">
        {titleOf(row)}
      </h3>

      {/* Date, day and time — the schedule card's layout, with the sitting's own
          facts in it. Each is dropped rather than drawn empty: `vakta` comes back
          as an empty string on Sabhas nobody has been assigned to, and a speaker
          icon with nothing after it says less than no line at all. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {when && <CardMeta icon={CalendarCheck} tnum>{when.date}</CardMeta>}
        {when && <CardMeta icon={CalendarDays}>{when.day}</CardMeta>}
        {time && <CardMeta icon={Clock} tnum>{time}</CardMeta>}
        {row?.vakta && <CardMeta icon={Mic}>{row.vakta}</CardMeta>}
      </div>

      {/* The topic is a fact about the sitting like the four above it, so it is
          drawn as one — same size, weight, colour and accent icon as the vakta
          beside it. It was a grey paragraph, which read as a caption on the card
          rather than as one more thing the card states.

          Its own row, not appended to theirs: a topic is a sentence where the
          others are a word or two, and sharing a line left it with a few
          characters before the truncation. */}
      {row?.topic && (
        <div className="mt-1.5 flex min-w-0">
          <CardMeta icon={BookOpen}>{row.topic}</CardMeta>
        </div>
      )}

      {/* Venue view — the room, split by who filled it. Three facts on one line:
          OWN (members of this Sabha who attended) · GUESTS (attendees from
          another Sabha) · ROOM (turnout total). The three reconcile: OWN +
          GUESTS = ROOM. The old single "N present" line only reported ROOM and
          silently blended the two cohorts, so a card of "48 present" told the
          reader nothing about whether 48 of their own showed up or 20 of their
          own plus 28 guests.

          For a Special (Mandal-level) sitting the sabha_id is NULL, so OWN is
          0 by definition and every attendee is a guest — the card falls back
          to just ROOM to avoid printing "0 own" on every Special row, where it
          means nothing. */}
      {(() => {
        const room = row?.turnout ?? row?.present_count ?? 0;
        const own = row?.own_present ?? 0;
        const guests = row?.visitor_present ?? Math.max(0, room - own);
        const isSpecial = row?.type === 'special' || row?.sabha_id == null;
        return (
          <p className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-text-muted">
            {!isSpecial && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1 w-1 rounded-full ${own ? 'bg-success-fg' : 'bg-[#C0CDE0]'}`} />
                  <span className="tnum font-semibold text-primary">{own}</span> Present
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1 w-1 rounded-full ${guests ? 'bg-accent' : 'bg-[#C0CDE0]'}`} />
                  <span className="tnum font-semibold text-primary">{guests}</span> Other
                </span>
              </>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1 w-1 rounded-full ${room ? 'bg-success-fg' : 'bg-[#C0CDE0]'}`} />
              <span className="tnum font-semibold text-primary">{room}</span> Today
            </span>
          </p>
        );
      })()}

      {(canEdit || showMark || onReport) && (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3.5">
          {showMark && (
            <Button variant="outline" className={CARD_ACTION} onClick={() => onMark(row)}>
              Mark
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" className={CARD_ACTION} onClick={() => onEdit(row)}>
              Vakta
            </Button>
          )}
          {/* Only once the Sabha has happened: a report on a sitting nobody has
              attended yet is a table of zeroes. */}
          {onReport && (
            <Button variant="outline" className={CARD_ACTION} onClick={() => onReport(row)}>
              Report
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One recurrence: which Sabha, which weekday, what time.
 *
 * `canEdit` is ATTENDANCE:UPDATE — the grant `PATCH /attendance/sabhaschedule/{id}`
 * actually asks for. It was CREATE, which is the grant for ADDING a schedule
 * (the "New Schedule" button in the toolbar), so a role trusted to create one
 * was also being offered Edit and a role with only UPDATE was shown nothing to
 * edit. Every role currently holds both, so the two agreed in practice — which
 * is exactly why this could sit wrong without anyone noticing.
 */
function ScheduleCard({ row, canEdit, onEdit }) {
  const time = readTime(row?.time);

  return (
    <div className="card flex h-full flex-col p-4">
      <h3 className="line-clamp-2 font-display text-sm font-bold leading-snug text-primary">
        {row?.sabha_name ?? `#${row?.id ?? ''}`}
      </h3>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {row?.day && <CardMeta icon={CalendarDays}>{row.day}</CardMeta>}
        {time && <CardMeta icon={Clock} tnum>{time}</CardMeta>}
      </div>

      {canEdit && (
        <div className="mt-auto flex items-center gap-2 pt-3.5">
          <Button variant="outline" className={CARD_ACTION} onClick={() => onEdit(row)}>
            Edit Schedule
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * "ONGOING ────" — a label and a rule running to the edge.
 *
 * No count beside it. The tab above already carries one for the whole list, and
 * a second number that counts only part of it invited the two to be read as the
 * same figure.
 */
function SectionHeading({ label }) {
  return (
    <div className="flex items-center gap-3">
      <p className="eyebrow shrink-0">{label}</p>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/**
 * TWO SECTIONS, AND TODAY IS THE LINE BETWEEN THEM.
 *
 *   Ongoing  today, and anything still to come. A sitting today is the one being
 *            marked, which is what this page is opened for, so it leads.
 *   Past     everything before today.
 *
 * There used to be a third, "Earlier", splitting Past at seven days. It bought
 * nothing: everything under it was past as well, so the page named the same
 * state twice and a Sabha crossed a heading on a Tuesday for no reason the
 * reader could see.
 *
 * A row whose `date` will not parse goes to Past. It cannot be filed under a
 * heading that claims it is happening today, and Past is the one of the two that
 * makes no promise about it.
 */
function groupByWhen(rows) {
  const today = todayKey();
  const buckets = { ongoing: [], past: [] };
  for (const row of rows) {
    const date = readDate(row?.date);
    if (!date) { buckets.past.push(row); continue; }
    if (daysBetween(date.key, today) >= 0) buckets.ongoing.push(row);
    else buckets.past.push(row);
  }

  /**
   * EACH SECTION IS ORDERED NEAREST-TO-TODAY FIRST, and in opposite directions
   * because "nearest" runs opposite ways either side of today:
   *
   *   Ongoing   ascending  — today, then tomorrow, then next week
   *   Past      DESCENDING — yesterday, then last week, then last month
   *
   * Past reads backwards from today for the same reason Ongoing reads forwards:
   * the sitting somebody wants is the one that just happened. Ascending buried
   * last week's Sabha under every sitting the Sabha has ever held, so the page
   * got worse the longer it was used — and the row a Sabha Head opens this
   * screen to revisit was the very last one on it.
   *
   * SORTED HERE RATHER THAN RELIED ON FROM THE API. The list arrives in
   * whatever order the endpoint chose; ordering it in the component means the
   * two sections stay right even if that changes, and neither depends on the
   * other's direction.
   *
   * `key` is `YYYY-MM-DD`, which compares correctly as a plain string — no Date
   * objects, no timezone in the comparison.
   *
   * Undated rows sort last within Past. They cannot be placed against a date,
   * and putting them at the top would push the recent sittings — the reason the
   * section is read at all — below a row nobody can place.
   */
  const dateKey = (row) => readDate(row?.date)?.key ?? '';
  buckets.ongoing.sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
  buckets.past.sort((a, b) => {
    const [ka, kb] = [dateKey(a), dateKey(b)];
    if (!ka || !kb) return ka ? -1 : kb ? 1 : 0;
    return kb.localeCompare(ka);
  });

  return [
    { key: 'ongoing', label: 'Ongoing', rows: buckets.ongoing },
    { key: 'past', label: 'Past', rows: buckets.past },
  ].filter((s) => s.rows.length > 0);
}

export default function AttendancePage({ module }) {
  const { can } = usePermissions();
  const navigate = useNavigate();

  const [tab, setTab] = useState('regular');
  /** `{ form, record }` while a create/edit popup is open. */
  const [editing, setEditing] = useState(null);
  const toast = useToast();

  /**
   * Attendance can only be marked once the sitting names WHO is speaking and
   * WHAT they're speaking on. Without those two, the summary strip on the Mark
   * page is a header with no content, and reports downstream inherit the same
   * gap.
   *
   * So the Mark click routes through here:
   *   - both present → navigate to the Mark page with the row in state (so
   *     the Mark page can skip a fresh /sabhadetails fetch)
   *   - either missing → open the Vakta edit dialog with a toast telling the
   *     reader why. Both Vakta and Topic are required in SABHA_SESSION_FORM /
   *     SPECIAL_SABHA_FORM, so the form itself will not save until they are
   *     filled — this gate and the schema agree.
   *
   * Trim first: a Sabha whose Vakta field was saved as " " (a leading space)
   * used to slip through the `??` check and route to a page whose header
   * still read "Vakta:  ".
   */
  const startMarking = (row) => {
    const vakta = String(row?.vakta ?? '').trim();
    const topic = String(row?.topic ?? '').trim();
    if (!vakta || !topic) {
      const missing = !vakta && !topic ? 'Vakta and Topic' : !vakta ? 'Vakta' : 'Topic';
      toast.info(`Please fill ${missing} before marking attendance.`);
      setEditing({ form: SABHA_SESSION_FORM, record: row });
      return;
    }
    navigate(SABHA_MARK_PATH(row.id), { state: { sabha: row } });
  };

  // Module visibility is "any granted action", so this page can be reachable
  // without READ. Only fetch when reading is permitted — or when the module
  // defines no READ action at all, in which case the endpoint is open. Same rule
  // as ModulePage; a hardcoded `can(…, 'READ')` here would black out all three
  // tabs for a role whose ATTENDANCE grants use a different verb.
  const hasReadAction = Boolean(module?.actions?.READ);
  const moduleName = module?.name ?? MODULES.ATTENDANCE;
  const canRead = hasReadAction ? can(moduleName, ACTIONS.READ) : true;
  /**
   * The two writes this screen offers, split by WHAT is being written rather
   * than by which HTTP verb writes it:
   *
   *   CREATE  taking attendance, and nothing else — `POST /attendance/mark-bulk`
   *           and the scan / mark routes that lead to it.
   *   UPDATE  managing the Sabha itself: adding a sitting or a schedule
   *           (`POST /sabhadetails`, `POST /sabhaschedule`) as well as amending
   *           one that exists (`PATCH /sabhadetails/{id}`, Add Vakta, and
   *           `PATCH /sabhaschedule/{id}`, Edit Schedule).
   *
   * ADDING A SITTING IS UPDATE, NOT CREATE — by explicit request, and it is the
   * useful line rather than the CRUD-shaped one. `ATTENDANCE:CREATE` reads as
   * "may create attendance records", which is what marking is; putting the Add
   * buttons behind it meant every role trusted to take attendance could also
   * add sittings and schedules to the calendar. The two are different trusts,
   * and one flag cannot hold both.
   */
  const canCreate = can(moduleName, ACTIONS.CREATE);
  const canUpdate = can(moduleName, ACTIONS.UPDATE);
  // The report is a reports endpoint, so it takes the reports grant — not an
  // attendance one.
  const canReadReports = can(MODULES.REPORTS, ACTIONS.READ);

  const regularQ = useSabhaDetails({ type: 'regular' }, canRead);
  const specialQ = useSabhaDetails({ type: 'special' }, canRead);
  const scheduleQ = useSabhaSchedules(canRead);

  const query = { regular: regularQ, special: specialQ, schedule: scheduleQ }[tab];
  const rows = useMemo(() => pickRows(query?.data), [query?.data]);

  const TAB_LIST = [
    { value: 'regular', label: 'Regular Sabha', count: pickRows(regularQ.data).length },
    { value: 'special', label: 'Special Sabha', count: pickRows(specialQ.data).length },
    { value: 'schedule', label: 'Schedules', count: pickRows(scheduleQ.data).length },
  ];

  // These endpoints return bare arrays with no total, so paging is client-side —
  // the same arrangement, and the same reason, as MembersPage.
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } = useClientPagination(rows);
  const sections = tab === 'schedule' ? [] : groupByWhen(pageRows);

  return (
    <div className="space-y-5">
      {/* No Mark Attendance action here any more. It led to a screen whose first
          job was asking WHICH sitting, a question every card on this page
          already answers — so marking now starts from the sitting's own Mark
          link, which opens that sitting's own marking page with no dropdown to
          get wrong. */}
      <PageHeader
        title={module?.label ?? 'Attendance'}
        breadcrumbs={<Breadcrumbs items={[{ label: module?.label ?? 'Attendance' }]} />}
      />

      {/* Pills with counts, matching the rest of the app's tabbed screens. The
          count is part of the tab because "is there anything in Special?" is the
          question the tab row is there to answer. */}
      <div className="-mx-1 overflow-x-auto scrollbar-none px-1">
        <div className="flex min-w-max items-center gap-2">
          {TAB_LIST.map((t) => {
            const active = t.value === tab;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => { setTab(t.value); setPage(1); }}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-2.5 whitespace-nowrap rounded-control px-5 py-2.5 text-sm font-semibold transition-colors ${
                  active ? 'bg-surface text-primary shadow-card' : 'text-text-muted hover:text-primary'
                }`}
              >
                {t.label}
                <span
                  className={`tnum grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[11px] font-bold ${
                    active ? 'bg-primary text-white' : 'bg-primary-50 text-text-muted'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!canRead ? (
        <div className="card">
          <p className="text-sm text-text-muted">
            Viewing attendance requires the{' '}
            <span className="font-semibold text-primary">Attendance · Read</span> permission.
          </p>
        </div>
      ) : (
        <>
          {/* The tab's own action, on the right — nothing on Regular, whose
              sittings are spawned from the schedules by a cron rather than
              created by hand.

              ATTENDANCE:UPDATE, not CREATE: adding to the calendar is managing
              the Sabha, which is the same trust as editing it. See the note on
              `canCreate` / `canUpdate` above. */}
          {(tab === 'special' || tab === 'schedule') && canUpdate && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {tab === 'schedule' ? (
                <p className="text-sm text-text-muted">
                  Recurring schedules used by cron to auto-create regular sabhas.
                </p>
              ) : <span />}
              <Button
                variant="accent"
                onClick={() =>
                  setEditing({ form: tab === 'schedule' ? SCHEDULE_FORM : SPECIAL_SABHA_FORM, record: null })
                }
              >
                <Plus className="h-4 w-4" />
                {tab === 'schedule' ? 'New Schedule' : 'New Special Sabha'}
              </Button>
            </div>
          )}

          {query?.isLoading ? (
            // Shaped like the grid it is standing in for, so the page does not
            // reflow from a stack of bars into a grid of cards as it settles.
            <div className={CARD_GRID}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-44 w-full" />)}
            </div>
          ) : query?.error ? (
            <div className="card">
              <ErrorState error={query.error} onRetry={query.refetch} title="Could not load this list" />
            </div>
          ) : rows.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={CalendarCheck}
                title="Nothing here yet"
                hint="Nothing in your scope for this tab."
              />
            </div>
          ) : tab === 'schedule' ? (
            <>
              <div className={CARD_GRID}>
                {pageRows.map((row, i) => (
                  <ScheduleCard
                    key={row.id ?? i}
                    row={row}
                    canEdit={canUpdate}
                    onEdit={(r) => setEditing({ form: SCHEDULE_FORM, record: r })}
                  />
                ))}
              </div>
              <MemberPager page={page} pageCount={pageCount} total={total} onChange={setPage} pageSize={pageSize} onPageSize={setPageSize} />
            </>
          ) : (
            <>
              {/* The same grid as Schedules, once per date bucket. The headings
                  stay: a grid of dated cards still needs "is there anything
                  today" answered before it is read. */}
              <div className="space-y-6">
                {sections.map((section) => (
                  <div key={section.key} className="space-y-3">
                    <SectionHeading label={section.label} />
                    <div className={CARD_GRID}>
                      {section.rows.map((row, i) => (
                        <SabhaCard
                          key={row.id ?? i}
                          row={row}
                          canEdit={canUpdate}
                          canMarkAttendance={canCreate}
                          // Editing a sitting is the same job either way — see
                          // SABHA_SESSION_FORM.
                          onEdit={(r) => setEditing({ form: SABHA_SESSION_FORM, record: r })}
                          // startMarking gates the click on Vakta + Topic being
                          // present; if either is missing it opens the edit
                          // dialog instead. On the happy path it navigates with
                          // the row in state so the Mark page skips a fresh
                          // /sabhadetails fetch.
                          onMark={startMarking}
                          // Every sitting has a report, regular and special
                          // alike, and it is now offered on ALL of them — Ongoing
                          // (today and upcoming) as well as Past. A sitting being
                          // marked TODAY is exactly when its live report is wanted
                          // (the report page reads current attendance), so gating
                          // it on the date having passed hid the button on the one
                          // sitting most likely to be opened. An upcoming sitting's
                          // report simply reads as zeroes until it is attended.
                          // Still gated on REPORTS:READ.
                          onReport={
                            canReadReports
                              ? (r) => navigate(SABHA_REPORT_PATH(r.id))
                              : null
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <MemberPager page={page} pageCount={pageCount} total={total} onChange={setPage} pageSize={pageSize} onPageSize={setPageSize} />
            </>
          )}
        </>
      )}

      {/* One popup for every create and edit on this page — `editing` carries
          which definition and, when editing, which row. */}
      <AttendanceRecordDialog
        form={editing?.form ?? SCHEDULE_FORM}
        record={editing?.record ?? null}
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
      />

    </div>
  );
}
