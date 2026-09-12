import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Cake, Check, Crown, Gift, PartyPopper, Phone, Star } from 'lucide-react';
import { useMyBirthdayWishes, useSendBirthdayWish, useTodayBirthdays, useToast } from '../hooks';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { Breadcrumbs, Tabs } from '../components/Navigation';
import { Modal } from '../components/Overlays';
import { FormField, Textarea } from '../components/form';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { DEFAULT_WISH, birthdayMessage } from '../utils/birthdayWish';
import { hasMobile, telUrl, whatsAppUrl } from '../utils/contact';
import { readDate } from '../utils/dates';

// Birthdays — the page both dashboard tiles link to, and where the after-login
// popup sends anyone who was wished.
//
// TWO TABS, AND THEY FACE OPPOSITE WAYS:
//
//   Send Wishes  today's birthdays in the caller's scope — people to wish.
//                GET /users/today-birthdays.
//   My Wishes    the wishes sent TO the signed-in member — people who wished
//                them. GET /users/my-birthday-wishes.
//
// The tab is in the URL (`?tab=received`) rather than in state alone, so the
// popup's "View all wishes" can open the page ON the second tab, and so the
// second tab can be linked to and reloaded. An unknown value falls back to the
// first tab rather than rendering nothing.
//
// ONE TABLE, LISTING EVERYONE ONCE. GET /api/v1/users/today-birthdays answers
// `{ users, followup }` and the page reads only `users` — that list arrives
// ALREADY SORTED by the backend, personal follow-ups first, then same Sabha,
// then same Mandal, then wider. Every row carries `tier` and `contact`, which
// this page reads directly rather than intersecting with `followup`.
//
// WHO GETS CALL + WHATSAPP DEPENDS ON THE CALLER'S RANK, and the backend has
// already answered that per row via `contact`:
//
//   Yuva Seva (20)                only on personal follow-ups
//   Sabha Head / DB Mgr (30/40)   personal + everyone in the same Sabha
//   Mandal Head / DB Mgr (50/60)  personal + everyone in the same Mandal
//   Pradesh / SuperAdmin          same as Mandal
//   Yuvak (10)                    nobody — Wish button only, Sabha-scoped list
//
// PLUS A BOTTOM-UP EXCEPTION: every caller may Call + WhatsApp their own
// LEADERS on the leader's birthday — the follow-up sevak, the Sabha Head or
// DB Manager, the Mandal Head or DB Manager. The backend flags those rows
// with `is_leader` and forces `contact=true`, and for a Yuvak whose base
// scope is Sabha-only it also PULLS the Mandal Head into the list so the
// row exists to click on at all. Ceiling is Mandal — Pradesh and above are
// never leaders in this sense.
//
// WHAT A CONTACT ROW GETS THAT THE OTHERS DO NOT
//
//   the mobile number   printed after the name — "Nehal Ankit Sojitra ·
//                       9998989877" — rather than in a column of its own. A
//                       column would be a mostly-empty stripe down a page where
//                       few rows can fill it; after the name it is simply one
//                       more thing known about that person. Only rows the caller
//                       may actually reach carry it, so opening the dashboard
//                       does not spill a contact list of the whole scope.
//   the WhatsApp button — which needs that number to exist at all.
//   the Call button     — same number, and PHONES ONLY (see CallButton).
//
// WHAT A PERSONAL ROW GETS ON TOP OF THAT
//
//   a filled orange star after the name — the reader may have Call + WhatsApp
//   on a hundred Mandal rows, and the star is what tells them "and this one is
//   on your plate". A legend above the list explains the star once, and only
//   when there is at least one personal row to explain. No text pill under the
//   name: the star + legend are already the signal, and the pill was the same
//   thing said twice.
//
// Everyone gets Send wishes. The three buttons are not three ways of doing one
// thing:
//   Send wishes  the BACKEND sends the org's own template, by hand, for someone
//                the nightly cron missed.
//   WhatsApp     composes the message and hands it to WhatsApp, so it goes out
//                from the reader's own number, in their own words, and they can
//                edit it before sending.
//   Call         no message at all — it dials, so the wish is spoken. Only
//                rendered below `md`, because only a phone can place the call.
//
// No permission gate. The endpoint has none — any authenticated member may call
// it, Yuvaks included — and scope is not a choice: it is decided by the caller's
// rank on the backend.

const nameOf = (row) => String(row?.user_name ?? '').trim() || `Member #${row?.user_id ?? ''}`;

/**
 * Opens the wish popup for one member.
 *
 * SPENT FOR THE DAY, NOT FOR THE PAGE. `already_wished` on the row is the
 * server's answer to "have I wished this member today", read from the same
 * `birthday_logs` row and the same `wish_date` the API's unique constraint
 * enforces — so the button survives a reload, a second tab and a different
 * device, and cannot disagree with the 409 that would have refused the send.
 *
 * OR'd with the page's own memory rather than replacing it: the flag is only as
 * fresh as the last fetch of the list, and the wish just sent from this screen
 * has to land on the button immediately, before any refetch returns.
 */
function WishButton({ row, sent, onClick }) {
  const done = sent || row?.already_wished === true;
  return (
    <Button
      variant={done ? 'ghost' : 'outline'}
      className="!py-2 !text-xs"
      onClick={onClick}
      disabled={done || row?.user_id == null}
      // Says WHY it is spent. "Sent" alone, on a page opened fresh the next
      // morning, reads as a button that has broken rather than one whose work
      // is done — and the wish can be sent again tomorrow.
      title={done ? `You have already wished ${nameOf(row)} today` : undefined}
    >
      {/* "Sent" keeps its own word and its tick: the button's whole job after it
          has been pressed is to say it has been, and a second party popper would
          not distinguish the two states. */}
      {done ? <Check className="h-3.5 w-3.5" /> : <PartyPopper className="h-3.5 w-3.5" />}
      {done ? 'Sent' : 'Wish'}
    </Button>
  );
}

/**
 * The wish itself — one field and a Send button.
 *
 * WHY A POPUP AND NOT A ONE-CLICK SEND. The API takes a `message`, and it is the
 * sender's own rather than a template the backend fills in. Sending a fixed
 * string without showing it would mean putting words in someone's mouth and not
 * telling them which words.
 *
 * The field starts at DEFAULT_WISH and is REQUIRED — Send stays disabled while
 * it is empty or blank, because the endpoint would take a message of spaces and
 * deliver exactly that.
 *
 * `dismissible={false}` while sending: the request is this dialog's own, and
 * walking away from it mid-flight would leave the row unable to say whether the
 * wish went.
 */
function WishDialog({ person, isOpen, onClose, onSent }) {
  const toast = useToast();
  const wish = useSendBirthdayWish();
  const [message, setMessage] = useState(DEFAULT_WISH);

  // Back to the default for each person the dialog is opened for, so a message
  // typed for one member is never sent to the next.
  useEffect(() => {
    if (isOpen) setMessage(DEFAULT_WISH);
  }, [isOpen, person?.user_id]);

  const text = message.trim();

  const send = async () => {
    if (!text || person?.user_id == null) return;
    try {
      const res = await wish.mutateAsync({ userId: person.user_id, message: text });
      onSent(person.user_id);
      onClose();
      // "Queued", not "delivered": the record comes back `status: pending`.
      toast.success(res?.detail || `Birthday wish queued for ${nameOf(person)}.`);
    } catch (err) {
      /**
       * 409 IS NOT A FAILURE TO REPORT AS ONE. The API refuses a second wish to
       * the same member on the same day, and the only way to arrive here is
       * with a button that believed it had not been spent — a list fetched
       * before the wish was sent from another tab or another device. The
       * outcome the member wanted is already true, so the row is marked and the
       * dialog closes exactly as it would have on a fresh send. Only the wording
       * differs, and it is not an error toast.
       */
      if (err?.status === 409) {
        onSent(person.user_id);
        onClose();
        toast.info(err?.detail || err?.message || `You have already wished ${nameOf(person)} today.`);
        return;
      }
      toast.error(err?.detail || err?.message || 'Could not send the wish.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!wish.isPending}
      title="Send Birthday Wish"
      description={person ? `To ${nameOf(person)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={wish.isPending}>Cancel</Button>
          <Button variant="accent" onClick={send} busy={wish.isPending} disabled={!text}>
            <PartyPopper className="h-4 w-4" />
            Send
          </Button>
        </>
      }
    >
      <FormField label="Message" htmlFor="wish-message" required>
        <Textarea
          id="wish-message"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={wish.isPending}
          placeholder="Write your wish…"
        />
      </FormField>
    </Modal>
  );
}

/**
 * The personal channel — follow-up members only.
 *
 * THE MARK ALONE, NO LABEL. WhatsApp's glyph in WhatsApp's green is known on
 * sight, and the word beside it was the widest thing in the row for no reading
 * anyone needed. The name is still carried for anyone who cannot see it: `title`
 * for a pointer, `aria-label` for a screen reader.
 *
 * `mobile_number` is nullable, and WhatsApp is the only thing this button does:
 * with no number there is nowhere to send, so it is not rendered rather than
 * rendered dead.
 */
function WhatsAppButton({ row, mobile }) {
  if (!hasMobile(mobile)) return null;
  const label = `Wish ${nameOf(row)} on WhatsApp`;
  // Wish goes to the member's WhatsApp number (falls back to the calling number,
  // which is what `mobile` already is); the Call button keeps using `mobile`.
  const whatsapp = row?.whatsapp_number || mobile;
  return (
    <a
      href={whatsAppUrl(whatsapp, birthdayMessage(nameOf(row)))}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-white transition-transform hover:scale-105"
      style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
    >
      <WhatsAppIcon className="h-4 w-4" />
    </a>
  );
}

/**
 * Ring the member and wish them out loud — PHONES ONLY.
 *
 * `md:hidden`, the same cut MemberList draws between its mobile cards and its
 * desktop table. A `tel:` link is only an action on something that can place a
 * call; on a desktop it hands off to whatever happens to be registered — Skype,
 * a "choose an app" prompt, or silence — none of which is what the tap promised.
 * A button that does nothing on the machine you are looking at is worse than one
 * that is not there, so above a phone it is not rendered rather than rendered
 * dead.
 *
 * Sits beside WhatsApp and reads as its sibling: the mark alone, no label, the
 * name carried in `title` / `aria-label`. Navy rather than WhatsApp's green,
 * because two green discs side by side would read as one control drawn twice.
 *
 * Same dependency as WhatsApp — the number is the whole button, so without one
 * there is nobody to ring.
 */
function CallButton({ row, mobile }) {
  if (!hasMobile(mobile)) return null;
  const label = `Call ${nameOf(row)}`;
  return (
    <a
      href={telUrl(mobile)}
      title={label}
      aria-label={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-white transition-transform hover:scale-105 md:hidden"
      style={{ background: 'linear-gradient(135deg, #0A5C96, #003158)' }}
    >
      <Phone className="h-4 w-4" />
    </a>
  );
}

/** The avatar disc every row on this page leads with. */
function Initial({ name }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold text-white"
      style={{
        background: 'linear-gradient(135deg, #FBBF24, #F97316)',
        boxShadow: '0 4px 10px rgba(251,146,60,0.30)',
      }}
    >
      {String(name ?? '?').charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * TAB 2 — the wishes the signed-in member has RECEIVED.
 *
 * A record is `{ id, send_user_id, message, status, wish_date }`, so the SENDER
 * arrives as an id. Whether a name rides along with it is not something this app
 * can require, hence the run of spellings below and the fall back to "A member"
 * — never to a bare number, which would name nobody and look like a bug.
 *
 * The message is the whole point of the row, so it is what the row is: the
 * sender and the date are the caption under it.
 */
function ReceivedWishes() {
  const { rows, isLoading, error, refetch } = useMyBirthdayWishes();

  if (isLoading) {
    return (
      <div className="card space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }
  if (error) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={refetch} title="Could not load your wishes" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={Gift}
          title="No wishes yet"
          hint="Wishes sent to you on your birthday will appear here."
        />
      </div>
    );
  }

  return (
    <div className="card divide-y divide-line-soft p-0">
      {/* A count, in the page's own festive tone. Being wished by eleven people
          is the thing this tab is opened to find out. */}
      <p className="bg-[#FFF7ED] px-4 py-3 text-sm font-semibold text-[#9A3412]">
        {rows.length === 1 ? 'One wish for you' : `${rows.length} wishes for you`}
      </p>
      {rows.map((wish, i) => {
        const from =
          wish?.send_user_name || wish?.sender_name || wish?.from_user_name ||
          wish?.user_name || 'A member';
        const when = readDate(wish?.wish_date);

        return (
          <div key={wish?.id ?? i} className="flex items-start gap-3 px-4 py-3">
            <Initial name={from} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-primary">{wish?.message || '—'}</p>
              <p className="mt-0.5 text-xs text-text-muted">
                <span className="font-semibold">{from}</span>
                {when && <span className="tnum"> · {when.date}</span>}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A small filled star drawn next to personal-followup names. Also carries the
 *  meaning for screen readers — the visual legend above the list is not read,
 *  so the star names itself here rather than being aria-hidden. */
function PersonalStar() {
  return (
    <Star
      role="img"
      aria-label="Your personal follow-up"
      className="ml-1.5 inline-block h-3.5 w-3.5 shrink-0 -translate-y-px fill-accent text-accent"
    />
  );
}

/** A small crown next to a leader's name — the caller's follow-up sevak or
 *  Sabha / Mandal Head / DB Manager. Distinct from the star both in shape and
 *  in colour (navy, the app's primary) so a reader glancing at a row can tell
 *  "this one is on my plate" from "this one is above me". */
function LeaderCrown() {
  return (
    <Crown
      role="img"
      aria-label="Your leader"
      className="ml-1.5 inline-block h-3.5 w-3.5 shrink-0 -translate-y-px fill-primary text-primary"
    />
  );
}

/**
 * LEADER-ONLY META — the follow-up sevak and the member's last-Sabha status.
 *
 * The backend fills `followup_name` / `last_sabha_attended` / `last_sabha_date`
 * only when the CALLER is rank >= 20 (Yuva Seva / Nimit Sevak and above); a
 * Yuvak's rows carry none of them and this renders nothing. So the block is
 * gated by the presence of the data, not by a rank check on the client — the
 * server has already decided who sees it.
 *
 * TWO DIFFERENT GATES. The follow-up name shows on EVERY enriched row — who
 * follows the member up is not sensitive. The last-Sabha status shows only on
 * rows the caller may CONTACT (`row.contact`) — the same right that reveals the
 * mobile number and draws the Call/WhatsApp buttons — so a leader sees a
 * member's attendance only for their own follow-ups and scopes they head, not
 * for wider birthday rows they can only wish. The backend already withholds the
 * fields for non-contact rows; the `row.contact` check here makes that intent
 * explicit at the render site.
 *
 * `last_sabha_attended` is a real boolean — `false` means Absent, a genuine
 * answer — so the null check is `!= null`, never a falsy test. The date drops
 * its year ("17 Aug 2026" -> "17 Aug") to sit compactly on the row, matching the
 * dashboard's Last Sabha tile.
 */
function LeaderMeta({ row }) {
  const hasFollowup = Boolean(row?.followup_name);
  const hasStatus = row?.contact === true && row?.last_sabha_attended != null;
  if (!hasFollowup && !hasStatus) return null;

  const day = row?.last_sabha_date
    ? readDate(row.last_sabha_date)?.date.replace(/\s\d{4}$/, '') || null
    : null;

  return (
    <div className="mt-1 space-y-0.5 text-xs">
      {hasFollowup && (
        <p className="truncate text-text-muted">
          <span className="text-text-faint">Follow-up:</span>{' '}
          <span className="font-medium">{row.followup_name}</span>
        </p>
      )}
      {hasStatus && (
        <p className="truncate">
          <span className="text-text-faint">Last Sabha:</span>{' '}
          <span
            className={`font-semibold ${
              row.last_sabha_attended ? 'text-success-fg' : 'text-danger-fg'
            }`}
          >
            {row.last_sabha_attended ? 'Attended' : 'Absent'}
          </span>
          {day && <span className="tnum text-text-muted"> · {day}</span>}
        </p>
      )}
    </div>
  );
}

/** TAB 1 — today's birthdays in the caller's scope, and the wishes to send them.
 *
 * Ordering + Call/WA gating come from the BACKEND per row:
 *   tier      'personal' | 'sabha' | 'mandal' | 'wider' — already sorted server-side
 *   contact   whether Call + WhatsApp are permitted for this caller on this row
 *
 * The caller's rank decides which rows get contact=true — Yuva Seva only on
 * personal followups, Sabha Head on personal + own Sabha, Mandal Head on
 * personal + own Mandal. See BirthdayUserItem in the backend schema.
 */
function SendWishes() {
  const { users, isLoading, error, refetch } = useTodayBirthdays();
  /** user_ids wished from this page — see WishButton. */
  const [sent, setSent] = useState(() => new Set());
  const markSent = (id) => setSent((prev) => new Set(prev).add(id));
  /** The member the wish popup is open for, if any. */
  const [wishing, setWishing] = useState(null);

  /** Which cohort symbols appear in the list — drives the legend above it,
   *  so a line for the star and a line for the crown only render when there
   *  is at least one row of each to explain. */
  const hasPersonal = useMemo(() => users.some((r) => r?.tier === 'personal'), [users]);
  const hasLeader = useMemo(() => users.some((r) => r?.is_leader), [users]);
  const hasLegend = hasPersonal || hasLeader;

  return (
    <>
      {isLoading ? (
        <div className="card space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : error ? (
        <div className="card">
          <ErrorState error={error} onRetry={refetch} title="Could not load today’s birthdays" />
        </div>
      ) : users.length === 0 ? (
        /* THE MOST COMMON VIEW OF THIS PAGE, most days — so it is the one that
           least deserves to look like a failed request. The same amber wash as
           the banner, minus the glows: nothing is being celebrated, but the
           page is still the birthdays page. */
        <div
          className="rounded-card px-6 py-12 text-center"
          style={{ background: 'linear-gradient(135deg, #FEF3C7 0%, #FFEDD5 50%, #FFE4CC 100%)' }}
        >
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/70 text-[#B45309]">
            <Cake className="h-7 w-7" />
          </span>
          <p className="mt-4 font-display text-base font-bold text-[#7C2D12]">No birthdays today</p>
          <p className="mt-1 text-sm text-[#9A3412]">
            Nobody in your Mandal is celebrating today — check back tomorrow.
          </p>
        </div>
      ) : (
        <>
          {/* A TABLE FROM `md` UP. TWO COLUMNS: who it is, and what to do about
              it. The Sabha rides in brackets after the name and the number sits
              under it — both qualify the name, and a column each would have
              given equal width to things only read once the name is not enough.
              Only rows the caller may reach carry a number at all, so as
              columns they would have been mostly em dashes; under the name they
              are simply absent when there is nothing to say.

              ONE BUTTON ON A DESKTOP — Wish. Call is a `tel:` link, which on a
              desktop hands off to whatever happens to be registered, and
              WhatsApp Web belongs with it: on a machine, the number is there to
              be read and dialled elsewhere. Both are on the phone layout, where
              pressing them does what they say.

              PHONES KEEP CARDS. The same call as the Yuva Seva list: a table
              narrower than its columns need is a sideways scroll, and a birthday
              is one person plus a few buttons, which fits a card. */}
          {/* LEGEND — a line per symbol that actually appears in the list, so
              a Yuvak whose Mandal Head is not celebrating today never sees the
              crown line, and vice versa. Rendered once, above the list, and
              it says the same thing to both the table and the mobile cards. */}
          {hasLegend && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-text-muted">
              {hasPersonal && (
                <span className="flex items-center gap-1.5">
                  <Star aria-hidden="true" className="h-3.5 w-3.5 fill-accent text-accent" />
                  = your personal follow-up
                </span>
              )}
              {hasLeader && (
                <span className="flex items-center gap-1.5">
                  <Crown aria-hidden="true" className="h-3.5 w-3.5 fill-primary text-primary" />
                  = your leader
                </span>
              )}
            </div>
          )}

          <div className="card hidden p-0 md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="table-th px-5 py-3.5">Member</th>
                  <th className="table-th px-5 py-3.5 !text-right">Wish them</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => {
                  const personal = row?.tier === 'personal';
                  const leader = row?.is_leader === true;
                  // Mobile number is only revealed when the caller actually has
                  // contact rights on this row — otherwise the desktop table
                  // would spill a Mandal-wide contact list to any reader.
                  const mobile = row?.contact ? row?.mobile_number ?? null : null;
                  const name = nameOf(row);

                  return (
                    <tr
                      key={row.user_id}
                      className="border-t border-line-soft transition-colors hover:bg-primary-50/40"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Initial name={name} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-primary">
                              {name}
                              {personal && <PersonalStar />}
                              {/* A row can be both — a leader who is also the
                                  caller's personal follow-up wears both marks,
                                  so the picture matches the reality. */}
                              {leader && <LeaderCrown />}
                              {/* `sabha_name` rides on every row of this
                                  endpoint. On a Mandal-wide list it is what
                                  places a name nobody recognises. */}
                              {row?.sabha_name && (
                                <span className="ml-1.5 font-normal text-text-muted">
                                  ({row.sabha_name})
                                </span>
                              )}
                            </p>
                            {/* Just the number under the name — the star
                                after the name and the legend above the list
                                already say "this one is your follow-up", so
                                the "Your follow-up" pill that used to sit
                                here would be the same signal drawn twice. */}
                            {mobile && (
                              <p className="tnum mt-0.5 truncate text-xs text-text-muted">{mobile}</p>
                            )}
                            {/* Leaders only — follow-up sevak + last-Sabha
                                status, sent by the backend for rank >= 20. */}
                            <LeaderMeta row={row} />
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end">
                          <WishButton
                            row={row}
                            sent={sent.has(row.user_id)}
                            onClick={() => setWishing(row)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {users.map((row) => {
              const personal = row?.tier === 'personal';
              const leader = row?.is_leader === true;
              const canContact = row?.contact === true;
              const mobile = canContact ? row?.mobile_number ?? null : null;
              const name = nameOf(row);
              // Personal wins the border colour if both flags apply — a
              // personal follow-up who is also a leader still reads first as
              // "yours to chase". The crown next to the name carries the
              // leader signal on its own.
              const border = personal
                ? 'border-accent/40'
                : leader
                  ? 'border-primary/30'
                  : 'border-line-soft';

              return (
                <div
                  key={row.user_id}
                  className={`flex items-start gap-3 rounded-card border bg-surface p-4 shadow-card ${border}`}
                >
                  <Initial name={name} />

                  <div className="min-w-0 flex-1">
                    {/* The same stack the table's first column carries: name,
                        Sabha in brackets, number underneath. */}
                    <p className="truncate text-sm font-bold text-primary">
                      {name}
                      {personal && <PersonalStar />}
                      {leader && <LeaderCrown />}
                      {row?.sabha_name && (
                        <span className="ml-1.5 font-normal text-text-muted">({row.sabha_name})</span>
                      )}
                    </p>
                    {mobile && (
                      <p className="tnum mt-0.5 truncate text-xs text-text-muted">{mobile}</p>
                    )}
                    {/* Leaders only — follow-up sevak + last-Sabha status. */}
                    <LeaderMeta row={row} />

                    {/* Wish always. Call + WhatsApp only when the backend says
                        this caller may reach this row — mobile only, because
                        `tel:` and WhatsApp Web on a desktop hand off to whatever
                        happens to be registered. */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <WishButton
                        row={row}
                        sent={sent.has(row.user_id)}
                        onClick={() => setWishing(row)}
                      />
                      {canContact && <CallButton row={row} mobile={mobile} />}
                      {canContact && <WhatsAppButton row={row} mobile={mobile} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* One popup for the whole list — `wishing` carries whose birthday it is
          open for. Keyed on that member so the field resets between people. */}
      <WishDialog
        person={wishing}
        isOpen={Boolean(wishing)}
        onClose={() => setWishing(null)}
        onSent={markSent}
      />
    </>
  );
}

const TABS = [
  { value: 'send', label: 'Send Wishes' },
  { value: 'received', label: 'My Wishes' },
];

export default function BirthdaysPage() {
  const [params, setParams] = useSearchParams();
  // The URL is the tab's home, not a mirror of state: the after-login popup
  // links straight to `?tab=received`, and anything unrecognised reads as the
  // first tab rather than as no tab at all.
  const tab = params.get('tab') === 'received' ? 'received' : 'send';

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div className="space-y-5">
      {/* `breadcrumbs` carries just this page. `Breadcrumbs` opens with a
          Dashboard link of its own, so passing one as the first item printed it
          twice — this was the only page in the app doing that. */}
      <PageHeader
        title="Birthdays"
        subtitle={tab === 'received' ? 'Wishes sent to you' : `Everyone celebrating today, ${today}`}
        breadcrumbs={<Breadcrumbs items={[{ label: 'Birthdays' }]} />}
      />

      {/* `replace`, so switching tabs does not stack history entries a reader
          then has to press Back through to leave the page. */}
      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(next) => setParams(next === 'send' ? {} : { tab: next }, { replace: true })}
      />

      {/* `today` stays on the header's subtitle, which is where the date is
          said now that the banner that repeated it is gone. */}
      {tab === 'received' ? <ReceivedWishes /> : <SendWishes />}
    </div>
  );
}
