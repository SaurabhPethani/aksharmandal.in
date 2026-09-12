// The two ready-to-send WhatsApp reports a Sabha DB manager fires off to each
// follow-up person (a "head") from the Sabha report drill-down:
//
//   Full   (Design A) — the head's whole roster: turnout, weekly trend, then
//                        everyone grouped absent-first with numbers to call,
//                        then the present list.
//   Absent (Design B) — a short nudge: turnout line and only the people to
//                        follow up, with their numbers.
//
// Both are built from the SAME mapped rows the table already has (person +
// their members, via readPersonRow), so nothing extra is fetched. The message
// is plain WhatsApp text — *bold* and emoji only, no column alignment (a
// proportional font never lines spaces up), so every line stands on its own.

import { isPresent, weekLabel } from './reportFilters';

/** A member's last-four-weeks strip, OLDEST → NEWEST so the rightmost box is
 *  this week. `columns` arrive newest-first (the table's order), so reverse. */
function strip(member, columnsNewestFirst) {
  return [...columnsNewestFirst]
    .reverse()
    .map((w) => (isPresent(member, w) ? '✅' : '⬜'))
    .join('');
}

/** Digits only. */
const digits = (mobile) => String(mobile ?? '').replace(/\D/g, '');

/** For display in the message: "99871 83050" for a 10-digit number. */
function prettyPhone(mobile) {
  const d = digits(mobile);
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

/** The wa.me target: a 10-digit Indian number gets the 91 country code; a
 *  number that already carries one is left alone. */
export function waNumber(mobile) {
  const d = digits(mobile);
  if (!d) return '';
  return d.length === 10 ? `91${d}` : d;
}

/** How many of these members were present in the given week. */
const presentInWeek = (members, week) =>
  members.filter((m) => isPresent(m, week)).length;

/**
 * One member as SHORT stacked lines, so nothing wraps on a phone:
 *
 *   Vikas Jain
 *   📞 98708 91156          ← only when `withPhone` and a number is on file
 *   ⬜⬜⬜⬜ — (0/4)
 *
 * The caller puts a blank line before each block, which is what separates one
 * person from the next.
 */
function memberBlock(member, columns, withPhone) {
  const out = [member.name];
  if (withPhone && digits(member.mobile)) out.push(`📞 ${prettyPhone(member.mobile)}`);
  out.push(`${strip(member, columns)} — (${member.present}/${member.total || columns.length})`);
  return out;
}

/** The Sabha's short name for the message — a leading "Akshar" is dropped, so
 *  "Akshar Sarjan" reads simply as "Sarjan". Falls back to the full name if
 *  stripping would leave nothing. */
function shortSabha(name) {
  const s = String(name ?? '').trim();
  return s.replace(/^akshar\s+/i, '').trim() || s;
}

/** The signature line — the logged-in manager's name, or a neutral fallback so
 *  a message is never signed blank. */
const signOff = (senderName) => String(senderName || '').trim() || 'Sabha DB team';

/** Split the roster into absent-this-week and present-this-week (latest week). */
function splitByLatest(members, latestWeek) {
  const absent = [];
  const present = [];
  for (const m of members) (isPresent(m, latestWeek) ? present : absent).push(m);
  return { absent, present };
}

/**
 * Design A — the full weekly roster for one head.
 *
 * @param person   the follow-up person row (mapped: name, mobile).
 * @param members  their members (mapped rows).
 * @param opts     { sabhaName, columns } — columns newest-first week keys.
 */
export function buildFullMessage(person, members, {
  sabhaName, columns, senderName,
  // Labels default to the weekly report; the live single-sitting page overrides
  // them ('Sitting of', 'Last 4 sittings', ' (live)', 'this sitting').
  periodLabel = 'Week of', trendLabel = 'Weekly present', liveSuffix = '', presentThis = 'this week',
}) {
  const sabha = shortSabha(sabhaName);
  const latest = columns[0];
  const weeklyOldToNew = [...columns].reverse();
  const { absent, present } = splitByLatest(members, latest);
  const total = members.length;
  const presentNow = present.length;
  const pct = total ? Math.round((presentNow / total) * 100) : 0;
  const trend = weeklyOldToNew.map((w) => presentInWeek(members, w)).join(' › ');

  const lines = [];
  lines.push(`🪷 *${sabha} — Sabha Report*`);
  lines.push(`🗓️ ${periodLabel} ${latest ? weekLabel(latest) : '—'}${liveSuffix}`);
  lines.push('');
  lines.push(`👤 *${person.name}* · ${total} ${total === 1 ? 'yuvak' : 'yuvaks'}`);
  lines.push(`✅ Present ${presentNow}   ❌ Absent ${absent.length}   (${pct}%)`);
  if (weeklyOldToNew.length) lines.push(`📈 ${trendLabel}: ${trend}`);

  if (absent.length) {
    lines.push('');
    lines.push(`*❌ To connect (${absent.length})*`);
    for (const m of absent) lines.push('', ...memberBlock(m, columns, true));
  }

  if (present.length) {
    lines.push('');
    lines.push(`*✅ Present ${presentThis} (${present.length})*`);
    for (const m of present) lines.push('', ...memberBlock(m, columns, false));
  }

  lines.push('');
  lines.push('🙏 Jay Swaminarayan');
  lines.push(`_${signOff(senderName)}_`);
  return lines.join('\n');
}

/**
 * Design B — the short "who to call" nudge for one head.
 */
export function buildAbsentMessage(person, members, {
  sabhaName, columns, senderName, liveSuffix = '', presentThis = 'this week',
}) {
  const sabha = shortSabha(sabhaName);
  const latest = columns[0];
  const { absent, present } = splitByLatest(members, latest);
  const total = members.length;

  const lines = [];
  lines.push(`🪷 *${sabha}* · ${latest ? weekLabel(latest) : '—'}${liveSuffix}`);
  lines.push(`*${person.name}* — your list ${presentThis}`);
  lines.push('');
  lines.push(`Turnout *${present.length} / ${total}* ✅  ·  *${absent.length}* to follow up ❌`);

  if (!absent.length) {
    lines.push('');
    lines.push('🎉 Everyone was present this week — nothing to chase. 🙏');
  } else {
    lines.push('');
    lines.push('*Please connect 🙏*');
    for (const m of absent) {
      lines.push('');
      lines.push(m.name);
      if (digits(m.mobile)) lines.push(`📞 ${prettyPhone(m.mobile)}`);
      const missed = (m.total || columns.length) - m.present;
      lines.push(`missed ${missed}/${m.total || columns.length}`);
    }
    lines.push('');
    lines.push('A quick call brings them back 🙏');
  }
  lines.push(`_— ${signOff(senderName)}_`);
  return lines.join('\n');
}

/**
 * Open WhatsApp to the head's number with the message pre-filled. The manager
 * just presses send. Falls back to a plain chat compose if the head has no
 * number on record (they can pick the contact themselves).
 *
 * Uses the `whatsapp://` app link rather than a wa.me web link so the OS hands
 * straight to the WhatsApp app — no blank browser tab opening first and then
 * redirecting, and the report page the manager is on stays put behind it.
 */
export function openSabhaWhatsApp(headMobile, message) {
  const num = waNumber(headMobile);
  const text = encodeURIComponent(message);
  const url = num
    ? `whatsapp://send?phone=${num}&text=${text}`
    : `whatsapp://send?text=${text}`;
  window.location.href = url;
  return Boolean(num);
}
