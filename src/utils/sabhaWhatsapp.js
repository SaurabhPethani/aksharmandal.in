// The two ready-to-send WhatsApp reports a Sabha DB manager fires off to each
// follow-up person (a "head"), plus the assembly-group opener. Mobile port of
// the web's sabhaWhatsapp.js — identical message builders; the only change is
// DELIVERY, which goes through React Native's Linking rather than
// `window.location.href`.

import { Linking } from 'react-native';
import { isPresent, weekLabel } from './reportFilters';
import { EMOJI } from './emoji';

/** A member's last-four-weeks strip, OLDEST → NEWEST so the rightmost box is
 *  this week. `columns` arrive newest-first (the table's order), so reverse. */
function strip(member, columnsNewestFirst, absentGlyph = EMOJI.whiteBox) {
  return [...columnsNewestFirst]
    .reverse()
    .map(w => (isPresent(member, w) ? EMOJI.check : absentGlyph))
    .join('');
}

/** How many of the last-4 sittings this member missed. */
const missedOf = (member, columns) => (member.total || columns.length) - member.present;

/** The dot that flags how cold a member has gone, worst → mildest. */
function severityDot(missed, total) {
  const f = total ? missed / total : 0;
  if (f >= 1) return EMOJI.redCircle;
  if (f >= 0.6) return EMOJI.orangeCircle;
  if (f >= 0.35) return EMOJI.yellowCircle;
  return EMOJI.greenCircle;
}

/** A member to CALL — worst-first list block: dot + name, strip, phone. */
function callBlock(member, columns) {
  const out = [
    `${severityDot(missedOf(member, columns), member.total || columns.length)} *${member.name}*`,
    strip(member, columns, EMOJI.cross),
  ];
  if (digits(member.mobile)) out.push(`${EMOJI.phone} ${prettyPhone(member.mobile)}`);
  return out;
}

/** A member who was PRESENT — name + the ❌/✅ strip, no dot, no phone. */
const presentBlock = (member, columns) => [`*${member.name}*`, strip(member, columns, EMOJI.cross)];

/** Digits only. */
const digits = mobile => String(mobile ?? '').replace(/\D/g, '');

/** For display in the message: "99871 83050" for a 10-digit number. */
function prettyPhone(mobile) {
  const d = digits(mobile);
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

/** The wa.me target: a 10-digit Indian number gets the 91 country code. */
export function waNumber(mobile) {
  const d = digits(mobile);
  if (!d) return '';
  return d.length === 10 ? `91${d}` : d;
}

const presentInWeek = (members, week) => members.filter(m => isPresent(m, week)).length;

function shortSabha(name) {
  const s = String(name ?? '').trim();
  return s.replace(/^akshar\s+/i, '').trim() || s;
}

const signOff = senderName => String(senderName || '').trim() || 'Sabha DB team';

function splitByLatest(members, latestWeek) {
  const absent = [];
  const present = [];
  for (const m of members) (isPresent(m, latestWeek) ? present : absent).push(m);
  return { absent, present };
}

/** Design A — the full weekly roster for one head. */
export function buildFullMessage(
  person,
  members,
  {
    sabhaName,
    columns,
    senderName,
    periodLabel = 'Week ending',
    trendLabel = 'Weekly present',
    liveSuffix = '',
    presentThis = 'this week',
  },
) {
  const sabha = shortSabha(sabhaName);
  const latest = columns[0];
  const weeklyOldToNew = [...columns].reverse();
  const { absent, present } = splitByLatest(members, latest);
  const total = members.length;
  const presentNow = present.length;
  const pct = total ? Math.round((presentNow / total) * 100) : 0;
  const trend = weeklyOldToNew.map(w => presentInWeek(members, w)).join(' › ');

  const HR = EMOJI.lineHeavy.repeat(6);
  const rowRule = EMOJI.lineDotted.repeat(6);

  const lines = [];
  lines.push(`${EMOJI.blossom} *${sabha}* · ${periodLabel} ${latest ? weekLabel(latest) : '—'}${liveSuffix}`);
  lines.push(`Report for *${person.name}*`);
  lines.push('');
  lines.push(`${EMOJI.people} ${total} ${total === 1 ? 'yuvak' : 'yuvaks'}`);
  lines.push(`${EMOJI.check} ${presentNow} present (${pct}%)`);
  lines.push(`${EMOJI.cross} ${absent.length} absent`);
  if (weeklyOldToNew.length) lines.push(`${EMOJI.chartUp} ${trendLabel}: ${trend}`);

  if (absent.length) {
    lines.push(HR);
    lines.push(`*${EMOJI.cross} To connect (${absent.length})*`);
    lines.push('');
    const ordered = [...absent].sort(
      (a, b) => missedOf(b, columns) - missedOf(a, columns) || a.name.localeCompare(b.name),
    );
    ordered.forEach((m, i) => {
      if (i) lines.push(rowRule);
      lines.push(...callBlock(m, columns));
    });
  }

  if (present.length) {
    lines.push(HR);
    lines.push(`*${EMOJI.check} Present ${presentThis} (${present.length})*`);
    lines.push('');
    present.forEach((m, i) => {
      if (i) lines.push(rowRule);
      lines.push(...presentBlock(m, columns));
    });
  }

  lines.push(HR);
  lines.push(`${EMOJI.pray} Jay Swaminarayan`);
  lines.push(`_${signOff(senderName)}_`);
  return lines.join('\n');
}

/** Design B — the short "who to call" nudge for one head. */
export function buildAbsentMessage(
  person,
  members,
  { sabhaName, columns, senderName, liveSuffix = '', presentThis = 'this week' },
) {
  const sabha = shortSabha(sabhaName);
  const latest = columns[0];
  const { absent, present } = splitByLatest(members, latest);
  const total = members.length;

  const HR = EMOJI.lineHeavy.repeat(6);
  const rowRule = EMOJI.lineDotted.repeat(6);

  const lines = [];
  lines.push(`${EMOJI.blossom} *${sabha}* · ${latest ? weekLabel(latest) : '—'}${liveSuffix}`);
  lines.push(`Follow-up for *${person.name}*`);
  lines.push('');
  lines.push(`${EMOJI.people} ${total}`);
  lines.push(`${EMOJI.check} ${present.length} present`);
  lines.push(`${EMOJI.cross} ${absent.length} to call`);

  if (!absent.length) {
    lines.push('');
    lines.push(`${EMOJI.party} Everyone was present ${presentThis} — nothing to chase. ${EMOJI.pray}`);
    lines.push(`_— ${signOff(senderName)}_`);
    return lines.join('\n');
  }

  lines.push(HR);
  lines.push(`*Please connect ${EMOJI.pray}*`);
  lines.push('');

  const ordered = [...absent].sort(
    (a, b) => missedOf(b, columns) - missedOf(a, columns) || a.name.localeCompare(b.name),
  );
  ordered.forEach((m, i) => {
    if (i) lines.push(rowRule);
    lines.push(...callBlock(m, columns));
  });

  lines.push(HR);
  lines.push(`A quick call brings them back ${EMOJI.pray}`);
  lines.push(`_— ${signOff(senderName)}_`);
  return lines.join('\n');
}

/**
 * Open WhatsApp with the message pre-filled — to the head's number if given,
 * else the share picker (for an assembly group, which has no number a link can
 * target). Falls back to the wa.me web link if the WhatsApp app is not
 * installed. Resolves to whether a number was targeted.
 */
export async function openSabhaWhatsApp(headMobile, message) {
  const num = waNumber(headMobile);
  const text = encodeURIComponent(message);
  const appUrl = num ? `whatsapp://send?phone=${num}&text=${text}` : `whatsapp://send?text=${text}`;
  const webUrl = num ? `https://wa.me/${num}?text=${text}` : `https://wa.me/?text=${text}`;
  try {
    const canOpen = await Linking.canOpenURL(appUrl);
    await Linking.openURL(canOpen ? appUrl : webUrl);
  } catch {
    try {
      await Linking.openURL(webUrl);
    } catch {
      // Nothing to open WhatsApp with — the caller's toast covers the failure.
    }
  }
  return Boolean(num);
}
