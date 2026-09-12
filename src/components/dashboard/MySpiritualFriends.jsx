import { Building2, Phone, Shield, UserCheck } from 'lucide-react';
import { Skeleton } from '../ui';
import { GREETING, hasMobile, telUrl, whatsAppUrl } from '../../utils/contact';

/**
 * The three people who look after the member — Followup, Sabha Head,
 * Mandal Head — with Call and WhatsApp buttons for each.
 *
 * SAME UX AS `Profile → Followup`. The Call button is a `tel:` link and the
 * WhatsApp button opens `wa.me` with the greeting pre-filled — see
 * `utils/contact.js` for why both are keyed on the same normalised digits, and
 * `followupContact` in `ProfileCards.jsx` for the row that this card imitates.
 *
 * ONE ENTRY PER LEVEL. A Sabha or Mandal can have several heads on record
 * (Head + DB Manager, or two Heads); the card picks the FIRST head each
 * `_attach_heads` payload sends (Head before DB Manager, ordered by first
 * name). Listing every one would grow the card past the widget-column
 * budget on the dashboard and turn a "who to reach" line into a directory.
 *
 * ALL THREE ROWS ARE ALWAYS SHOWN — Followup, Sabha Head, Mandal Head — even
 * when a level has no name or no mobile on record. The card promises three
 * relationships every member has by construction, so hiding a row would read
 * as "you have no Sabha Head" rather than as "the record is missing". A row
 * with no mobile drops its Call/WhatsApp buttons; a row with no name shows a
 * dash ("—") beneath the role, since the label above already says who they are.
 *
 * The heads come from the HIERARCHY — GET /users/me resolves the caller's Sabha
 * Head and Mandal Head (first active Head-role holder for that level). Followup
 * is the caller's assigned spiritual friend. All three are self-only fields.
 */

function Row({ role, name, mobile, whatsapp, icon: Icon, tint }) {
  // Missing head/follow-up → a plain dash, per the card's "if missing, —" rule.
  const displayName = name || '—';
  const callable = hasMobile(mobile);
  const callLabel = `Call ${displayName}`;
  const chatLabel = `Message ${displayName} on WhatsApp`;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-line-soft bg-bg/50 p-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tint}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        {/* Just the name now — the role label above it was dropped; the icon on
            the left already tells the three rows apart. The NAME must show in
            full: on the narrow member-stats modal it was clipping to "Nehal P…",
            so `break-words` wraps it to a second line instead; on the wider
            dashboard card it still fits on one line. */}
        <p
          className={`break-words text-sm font-semibold ${name ? 'text-primary' : 'italic text-text-muted'}`}
        >
          {displayName}
        </p>
      </div>
      {callable ? (
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={telUrl(mobile)}
            title={callLabel}
            aria-label={callLabel}
            className="grid h-9 w-9 place-items-center rounded-control bg-primary text-white transition-transform hover:scale-105"
          >
            <Phone className="h-4 w-4" />
          </a>
          <a
            href={whatsAppUrl(whatsapp || mobile, GREETING)}
            target="_blank"
            rel="noopener noreferrer"
            title={chatLabel}
            aria-label={chatLabel}
            className="grid h-9 w-9 place-items-center rounded-control text-white transition-transform hover:scale-105"
            style={{ background: '#25D366' }}
          >
            {/* Inline SVG rather than a lucide icon — WhatsApp's mark has no
                lucide equivalent, and its wordless glyph is what the member
                recognises. Kept as inline SVG so no image request is made. */}
            <svg viewBox="0 0 32 32" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M16 3C8.82 3 3 8.82 3 16c0 2.29.6 4.44 1.66 6.32L3 29l6.86-1.62A12.94 12.94 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.6c-1.96 0-3.8-.5-5.4-1.4l-.4-.24-4.06.96 1-3.94-.28-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.32-.16-1.9-.94-2.2-1.04-.3-.12-.5-.16-.72.16-.2.32-.82 1.04-1 1.24-.18.2-.36.22-.68.08-.32-.16-1.36-.5-2.6-1.6-.96-.86-1.6-1.92-1.8-2.24-.18-.32-.02-.5.14-.66.14-.14.32-.36.48-.54.16-.18.22-.32.32-.52.1-.2.06-.4-.02-.56-.08-.16-.72-1.72-.98-2.36-.26-.62-.52-.54-.72-.54h-.62c-.2 0-.52.08-.8.4-.28.32-1.06 1.04-1.06 2.54s1.1 2.94 1.24 3.14c.16.2 2.16 3.3 5.24 4.62 3.06 1.32 3.06.88 3.62.82.54-.06 1.9-.78 2.16-1.52.28-.74.28-1.36.2-1.5-.08-.14-.28-.22-.6-.38z" />
            </svg>
          </a>
        </div>
      ) : (
        /* No mobile → no buttons, but the row still holds its place. A
           subtle dash where the buttons would sit reads as "this contact
           is on record without a number" rather than as broken UI. */
        <span className="shrink-0 text-xs text-text-muted">—</span>
      )}
    </li>
  );
}

export default function MySpiritualFriends({ me, loading, title = 'My Spiritual Friend' }) {
  // WhatsApp target for each contact: their WhatsApp number if set, else their
  // calling number. Call uses `mobile`; WhatsApp uses `whatsapp`.
  const followup = {
    name: me?.followup_by_id_name || null,
    mobile: me?.followup_id_mobile || null,
    whatsapp: me?.followup_id_whatsapp || me?.followup_id_mobile || null,
  };
  const sabhaHead = {
    name: me?.sabha_head_name || null,
    mobile: me?.sabha_head_mobile || null,
    whatsapp: me?.sabha_head_whatsapp || me?.sabha_head_mobile || null,
  };
  const mandalHead = {
    name: me?.mandal_head_name || null,
    mobile: me?.mandal_head_mobile || null,
    whatsapp: me?.mandal_head_whatsapp || me?.mandal_head_mobile || null,
  };

  // Followup + Sabha Head + Mandal Head — the three relationships every member
  // has by construction. Heads come from the hierarchy (GET /users/me resolves
  // them); a level with no head on record renders as "—" rather than dropping
  // the row, so a missing record never reads as "you have no Sabha Head".
  return (
    <div className="panel">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
          <UserCheck className="h-4 w-4" />
        </span>
        <h3 className="panel-title">{title}</h3>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-line-soft bg-bg/50 p-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2.5">
          <Row role="Followup" {...followup} icon={UserCheck} tint="bg-accent/10 text-accent" />
          <Row role="Sabha Head" {...sabhaHead} icon={Shield} tint="bg-primary-50 text-primary" />
          <Row role="Mandal Head" {...mandalHead} icon={Building2} tint="bg-success-bg text-success-fg" />
        </ul>
      )}
    </div>
  );
}
