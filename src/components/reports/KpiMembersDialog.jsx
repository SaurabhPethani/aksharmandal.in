import { Phone } from 'lucide-react';
import { Modal } from '../Overlays';
import { EmptyState, ErrorState, Skeleton } from '../ui';
import { hasMobile, telUrl, whatsAppUrl, whatsAppTarget } from '../../utils/contact';

/**
 * The people behind a Reports KPI — the popup that opens when Lapsed, Retain or
 * New is clicked.
 *
 * One row per member: NAME + SABHA | CALL | WHATSAPP. Nothing else. This is a
 * call sheet, not a directory — the API sends only what this row needs (see
 * `ReportOverviewMember` in the backend schema), and anything more would be
 * personal data handed out for the price of clicking a number.
 *
 * THE MOBILE NUMBER IS NEVER RENDERED. It arrives in the payload because the
 * two buttons need a destination, and it goes no further than their `href`.
 * Printing it would put a column of personal numbers on a screen that gets
 * shown in meetings and screenshotted into WhatsApp groups, to no benefit — the
 * reader's next action is to tap Call or WhatsApp either way.
 *
 * THE COUNT IN THE HEADING IS THE SERVER'S `total`, not `members.length`. They
 * are equal by construction — the tile's figure IS the length of the set this
 * lists — and showing the server's own number is what makes a disagreement
 * visible instead of hidden.
 *
 * EVERY MEMBER IS RENDERED; the dialog body scrolls. Sized against real data
 * rather than guessed: reports are read at Sabha Head and Mandal Head level,
 * where the largest bucket across all 14 Sabhas is 14 rows (56 for a brand-new
 * Sabha where everyone is New) and the whole-Mandal figures are 78 / 60 / 67.
 *
 * FUTURE SCOPE, if a bucket ever outgrows a scroll: cap what is rendered HERE
 * and add a "See full list" button through to a dedicated paged page. The
 * endpoint stays unpaged either way — it is what the tile's number is computed
 * from, so a truncated list must be an explicit choice on this side, shown to
 * the reader ("showing 50 of 320"), never a silent short answer.
 *
 * Reuses `utils/contact.js` for both links, so a call placed from a row and a
 * message sent from the same row always reach the same digits. The row markup
 * deliberately mirrors `MySpiritualFriends` — the app already has a "name with
 * Call and WhatsApp" row and a second dialect of it would read as a different
 * feature.
 */

/** WhatsApp's mark, inline so the row makes no image request. */
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M16 3C8.82 3 3 8.82 3 16c0 2.29.6 4.44 1.66 6.32L3 29l6.86-1.62A12.94 12.94 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.6c-1.96 0-3.8-.5-5.4-1.4l-.4-.24-4.06.96 1-3.94-.28-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.32-.16-1.9-.94-2.2-1.04-.3-.12-.5-.16-.72.16-.2.32-.82 1.04-1 1.24-.18.2-.36.22-.68.08-.32-.16-1.36-.5-2.6-1.6-.96-.86-1.6-1.92-1.8-2.24-.18-.32-.02-.5.14-.66.14-.14.32-.36.48-.54.16-.18.22-.32.32-.52.1-.2.06-.4-.02-.56-.08-.16-.72-1.72-.98-2.36-.26-.62-.52-.54-.72-.54h-.62c-.2 0-.52.08-.8.4-.28.32-1.06 1.04-1.06 2.54s1.1 2.94 1.24 3.14c.16.2 2.16 3.3 5.24 4.62 3.06 1.32 3.06.88 3.62.82.54-.06 1.9-.78 2.16-1.52.28-.74.28-1.36.2-1.5-.08-.14-.28-.22-.6-.38z" />
    </svg>
  );
}

function MemberRow({ member, index }) {
  const name = member?.name || 'Not recorded';
  const mobile = member?.mobile_number;
  // WhatsApp goes to the member's WhatsApp number (falls back to the calling
  // number); Call stays on the calling number.
  const whatsapp = whatsAppTarget(member);
  const sabhaName = member?.sabha_name || '';
  // The member's follow-up person (spiritual friend) — a NAME only, so the
  // caller knows who owns this member. `null` when nobody is assigned.
  const followup = member?.followup_name || '';
  const callable = hasMobile(mobile);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-line-soft bg-bg/50 p-3">
      {/* The position in the list, not the member id. A reader working down a
          call sheet wants to know where they are in it; the id means nothing to
          them and reads as a number they ought to recognise. */}
      <span className="tnum grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-50 text-[11px] font-bold text-primary">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-primary">{name}</p>
        {/* THE NUMBER IS NEVER PRINTED — it is only ever the destination of the
            two buttons. A call sheet needs to reach people, not to publish their
            numbers on screen where they can be read over a shoulder or caught in
            a screenshot of the report.
            The lines below carry the member's Follow-up person and Sabha instead:
            a Mandal Head reading eleven Sabhas at once needs to know whose member
            this is and who owns the follow-up before ringing. "No mobile on
            record" joins the Sabha line when there is no number — that is not a
            number, it is the reason the buttons are missing. */}
        {followup && (
          <p className="truncate text-[11px] text-text-muted">
            Follow-up: <span className="font-medium text-primary">{followup}</span>
          </p>
        )}
        {(sabhaName || !callable) && (
          <p className="truncate text-[11px] text-text-faint">
            {sabhaName}
            {sabhaName && !callable && ' · '}
            {!callable && <span className="italic">No mobile on record</span>}
          </p>
        )}
      </div>
      {callable ? (
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={telUrl(mobile)}
            title={`Call ${name}`}
            aria-label={`Call ${name}`}
            className="grid h-9 w-9 place-items-center rounded-control bg-primary text-white transition-transform hover:scale-105"
          >
            <Phone className="h-4 w-4" />
          </a>
          <a
            // "Hi, {Name}" — this popup's greeting, and deliberately not the
            // app-wide GREETING ("Jai Swaminarayan") that the profile and
            // birthday buttons send. Those open a conversation with somebody the
            // sender already knows; this one opens a follow-up call to a member
            // who has stopped coming, where naming them is the point.
            href={whatsAppUrl(whatsapp, `Hi, ${name}`)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Message ${name} on WhatsApp`}
            aria-label={`Message ${name} on WhatsApp`}
            className="grid h-9 w-9 place-items-center rounded-control text-white transition-transform hover:scale-105"
            style={{ background: '#25D366' }}
          >
            <WhatsAppGlyph />
          </a>
        </div>
      ) : (
        /* No number → no buttons, but the row keeps its place. A member with no
           mobile on record is exactly who somebody needs to notice is
           unreachable; dropping the row would hide them. */
        <span className="shrink-0 text-xs text-text-muted">—</span>
      )}
    </li>
  );
}

export default function KpiMembersDialog({ isOpen, onClose, card, query }) {
  const { members = [], total = 0, isLoading, error, refetch } = query ?? {};

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={card ? `${card.label} — ${total} ${total === 1 ? 'member' : 'members'}` : 'Members'}
      description={card?.drilldownHint}
    >
      {isLoading ? (
        <ul className="space-y-2">
          {/* Three rows at the real row height — a taller skeleton than what
              replaces it makes the dialog jump when the list lands. */}
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[66px] w-full rounded-xl" />)}
        </ul>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} title="Could not load the member list" />
      ) : members.length === 0 ? (
        <EmptyState
          title="Nobody in this group"
          hint="No member matched this figure for the selected filters."
        />
      ) : (
        <ul className="space-y-2">
          {members.map((m, i) => (
            <MemberRow key={m.user_id ?? i} member={m} index={i} />
          ))}
        </ul>
      )}
    </Modal>
  );
}
