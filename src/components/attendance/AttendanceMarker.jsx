import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Search, Users } from 'lucide-react';
import {
  useAttendanceSummary, useClientPagination, useMandalUsers, useMarkAttendance,
  usePriorWeek, useSabhaMembers, useToast,
} from '../../hooks';
import { Badge, EmptyState, ErrorState, Skeleton } from '../ui';
import { MemberPager } from '../hierarchy/MemberList';
import QrScanner from './QrScanner';
import { pickRows, searchMatches } from '../../utils/options';
import { memberIdFromCode } from '../../utils/qrCode';
import { formatNumber } from '../../utils/format';

// MARKING ATTENDANCE FOR ONE SITTING — the scanner, the member list, the
// counters and the writes.
//
// Extracted from AttendanceScanPage so that the popup on the Attendance list and
// the /attendance/scan page are the SAME code rather than two implementations of
// one job. Everything here — the endpoints, the presence map, the bulk-mark
// call, the Other Sabha tab, the scan tally — behaves exactly as it did on that
// page; the only thing that moved out is CHOOSING the Sabha, which is now the
// caller's business:
//
//   the popup   passes the sitting whose Mark link was clicked
//   the page    passes whatever its dropdown has selected
//
// It renders no heading and no card of its own, so it drops into a dialog body
// and into a page alike.
//
// Nothing about a member's status is held locally: the checkbox renders what the
// summary endpoint last reported, and marking refetches it. A failed write
// therefore leaves the row exactly as the backend has it.

const memberName = (m) => m?.user_name ?? m?.name ?? '—';

/**
 * The member's id, whichever way the endpoint spells it.
 *
 * `/users/list` (this Sabha) returns `id`; `/users/get-all-mandal-users` (Other
 * Sabha) returns `user_id`. Reading only `id` made every row on the second tab
 * idless — the mark went out as `user_ids: [null]`, and the de-duplication
 * against this Sabha's members matched nothing.
 */
const memberId = (m) => m?.user_id ?? m?.id ?? null;

/**
 * userId -> present, read from GET /attendance/attendance/{sabha_detail_id},
 * which answers a bare array of `AttendanceResponse`.
 *
 * `status` there is an INTEGER — 1 present, 0 absent — so it is read as a number
 * as well as a boolean. Read only as a boolean, as it was, every row came back
 * "Absent" however many people had been marked.
 */
function presenceMap(summary) {
  const rows =
    pickRows(summary?.attendance).length ? pickRows(summary.attendance)
      : pickRows(summary?.members).length ? pickRows(summary.members)
        : pickRows(summary);

  const map = new Map();
  for (const row of rows) {
    const id = row?.user_id ?? row?.id;
    if (id == null) continue;
    const raw = row.is_present ?? row.present ?? row.status;
    map.set(String(id), raw === true || raw === 1 || raw === '1');
  }
  return map;
}

/**
 * userId -> user_sabha_id (their HOME Sabha snapshot at attend time).
 *
 * Read off the same summary rows the presence map is built from. Used by the
 * Mark page to tell "own member present" from "visitor from another Sabha
 * present" so the Guests tile can name itself, and Head Count = Present +
 * Guests works out as a straight sum.
 */
function homeSabhaMap(summary) {
  const rows =
    pickRows(summary?.attendance).length ? pickRows(summary.attendance)
      : pickRows(summary?.members).length ? pickRows(summary.members)
        : pickRows(summary);

  const map = new Map();
  for (const row of rows) {
    const id = row?.user_id ?? row?.id;
    if (id == null || row?.user_sabha_id == null) continue;
    map.set(String(id), Number(row.user_sabha_id));
  }
  return map;
}

/**
 * userId -> the date they attended a DIFFERENT sitting in the same week.
 *
 * Populated only for rows the backend flagged with `elsewhere_date` — i.e. the
 * member is Absent HERE but Present at another sitting sharing this sitting's
 * `week_date`. Printed next to the name so a Sabha Head can tell "genuinely
 * missed the week" apart from "attended elsewhere this week".
 *
 * Returns raw ISO date strings; the row renderer formats them.
 */
function elsewhereMap(summary) {
  const rows =
    pickRows(summary?.attendance).length ? pickRows(summary.attendance)
      : pickRows(summary?.members).length ? pickRows(summary.members)
        : pickRows(summary);

  const map = new Map();
  for (const row of rows) {
    const id = row?.user_id ?? row?.id;
    if (id == null || !row?.elsewhere_date) continue;
    map.set(String(id), row.elsewhere_date);
  }
  return map;
}

/** ISO `YYYY-MM-DD` -> `DD-MM-YYYY` for the row label. */
function formatElsewhereDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Two-choice pill control, used twice on this screen: scanner vs list, and this
 * Sabha vs the rest of the Mandal. One component so the two rows are the same
 * height, weight and colour — they sit directly above one another.
 */
/**
 * Below Tailwind's `sm`. A phone, in other words — which on this screen is not a
 * styling question but a behavioural one: the member list pages on a desk and
 * scrolls in the hand, so the component has to KNOW, not just restyle.
 */
const NARROW_QUERY = '(max-width: 639px)';

function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e) => setNarrow(e.matches);
    // Read once on mount as well: a rotation between first render and this
    // effect would otherwise leave the flag a viewport behind.
    setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

/**
 * ONE FIGURE IN A THREE-UP STRIP — and the reason it is not `StatCard`.
 *
 * `StatCard` is a dashboard tile: a 32px icon plate, `p-4`/`p-5`, and a 1.9rem
 * number, all sized for two or three across a full-width page. Three of them in
 * a 400px viewport left each figure about 90px of usable width, so the number
 * nearly filled its own cell and "Total Members" wrapped to three lines beside
 * an icon that had stopped meaning anything at that size.
 *
 * So: no icon plate, a coloured dot instead — it carries the same present/absent
 * coding in 6px rather than 32 — a one-word label, and a number two steps down
 * (`text-xl`, `text-2xl` from `sm`). Which is also exactly what the scan tally
 * on this screen already was, drawn by hand; both now come from here, so the
 * count of people and the count of scans read as the same kind of fact.
 */
function Tally({ label, value, loading = false, tone = 'neutral', subtitle = null }) {
  const dot = { neutral: 'bg-primary/40', ok: 'bg-success-fg', bad: 'bg-danger-fg' }[tone];
  const figure = { neutral: 'text-primary', ok: 'text-success-fg', bad: 'text-danger-fg' }[tone];
  return (
    <div className="rounded-card border border-line-soft bg-surface px-2 py-3 text-center sm:px-4">
      <p className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted sm:text-[11px]">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="truncate">{label}</span>
      </p>
      {loading ? (
        <Skeleton className="mx-auto mt-1.5 h-6 w-12" />
      ) : (
        <p className={`tnum mt-1 font-display text-xl font-bold leading-none sm:text-2xl ${figure}`}>{value}</p>
      )}
      {/* One extra line of context under the number. Used for "Head Count in
          the room" on the Present tile so the reader gets Own + Guests without
          adding it themselves. `truncate` because the cell can be as narrow as
          ~90px on a phone. */}
      {!loading && subtitle && (
        <p className="mt-1 truncate text-[10px] font-medium text-text-muted sm:text-[11px]" title={subtitle}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/**
 * The Present/Absent filter — chips, not a dropdown.
 *
 * The two questions actually asked of this list at a door are "who is still
 * missing?" and "who have I already got?", and both used to mean reading a
 * column of badges a page at a time. Each chip carries its own count, so the
 * answer to "how many left" is on screen before anything is filtered.
 */
function StatusFilter({ value, onChange, counts }) {
  // Four chips, and Absent means "truly missed" — not "not marked here".
  // Elsewhere is its own filter so the door person can jump straight to the
  // members they need to follow up with, without wading past the ones already
  // engaged this week at another Sabha.
  const chips = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'present', label: 'Present', count: counts.present },
    { key: 'elsewhere', label: 'Elsewhere', count: counts.elsewhere },
    { key: 'absent', label: 'Absent', count: counts.absent },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          aria-pressed={value === c.key}
          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === c.key
              ? 'border-primary bg-primary text-white'
              : 'border-line-soft bg-surface text-text-muted hover:border-primary/40 hover:text-primary'
          }`}
        >
          {c.label} <span className="tnum opacity-80">({formatNumber(c.count)})</span>
        </button>
      ))}
    </div>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="flex gap-1 rounded-2xl p-1" style={{ background: '#F0F4F8' }}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`min-w-0 flex-1 truncate rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
            value === o.key
              ? 'bg-white text-primary shadow-[0_1px_4px_rgba(0,49,88,0.10)]'
              : 'text-text-muted hover:text-primary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * @param sabhaDetailId  the sitting being marked — `sabha_detail_id`, what every
 *                       write on this screen is keyed by
 * @param sabha          that sitting's row, for its `sabha_id` (the MEMBERS key,
 *                       which is not the same id) and its name
 * @param onScanningChange  fires as the camera opens and closes, so a caller can
 *                       get its own chrome out of the way
 *
 * Mount this with `key={sabhaDetailId}`: switching sitting must tear the camera
 * down and reset the tally rather than carry a half-finished session across.
 */
export default function AttendanceMarker({ sabhaDetailId, sabha = null, onScanningChange }) {
  const toast = useToast();
  const mark = useMarkAttendance();

  const [mode, setMode] = useState('scanner');      // scanner | list
  const [listTab, setListTab] = useState('sabha');  // sabha | other
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | present | elsewhere | absent
  const isNarrow = useIsNarrow();
  // The row currently being written, so only that checkbox waits — marking one
  // member must not freeze every other row in the list.
  /**
   * MARKING IS NON-BLOCKING. `inFlight` is the set of member ids whose save is
   * still in the air, and `optimistic` is what we have shown them as while it
   * is. Both are keyed by String(id).
   *
   * This replaced a single `pendingId`: one id, checked at the top of setStatus
   * AND used to disable EVERY checkbox, so marking a row locked the whole table
   * until its round-trip finished. On a Sabha of 240 that is a marker tapping,
   * waiting, tapping, waiting. The row comment even claimed only the written row
   * waited — the intent was always this; the state could not express it.
   */
  const [inFlight, setInFlight] = useState(() => new Set());
  const [optimistic, setOptimistic] = useState(() => new Map());
  /**
   * What this scanning session has marked: how many codes, and whether each
   * belonged to the Sabha being marked or to another one. Session state, not
   * server state — it counts scans, where the Present figure counts people, and
   * conflating the two would double-count a member scanned twice.
   */
  const [scans, setScans] = useState({ total: 0, same: 0, other: 0 });
  const [scanStatus, setScanStatus] = useState('');
  /** Whether the camera is live — the scanning screen is a different screen. */
  const [scanning, setScanning] = useState(false);

  const setScanningState = (active) => {
    setScanning(active);
    onScanningChange?.(active);
  };

  // The members endpoint keys off sabha_id, which is not necessarily the
  // sabha_detail_id everything else here carries.
  const memberSabhaId = sabha?.sabha_id ?? sabha?.id ?? null;

  /**
   * A special sitting belongs to a MANDAL, not to one Sabha — a Janmashtami
   * samaiyo is attended by whoever turns up from across the Mandal. Its
   * `sabha_id` therefore lists nobody, so the Sabha tab was an always-empty
   * list sitting in front of the only list this screen can actually mark from.
   * It is not rendered at all here, and the Mandal list stands alone.
   */
  const isSpecial = String(sabha?.type ?? '').toLowerCase() === 'special';
  /**
   * The tab actually in force. `listTab` is still the control's state for a
   * regular sitting; on a special one there is only one list, so the stored
   * value is ignored rather than reset — nothing can set it, and forcing it
   * through an effect would be a second source of truth for the same fact.
   */
  const activeTab = isSpecial ? 'other' : listTab;

  const summaryQ = useAttendanceSummary(sabhaDetailId || null);
  // Last week's Present/Absent for this Sabha + Present at the same weekday+time
  // last week — the two comparison KPIs below the live tiles.
  const priorQ = usePriorWeek(sabhaDetailId || null);
  const priorWeek = priorQ.data;
  /**
   * The server's view of who is present, and OURS laid over the top.
   *
   * An optimistic entry outranks the server until the server agrees with it.
   * Everything downstream — the tiles, the chips, the status filter, the row —
   * reads `presence`, so a tick lands instantly everywhere rather than only on
   * the checkbox that was tapped.
   *
   * A local overlay rather than patching the React Query cache: the summary
   * arrives in three different shapes (`attendance`, `members`, or a bare
   * array — see presenceMap), and a member being marked for the first time has
   * no row in it at all. Writing into that cache would mean inventing a row,
   * and an invented row with no `user_sabha_id` reads as a GUEST, which would
   * flip the Present/Guests tiles for as long as it existed.
   */
  const serverPresence = useMemo(() => presenceMap(summaryQ.data), [summaryQ.data]);
  const presence = useMemo(() => {
    if (!optimistic.size) return serverPresence;
    const merged = new Map(serverPresence);
    for (const [id, value] of optimistic) merged.set(id, value);
    return merged;
  }, [serverPresence, optimistic]);

  /**
   * Drop an optimistic entry once the refetch confirms it.
   *
   * Only for ids with nothing in flight: a member tapped twice in quick
   * succession has a second save pending, and the refetch that lands between
   * the two carries the FIRST result — dropping the overlay on that would flip
   * the row back for a beat before the second response arrived.
   */
  useEffect(() => {
    if (!optimistic.size) return;
    setOptimistic((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const [id, value] of prev) {
        if (!inFlight.has(id) && serverPresence.get(id) === value) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [serverPresence, inFlight, optimistic.size]);
  const elsewhere = useMemo(() => elsewhereMap(summaryQ.data), [summaryQ.data]);
  const homeSabha = useMemo(() => homeSabhaMap(summaryQ.data), [summaryQ.data]);

  // The WHOLE Sabha, not a page of it — a scanned code has to match any member.
  const sabhaUsersQ = useSabhaMembers(memberSabhaId, Boolean(memberSabhaId));
  const mandalUsersQ = useMandalUsers(Boolean(sabhaDetailId) && activeTab === 'other');

  const sabhaUsers = sabhaUsersQ.rows;

  // "Other Sabha" is every mandal user who is not in the selected Sabha.
  const otherUsers = useMemo(() => {
    const mine = new Set(sabhaUsers.map((m) => String(memberId(m))));
    return pickRows(mandalUsersQ.data).filter((m) => !mine.has(String(memberId(m))));
  }, [mandalUsersQ.data, sabhaUsers]);

  const activeQ = activeTab === 'sabha' ? sabhaUsersQ : mandalUsersQ;
  const activeRows = activeTab === 'sabha' ? sabhaUsers : otherUsers;

  /**
   * EVERY WORD TYPED MUST MATCH SOMETHING, IN ANY ORDER.
   *
   * The list endpoints send `user_name` as first + middle + last, and nearly
   * every member has a middle name on record (1447 of 1449), so a single
   * contiguous `includes(term)` only ever matched a search typed in exactly the
   * stored order. "Amit Gordhan Limbasia" was findable by "amit gordhan" or by
   * "gordhan", but NOT by:
   *
   *   "amit limbasia"   the middle name sits between them
   *   "limbasia amit"   surname first, which is how people usually say it here
   *
   * Splitting on whitespace and requiring EVERY token to appear somewhere fixes
   * both: order stops mattering and gaps stop mattering.
   *
   * AND across tokens, not OR — each extra word must narrow the list. With OR,
   * typing a second word would ADD matches, so a search that was nearly right
   * gets worse the more you type.
   *
   * Each token may match the name OR the mobile, so "limbasia 9867" works and a
   * bare number still searches the number. Substring rather than whole-word, so
   * "limb" finds Limbasia — this is a marking screen, and half a surname typed
   * on a phone should land.
   */
  const searched = useMemo(() => {
    if (!search.trim()) return activeRows;
    // The one app-wide matcher: every typed word must appear in the name or the
    // mobile, in any order (see searchMatches) — so "limbasia 9867" works and a
    // bare number still searches the number.
    return activeRows.filter((m) =>
      searchMatches(`${memberName(m)} ${m.mobile_number ?? ''}`, search),
    );
  }, [activeRows, search]);

  /**
   * The chip counts, taken AFTER the search and BEFORE the status filter — so
   * they answer "of what I am looking at, how many are still missing", and
   * picking a chip does not rewrite the numbers on the other three.
   *
   * Four buckets, and Absent is the one that gets acted on:
   *
   *   present    — status=1 at THIS sitting.
   *   elsewhere  — status=0 here, but the API attached `elsewhere_date`: the
   *                member did attend a Sabha this week, just not this one, so
   *                the door person does not need to chase them.
   *   absent     — status=0 here AND no elsewhere-attendance this week. The
   *                real truant list, and what the follow-up team works from.
   *   all        — everyone on the list.
   *
   * A member the summary has never heard of has neither presence nor an
   * elsewhere date, so they fall into `absent` — the same way the row itself
   * renders. That is what the Mandal (Other Sabha) list is largely made of.
   */
  const counts = useMemo(() => {
    let present = 0;
    let elsewhereCount = 0;
    for (const m of searched) {
      const id = String(memberId(m));
      if (presence.get(id) === true) present += 1;
      else if (elsewhere.get(id)) elsewhereCount += 1;
    }
    return {
      all: searched.length,
      present,
      elsewhere: elsewhereCount,
      absent: searched.length - present - elsewhereCount,
    };
  }, [searched, presence, elsewhere]);

  const visible = useMemo(() => {
    if (statusFilter === 'all') return searched;
    return searched.filter((m) => {
      const id = String(memberId(m));
      const isPresent = presence.get(id) === true;
      const isElsewhere = !isPresent && Boolean(elsewhere.get(id));
      if (statusFilter === 'present') return isPresent;
      if (statusFilter === 'elsewhere') return isElsewhere;
      // 'absent' — status=0 here AND not accounted for elsewhere this week.
      return !isPresent && !isElsewhere;
    });
  }, [searched, statusFilter, presence, elsewhere]);

  // /users/list has no offset, so the whole Sabha arrives at once and is paged
  // here — the same arrangement MembersPage uses. This screen used to force a
  // bigger page than the rest of the app, because walking a whole Sabha ticking
  // people off a few names at a time is a page turn every few seconds. It no
  // longer needs to: the reader picks the size from the pager's Show dropdown,
  // and 100 is one of the choices.
  const { page, setPage, pageSize, setPageSize, pageCount, total: pageTotal, pageRows } =
    useClientPagination(visible);

  /**
   * What the table actually renders: a page on a desk, THE WHOLE LIST on a phone.
   *
   * No pager and no progressive reveal below `sm`. The list is walked one thumb
   * at a time with a camera in the other hand, and every stopping point — a page
   * number to hit, a batch that has to be scrolled to before the next arrives —
   * is a place the walk can lose its position. The rows are already in memory
   * (the scanner needs the whole Sabha to match any code against), so showing
   * all of them costs a taller document and no extra request.
   */
  const listRows = isNarrow ? visible : pageRows;

  // Counters come from the API when it sends them, and are derived from the
  // presence map only as a fallback — never invented.
  //
  // Five figures on the strip, three of them split out from what used to be a
  // single blended "Present":
  //
  //   total       — this Sabha's own roster (visitors don't count against it)
  //   present     — OWN members Present at this sitting (venue view, own-only)
  //   guests      — visitors from another Sabha Present at this sitting
  //   elsewhere   — OWN members Absent here but Present at another Sabha this week
  //   absent      — OWN members neither Present here nor Elsewhere this week
  //
  //   Head Count in the room = present + guests. Renders as a subtitle on the
  //   Present tile so a Sabha Head can read "48 own + 25 guests = 73 in the
  //   room" without adding it in their head.
  //
  // The homeSabha map keys off `attendance.user_sabha_id` — the write-once
  // snapshot at attend time — so a member who has since transferred is still
  // counted against the Sabha they belonged to when they attended. That is
  // what makes the two sides of the split (Own vs Guests) reconcile with the
  // /sabhadetails card and the Weekly Attendance report.
  const total = summaryQ.data?.total_members ?? summaryQ.data?.total_count ?? sabhaUsers.length;
  const ownSabhaId = sabha?.sabha_id ?? null;

  const { present, guests, elsewhereCount } = useMemo(() => {
    let ownPresent = 0;
    let guestsN = 0;
    let elseN = 0;
    // Walk the presence map (which is derived from every attendance row on
    // this sitting, including visitor rows). One pass over it counts all
    // three cohorts consistently.
    for (const [uidStr, isPresent] of presence.entries()) {
      if (isPresent) {
        const home = homeSabha.get(uidStr);
        // Home unknown → default to "guest" only if this is a Special sitting
        // (no home Sabha to compare against) or the row genuinely lacks a
        // snapshot; on a regular sitting the row is almost always tagged.
        if (ownSabhaId != null && home === ownSabhaId) ownPresent += 1;
        else guestsN += 1;
      } else if (elsewhere.get(uidStr)) {
        elseN += 1;
      }
    }
    // Elsewhere count is ALWAYS an own-Sabha metric — a visitor from another
    // Sabha "attending elsewhere this week" is about their home, not ours, so
    // it does not belong in this tile.
    return { present: ownPresent, guests: guestsN, elsewhereCount: elseN };
  }, [presence, elsewhere, homeSabha, ownSabhaId]);

  // Head count in the room: own members present + visitors present. Shown as
  // its own tile ("Today") so a Sabha Head reads the total attendance without
  // adding it in their head.
  const headCount = present + guests;

  // Present vs the SAME point last week — the delta shown on the Present tile.
  // Only when last week's baseline is available (a regular sitting with a prior
  // week on record); null → the tile shows just the count. Up (green) = ahead of
  // last week at this time, down (red) = behind.
  const presentBaseline =
    priorWeek && priorWeek.last_week_date ? priorWeek.present_same_time_last_week : null;
  const presentDelta = presentBaseline == null ? null : present - presentBaseline;

  // Absent now means "truly missed the week" — own members neither Present
  // here nor Elsewhere. The old subtraction (`total - present`) blended
  // together the members who attended another Sabha with the members who
  // genuinely missed everything, which is exactly what made a screen with no
  // marks yet read as "242 absent" when the real answer is "we don't know
  // yet". Elsewhere is split out; Absent is what remains.
  const absent = Math.max(0, total - present - elsewhereCount);

  /**
   * Mark one member. The local tick is applied immediately and the request goes
   * out behind it, so the LIST can mark the next member without waiting and
   * several saves can be in the air at once.
   *
   * Returns a Promise that resolves to whether the server actually STORED the
   * mark — true on success, false on rejection or error. The list path ignores
   * it (the instant tick is the synchronous optimistic update above, and the
   * checkbox + tiles are the confirmation), so its speed is unchanged. The
   * scanner does NOT use this — it marks through the verified `qr_token` path in
   * `onScan` — so this stays the list's own fast, fire-and-forget marker.
   *
   * Only a second mark of the SAME member is refused, and only while that
   * member's own save is still running. Any other row is always available.
   *
   * On failure the optimistic entry is rolled back — the row returns to whatever
   * the server last said — and the error is toasted. Errors are never silent;
   * it is only success that is.
   *
   * SUCCESS IS SILENT for the list, for exactly that reason. A toast per mark
   * was reasonable when each one cost a round-trip of waiting; at the speed this
   * now allows it would be fifty toasts to mark fifty members, burying the one
   * that matters. `onScan` adds its own feedback, since a scan has no row on
   * screen to watch.
   */
  const setStatus = (member, next) => {
    const id = memberId(member);
    if (!sabhaDetailId || id == null) return Promise.resolve(false);
    const key = String(id);
    if (inFlight.has(key)) return Promise.resolve(false);

    setOptimistic((prev) => new Map(prev).set(key, next));
    setInFlight((prev) => new Set(prev).add(key));

    // ⚠ `mutateAsync` AND THE PROMISE — NOT `mutate(vars, { onError, onSettled })`.
    //
    // This is not a style preference, and reverting it will reintroduce rows
    // that spin forever. From @tanstack/query-core's MutationObserver:
    //
    //     mutate(variables, options) {
    //       this.#mutateOptions = options;                 // ONE slot
    //       this.#currentMutation?.removeObserver(this);   // detaches the last
    //       ...
    //     }
    //
    // One observer is shared by every call to this hook. Each `mutate` both
    // OVERWRITES the per-call callbacks and DETACHES the mutation before it,
    // so in a burst only the final mark's `onSettled` ever runs. Every earlier
    // member stays in `inFlight` — spinner up, checkbox disabled — until the
    // page is reloaded. The request itself succeeded; the callback was simply
    // orphaned, which is why no timeout or retry could rescue it.
    //
    // `mutateAsync` returns THAT execution's own promise, so `.catch`/`.finally`
    // belong to this member and cannot be replaced by the next tap.
    //
    // The `onSettled` inside `useMarkAttendance` is safe and stays where it is:
    // mutation-level options are read from `this.options` on the Mutation
    // itself (mutation.js), not from the observer, so they fire once per
    // execution as intended.
    return mark
      .mutateAsync({ sabhaDetailId, userIds: [id], status: next })
      .then(() => true)
      .catch((err) => {
        // Roll this member back; leave every other pending mark alone.
        setOptimistic((prev) => {
          const rolled = new Map(prev);
          rolled.delete(key);
          return rolled;
        });
        const who = member?.user_name ?? member?.name ?? `Member #${id}`;
        toast.error(
          err?.status === 0
            ? `Network error — ${who} was not marked. Check your connection.`
            : err?.detail || err?.message || `Could not update ${who}.`
        );
        return false;
      })
      // `finally` passes the true/false through untouched, so the caller still
      // learns whether the write landed.
      .finally(() => {
        setInFlight((prev) => {
          const done = new Set(prev);
          done.delete(key);
          return done;
        });
      });
  };

  /**
   * A scan marks the member the code names, through the same
   * POST /attendance/attendance/mark-bulk the checkboxes use — but by TOKEN.
   *
   * The raw scanned string is sent as `qr_token` and the BACKEND verifies its
   * signature and resolves the one member. The browser cannot verify the
   * signature (the signing secret is server-only), so it never trusts an id it
   * pulled out of the code — a wrong / foreign / forged QR verifies to nothing
   * and marks nobody, even when the number it contains is a real member id.
   *
   * `memberIdFromCode` is used only as a cheap local pre-filter (reject a code
   * that is not even shaped like one of ours, without a round-trip) and to name
   * the member in the toast before the server answers. The response is the
   * authority on who — if anyone — was marked.
   */
  const onScan = async (raw) => {
    // Local pre-filter only: a code that is not shaped like an Akshar Connect
    // QR (a payment / random QR) is rejected here with no round-trip. The id is
    // for display; the backend still decides.
    const displayId = memberIdFromCode(raw);
    if (displayId == null) {
      toast.error('That is not an Akshar Connect QR code.');
      return;
    }
    const known = [...sabhaUsers, ...otherUsers].find((m) => String(memberId(m)) === String(displayId));
    if (presence.get(String(displayId))) {
      toast.info(`${known ? memberName(known) : `Member #${displayId}`} is already marked present.`);
      return;
    }

    // Mark by TOKEN — the backend verifies and resolves the member.
    let res;
    try {
      res = await mark.mutateAsync({ sabhaDetailId, qrToken: raw, status: true });
    } catch (err) {
      toast.error(
        err?.status === 0
          ? 'Network error — nothing was marked. Check your connection.'
          : err?.detail || err?.message || 'That code did not match a member — nothing was marked.'
      );
      return;
    }

    // The server's resolved member is the truth; fall back to the display id
    // only for naming if the response omitted it.
    const marked = res?.data ?? null;
    const markedId = marked?.user_id ?? displayId;
    const markedName = marked?.name || (known ? memberName(known) : `Member #${markedId}`);

    if (marked?.is_duplicate) {
      toast.info(`${markedName} is already marked present.`);
      return;
    }

    // "Same Sabha" means the member belongs to the Sabha being marked; anyone
    // else is a visitor from elsewhere in the Mandal, which is worth seeing
    // separately when reconciling numbers afterwards.
    const isSame = sabhaUsers.some((m) => String(memberId(m)) === String(markedId));
    setScans((s) => ({
      total: s.total + 1,
      same: s.same + (isSame ? 1 : 0),
      other: s.other + (isSame ? 0 : 1),
    }));
    setScanStatus(`${markedName} marked present`);
  };

  const sabhaTabLabel = sabha ? String(sabha.sabha_name ?? 'Sabha Users') : 'Sabha Users';

  /**
   * The second list's name. On a regular sitting it is everyone who is NOT in
   * the Sabha named on the first tab, so "Other Sabha" says it. On a special
   * one there is no first tab to be other than — the list is simply the Mandal
   * holding the event, so it is named after it. `mandal_name` rides on the
   * sabhadetails row; without it the label falls back to the generic wording
   * rather than printing "undefined Members".
   */
  const mandalName = sabha?.mandal_name ? String(sabha.mandal_name).trim() : '';
  const otherTabLabel = isSpecial && mandalName ? `${mandalName} Members` : isSpecial ? 'Mandal Members' : 'Other Sabha';

  return (
    <div className="space-y-5">
      {/* This session's tally, above the camera: how many codes have been
          scanned, and how they split between this Sabha and visitors.

          Three across on a phone as well, for the reason the member-list
          figures below are: this is read WHILE the camera is open, and stacked
          it pushed the viewfinder off the screen. */}
      {mode === 'scanner' && scanning && (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <Tally label="Total" value={scans.total} />
          <Tally label="This Sabha" value={scans.same} tone="ok" />
          <Tally label="Other" value={scans.other} />
        </div>
      )}

      {/* Scanner or list — one at a time. The camera is the point of the screen,
          but on a desktop without one the list is, and showing both left the
          list below a permanent "not available" panel. */}
      {!scanning && (
        <Segmented
          value={mode}
          onChange={setMode}
          options={[{ key: 'scanner', label: 'Start Scanner' }, { key: 'list', label: 'Member List' }]}
        />
      )}

      {mode === 'scanner' && (
        <QrScanner
          onScan={onScan}
          disabled={!sabhaDetailId}
          disabledHint="Select a Sabha to enable the scanner."
          sessionLabel={sabha ? String(sabha.sabha_name ?? '') : null}
          status={scanStatus}
          onActiveChange={setScanningState}
        />
      )}

      {Boolean(sabhaDetailId) && mode === 'list' && (
        <>
          {/* Only appears if the backend capped the request below the Sabha's
              size. Scanning against a partial list has to be visible — silently
              missing members is how this failed before. */}
          {sabhaUsersQ.truncated && (
            <div className="rounded-card border border-accent/40 bg-accent/10 px-4 py-3">
              <p className="text-sm text-primary">
                Only <span className="font-semibold">{formatNumber(sabhaUsers.length)}</span> of{' '}
                <span className="font-semibold">{formatNumber(sabhaUsersQ.total)}</span> members
                could be loaded. Scanning will not find the rest — mark them from the member list,
                and report this so the limit can be raised.
              </p>
            </div>
          )}

          {/* EIGHT figures on a Regular sitting in ONE grid — two columns on a
              phone (four rows), four across from `sm` up (a 4×2 block on desktop):
                Row 1  TOTAL     ABSENT    PRESENT   ELSEWHERE   — roster & today
                Row 2  OTHER     TODAY     LAST WK (same time)   LAST WK P|A
              The last two are last week's comparison, now in the same grid so the
              whole block reads as one unit rather than a strip plus a stray row.
              A Special sitting has no home Sabha to split OWN vs GUESTS and no
              weekly Sabha to compare, so only the meaningful three appear
              (Total, Present, Absent) in a 3-up row. */}
          <div
            className={`grid gap-2.5 sm:gap-3 ${
              isSpecial ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
            }`}
          >
            <Tally label="Total" value={formatNumber(total)} loading={summaryQ.isLoading} />
            <Tally label="Absent" value={formatNumber(absent)} loading={summaryQ.isLoading} tone="bad" />
            <Tally
              label="Present"
              loading={summaryQ.isLoading}
              tone="ok"
              value={
                <span className="inline-flex items-baseline gap-1">
                  <span>{formatNumber(present)}</span>
                  {presentDelta ? (
                    <span
                      className={`inline-flex items-center text-xs font-semibold ${
                        presentDelta > 0 ? 'text-success-fg' : 'text-danger-fg'
                      }`}
                    >
                      {presentDelta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {formatNumber(Math.abs(presentDelta))}
                    </span>
                  ) : null}
                </span>
              }
            />
            {!isSpecial && (
              <Tally label="Elsewhere" value={formatNumber(elsewhereCount)} loading={summaryQ.isLoading} />
            )}
            {!isSpecial && (
              <Tally label="Other" value={formatNumber(guests)} loading={summaryQ.isLoading} />
            )}
            {!isSpecial && (
              <Tally
                label="Today"
                value={formatNumber(headCount)}
                loading={summaryQ.isLoading}
                tone="ok"
              />
            )}
            {/* LAST WEEK comparison, in the same grid: (1) Present by the SAME
                weekday+time last week — the apples-to-apples number the Present
                tile's arrow is measured against; (2) last week's final
                Present | Absent for this Sabha. */}
            {!isSpecial && (
              <Tally
                label="Last Wk (same time)"
                loading={priorQ.isLoading}
                value={priorWeek ? formatNumber(priorWeek.present_same_time_last_week) : '—'}
              />
            )}
            {!isSpecial && (
              <Tally
                label="Last Wk P | A"
                loading={priorQ.isLoading}
                value={
                  priorWeek ? (
                    <span>
                      <span className="text-success-fg">{formatNumber(priorWeek.last_week_present)}</span>
                      <span className="px-1 text-text-faint">|</span>
                      <span className="text-danger-fg">{formatNumber(priorWeek.last_week_absent)}</span>
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
            )}
          </div>

          <div className="space-y-4">
            {/* The first tab is named after the Sabha itself, and on a special
                sitting there is no first tab: a single option, which `flex-1`
                takes end to end, so the one list is headed rather than offered
                as a choice between itself and nothing. */}
            <Segmented
              value={activeTab}
              onChange={(key) => { setListTab(key); setSearch(''); setStatusFilter('all'); }}
              options={
                isSpecial
                  ? [{ key: 'other', label: otherTabLabel }]
                  : [{ key: 'sabha', label: sabhaTabLabel }, { key: 'other', label: otherTabLabel }]
              }
            />

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7FA3]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or mobile"
                  className="w-full rounded-xl border border-[#E0EAF4] bg-white py-2.5 pl-9 pr-3 text-sm text-primary outline-none transition-all placeholder:text-[#9BB5CB] focus:border-primary/50 focus:shadow-[0_0_0_3px_rgba(0,49,88,0.08)]"
                />
              </div>
              {/* The running total is a desk fact: on a phone the same two
                  numbers are already in the strip above AND on the chips below,
                  and a third copy took a line of its own from a screen that
                  wants it for names. */}
              <span className="tnum hidden shrink-0 rounded-xl bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary sm:inline">
                {formatNumber(present)} / {formatNumber(total)} Present
              </span>
            </div>

            <StatusFilter value={statusFilter} onChange={setStatusFilter} counts={counts} />

            {activeQ?.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : activeQ?.error ? (
              <ErrorState error={activeQ.error} onRetry={activeQ.refetch} title="Could not load members" />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={Users}
                title={search || statusFilter !== 'all' ? 'No matches' : 'No members'}
                hint={
                  search
                    ? 'No member matches that search.'
                    : statusFilter === 'present'
                      ? 'Nobody on this list is marked present yet.'
                      : statusFilter === 'elsewhere'
                        ? 'Nobody on this list was marked present at another Sabha this week.'
                        : statusFilter === 'absent'
                          ? 'Everyone on this list has attended somewhere this week.'
                          : 'Nothing to show for this list.'
                }
              />
            ) : (
              <>
                {/* NO `min-w`, and `table-fixed` rather than auto.
                    `min-w-[34rem]` was left over from when this table had four
                    columns; with two it only forced 544px of table into a 400px
                    phone and handed the reader a sideways scroll to reach the
                    checkbox — the one control on the row. Fixed layout is what
                    makes the name `truncate` instead of widening its column: in
                    an auto table the longest name sets the width and pushes the
                    action off-screen again. */}
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed border-collapse">
                    {/*
                      `.table-th` supplies the grey band and the type; PADDING IS
                      PER-TABLE and this one had `px-2 pb-2` — bottom padding
                      only. The labels sat on the floor of their own band with
                      the gap all above them, and 8px of side padding left them
                      tight against the card edge while the rows beneath used
                      more. Even `py`, and `px` matching the cells below, so the
                      band reads as a heading for the column rather than a stripe
                      the words happen to be near.

                      The `tr` carried its own uppercase/size/border classes,
                      every one of them already in `.table-th` and one of them
                      (`text-[11px]`) losing to it — so a rule that looked like
                      it set the header's size did nothing. Gone.
                    */}
                    <thead>
                      <tr>
                        <th className="table-th rounded-l-lg px-3 py-2.5">Name</th>
                        {/* Wide enough for the badge, the gap and the box, and
                            no wider — everything left over is the name's. */}
                        <th className="table-th w-24 rounded-r-lg px-2 py-2.5 !text-right sm:w-[8.5rem] sm:px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listRows.map((m) => {
                        const id = memberId(m);
                        const isPresent = presence.get(String(id)) === true;
                        const writing = inFlight.has(String(id));
                        // Only interesting when this row shows Absent — if the
                        // row is Present here, "also present elsewhere" is
                        // noise. Formatted DD-MM-YYYY to match the rest of the
                        // app.
                        const elsewhereISO = !isPresent ? elsewhere.get(String(id)) : null;
                        const elsewhereLabel = elsewhereISO ? formatElsewhereDate(elsewhereISO) : null;
                        return (
                          <tr
                            key={id}
                            className="border-b border-[#F0F4F9] transition-colors last:border-b-0 hover:bg-primary-50/40"
                          >
                            {/* Name and action — nothing else. The mobile number
                                is still searchable; it is just not a column.

                                The Sabha rides IN the name rather than in a
                                column of its own — set in brackets, a point
                                down and in the muted grey, so the row reads as
                                one fact instead of three. Role is gone
                                entirely: it said nothing about whether someone
                                attended.

                                ONLY ON THE OTHER SABHA TAB. There, the list is
                                the whole Mandal and the Sabha is what tells one
                                Aakash from another. On the first tab every row
                                is by definition from the Sabha the tab is named
                                after, so printing it against each name repeats
                                the heading once per member and distinguishes
                                nobody from anybody.

                                An ABSENT row that has an `elsewhere_date` gets
                                that date printed next to the name in the same
                                muted grey. Its meaning: "this member did
                                attend a Sabha this week — just not this one".
                                Absent here, so the checkbox is still unchecked
                                and the row still reads as Absent; the tag only
                                tells the reader not to chase them for the
                                week. Shown only when Absent, because a Present
                                row with the same tag would say a member was
                                marked present at two sittings in one week —
                                which shouldn't happen and, if it does, is a
                                data problem to fix upstream.

                                `!text-[0.875rem]` is Tailwind's own `text-sm`,
                                a point below the `.content-type` version the
                                name beside it gets — see index.css. */}
                            <td className="px-2 py-3 sm:px-3">
                              <p className="truncate text-sm font-semibold text-primary">
                                {memberName(m)}
                                {/* sm+ has room to sit the Sabha / elsewhere tag
                                    INLINE after the name. Below sm it is stacked
                                    on its own line (the <p> below) so the name
                                    never shares a cramped line with a bracketed
                                    Sabha and get chopped to "(Sarj…". */}
                                {activeTab === 'other' && m.sabha_name && (
                                  <span className="ml-1.5 hidden !text-[0.875rem] font-normal text-text-muted sm:inline">
                                    ({m.sabha_name})
                                  </span>
                                )}
                                {elsewhereLabel && (
                                  <span
                                    className="ml-1.5 hidden !text-[0.875rem] font-normal text-text-muted sm:inline"
                                    title="Marked present at another Sabha in the same week"
                                  >
                                    ({elsewhereLabel})
                                  </span>
                                )}
                              </p>
                              {/* Mobile only: the Sabha (and any elsewhere date)
                                  as a muted second line, with the full row width
                                  to truncate in rather than eating the name's. */}
                              {((activeTab === 'other' && m.sabha_name) || elsewhereLabel) && (
                                <p className="mt-0.5 truncate text-xs font-normal text-text-muted sm:hidden">
                                  {activeTab === 'other' && m.sabha_name ? m.sabha_name : ''}
                                  {activeTab === 'other' && m.sabha_name && elsewhereLabel ? ' · ' : ''}
                                  {elsewhereLabel && (
                                    <span title="Marked present at another Sabha in the same week">
                                      {elsewhereLabel}
                                    </span>
                                  )}
                                </p>
                              )}
                            </td>
                            <td className="px-2 py-3 sm:px-3">
                              {/* `whitespace-nowrap`: the cell is now a fixed
                                  width, and without it "Present" breaks across
                                  two lines inside its own pill. */}
                              <label className="flex items-center justify-end gap-1.5 whitespace-nowrap sm:gap-2.5">
                                {/* THE BADGE SHOWS THE NEW STATE IMMEDIATELY —
                                    `isPresent` already reads through the
                                    optimistic overlay, so the row says "Present"
                                    the instant it is tapped.
                                    It used to be REPLACED by a spinner until the
                                    server answered, which is what made marking
                                    feel like queueing even after the table
                                    stopped locking: the one row you just touched
                                    sat spinning, so the natural thing was to wait
                                    for it. The spinner is now a small mark
                                    BESIDE the answer — "still saving", not "ask
                                    me later". */}
                                {/* Full words where there is room; P / Ab below
                                    sm, where the name needs every pixel. */}
                                <Badge tone={isPresent ? 'ok' : 'neutral'}>
                                  <span className="sm:hidden">{isPresent ? 'P' : 'Ab'}</span>
                                  <span className="hidden sm:inline">{isPresent ? 'Present' : 'Absent'}</span>
                                </Badge>
                                {writing && (
                                  <Loader2
                                    className="h-3 w-3 shrink-0 animate-spin text-text-faint"
                                    aria-label="Saving"
                                  />
                                )}
                                <input
                                  type="checkbox"
                                  checked={isPresent}
                                  // Only the row being written waits; every other
                                  // row stays operable — which is now true of the
                                  // state as well as of this comment.
                                  disabled={writing}
                                  onChange={(e) => setStatus(m, e.target.checked)}
                                  aria-label={`Mark ${memberName(m)} present`}
                                  className="h-5 w-5 shrink-0 cursor-pointer rounded border-line-input accent-success-fg disabled:cursor-not-allowed disabled:opacity-50"
                                />
                              </label>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {isNarrow ? (
                  // The foot of a list that has no more to give. It says so
                  // rather than ending on a blank edge, which reads as a list
                  // still loading.
                  <p className="tnum py-1 text-center text-xs text-text-muted">
                    All {formatNumber(visible.length)} shown
                  </p>
                ) : (
                  <MemberPager page={page} pageCount={pageCount} total={pageTotal} onChange={setPage} pageSize={pageSize} onPageSize={setPageSize} />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
