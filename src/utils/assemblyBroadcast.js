// Live-assembly WhatsApp broadcast — slot timing + the two message designs.
//
// The numbers come from GET /attendance/{id}/broadcast (attendanceService.broadcast).
// This file does two things: turn the sitting's start time into the five fixed
// time slots, and turn the server's numbers into the WhatsApp text the head
// forwards to the assembly group.
//
// SLOTS. Slot 1 is 30 minutes after the Sabha starts; the rest follow every
// 15 minutes (so a 9:00 PM Sabha gives 9:30 / 9:45 / 10:00 / 10:15 / 10:30 /
// 10:45 / 11:00). Each slot is a FIXED clock time: tapping it always sends that
// slot's picture, counted by real punch time, even if tapped a few minutes late.
// Because the metrics report and the mark-screen broadcast both read this list,
// adding a slot here surfaces its button (and its message) in both places at
// once.
//
// FINAL. The Final wrap-up unlocks once the `FINAL_UNLOCK_OFFSET_MIN` slot has
// passed — 10:45 for a 9:00 start — not the very last slot, so the head can send
// the summary in the 10:45–11:00 wind-down without waiting for the 11:00 mark.
//
// DELIVERY. openSabhaWhatsApp(null, msg) opens WhatsApp with the text prefilled
// but NO phone, so WhatsApp shows its share picker and the sender chooses the
// assembly group — a WhatsApp group has no number a link can target.

import { openSabhaWhatsApp } from './sabhaWhatsapp';
import { EMOJI } from './emoji';

// Slot 1 at +30 min from the start, then +15 min each. Change here to retune.
const SLOT_OFFSETS_MIN = [30, 45, 60, 75, 90, 105, 120];

// The Final summary unlocks once THIS offset has passed (10:45 for a 9:00
// start), rather than the last slot — see the FINAL note above.
const FINAL_UNLOCK_OFFSET_MIN = 105;

/** "Akshar Sarjan" → "Sarjan"; falls back to the full name. */
function shortSabha(name) {
  const s = String(name ?? '').trim();
  return s.replace(/^akshar\s+/i, '').trim() || s;
}

/** Parse "21:00" / "9:00" (24-hour HH:MM) to { h, m }, or null. */
function parseStart(time) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

/** 24-hour parts → "9:30 PM". */
function clockLabel(h, m) {
  const suffix = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * The five fixed slots for a sitting, each:
 *   label — "9:30 PM", for the button and the message header
 *   asOf  — ISO datetime in IST (sitting date + slot clock), sent to the API
 *   at    — the same instant as a Date, for the locked-until-due check
 * Returns [] when the sitting has no usable start time (a special sitting, or a
 * time the backend never set), so the caller simply renders no panel.
 */
export function assemblySlots(sabha) {
  const start = parseStart(sabha?.time);
  const date = String(sabha?.date ?? '').slice(0, 10);
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  return SLOT_OFFSETS_MIN.map((off, index) => {
    const total = start.h * 60 + start.m + off;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    const asOf = `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`;
    return { index, off, label: clockLabel(h, m), asOf, at: new Date(asOf) };
  });
}

/**
 * The instant Final unlocks — the `FINAL_UNLOCK_OFFSET_MIN` slot (10:45 for a
 * 9:00 start), NOT the last slot, so the summary can go out during the
 * 10:45–11:00 wind-down. Falls back to the last slot if that offset is missing
 * (a retuned SLOT_OFFSETS_MIN), and to null when there are no slots.
 */
export function assemblyFinalUnlock(slots) {
  if (!slots.length) return null;
  const unlock = slots.find((s) => s.off === FINAL_UNLOCK_OFFSET_MIN);
  return (unlock ?? slots[slots.length - 1]).at;
}

/** Signed delta as "▲ n" / "▼ n" / "±0". */
function delta(a, b) {
  const d = (a ?? 0) - (b ?? 0);
  if (d > 0) return `▲ ${d}`;
  if (d < 0) return `▼ ${Math.abs(d)}`;
  return '±0';
}

/** "2026-09-10" → "10-09-2026". */
function ddmmyyyy(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(value ?? '');
}

/** Current clock time in IST as "11:30 PM" — the Final's "sent at" stamp. */
function istClockNow() {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

// WhatsApp text styling ONLY — *bold*, _italic_, and emoji. No monospace ```
// block and no space-alignment (a proportional font never lines spaces up), so
// each figure stands on its own line and nothing has to fit a fixed width.

/** The interim LIVE message for one slot. Normal WhatsApp text (no monospace);
 *  em-dash label, "present/total", bold Sabha subtotal, compact spacing. */
export function buildSlotMessage(data, slotLabel) {
  const sabha = shortSabha(data.sabha_name);
  return [
    `${EMOJI.redCircle} *${sabha} — LIVE*`,
    `${EMOJI.calendar} ${ddmmyyyy(data.date)} · ${EMOJI.clock930} ${slotLabel}`,
    '',
    `Yuvak — ${data.yuvak_present}/${data.yuvak_total}`,
    `NS — ${data.ns_present}/${data.ns_total}`,
    `*${sabha} — ${data.own_present}/${data.own_total} (${pctOf(data.own_present, data.own_total)}%)*`,
    '',
    `${EMOJI.clock5} _Last Sabha : ${data.last_same_time} (${delta(data.own_present, data.last_same_time)})_`,
    `${EMOJI.house} Other Sabha: ${data.other_present}`,
    `${EMOJI.check} *Total present: ${data.total_present}*`,
    '',
    `${EMOJI.target} *Focus 36* · Total: ${data.focus_total ?? 0}`,
    `${EMOJI.check} Present today: ${data.focus_present ?? 0} (${pctOf(data.focus_present, data.focus_total)}%)`,
    `${EMOJI.pray} _Jay Swaminarayan_`,
  ].join('\n');
}

/** The FINAL wrap-up message. `nowLabel` is the live "sent at" time (IST). */
export function buildFinalMessage(data, nowLabel = istClockNow()) {
  const sabha = shortSabha(data.sabha_name);
  return [
    `${EMOJI.check} *${sabha} — FINAL*`,
    `${EMOJI.calendar} ${ddmmyyyy(data.date)} · ${EMOJI.clock930} ${nowLabel}`,
    '',
    `Yuvak — ${data.yuvak_present}/${data.yuvak_total}`,
    `NS — ${data.ns_present}/${data.ns_total}`,
    `*${sabha} — ${data.own_present}/${data.own_total} (${pctOf(data.own_present, data.own_total)}%)*`,
    '',
    `${EMOJI.barChart} Total : ${data.today_closed}/${data.last_closed} (${delta(data.today_closed, data.last_closed)})`,
    `${EMOJI.house} Other Sabha: ${data.other_present}`,
    `${EMOJI.check} *Total present: ${data.total_present}*`,
    '',
    `${EMOJI.chartUp} *Attendance frequency*`,
    `Monthly once — ${data.freq_monthly_once}`,
    `Monthly twice — ${data.freq_monthly_twice}`,
    '',
    // Consecutive misses ENDING TODAY: "1 Sabha" = absent today but present
    // last Sabha ... "4 Sabha" = absent today + the previous three.
    `${EMOJI.warning} *Absent (in a row)*`,
    `1 Sabha — ${data.absent_1}`,
    `2 Sabha — ${data.absent_2}`,
    `3 Sabha — ${data.absent_3}`,
    `4 Sabha — ${data.absent_4 ?? 0}`,
    '',
    `${EMOJI.target} *Focus 36* · Total: ${data.focus_total ?? 0}`,
    `${EMOJI.check} Present today: ${data.focus_present ?? 0} (${pctOf(data.focus_present, data.focus_total)}%)`,
    `${EMOJI.pray} _Jay Swaminarayan_`,
  ].join('\n');
}

// ── "Final New" — the ALIGNED variant (temporary second button). ─────────────
// Same content and order as Final, but the three number blocks sit inside
// WhatsApp monospace fences so the columns line up on every phone. Inside a
// fence WhatsApp shows plain text (no bold), so bold stays on the lines
// outside. Labels are padded to a fixed width; numbers right-aligned to 3.
const MONO = '```';
const n3 = (v) => String(v ?? 0).padStart(3);
/** "Yuvak    68 / 197" — label padded to 7, both numbers right-aligned. */
const row = (label, present, total, extra = '') =>
  `${String(label).padEnd(7)} ${n3(present)} / ${n3(total)}${extra}`;
/** "Monthly once   199" — label padded to `width`, value right-aligned. */
const kv = (label, value, width) => `${String(label).padEnd(width)}${n3(value)}`;

export function buildFinalNewMessage(data, nowLabel = istClockNow()) {
  const sabha = shortSabha(data.sabha_name);
  // Layout per the team's approved sample: each number block sits in its own
  // monospace fence directly under its heading, with NO blank line before or
  // after a fence — only one blank line, between "Total present" and the
  // frequency heading.
  return [
    `${EMOJI.check} *${sabha} — FINAL*`,
    `${EMOJI.calendar} ${ddmmyyyy(data.date)} · ${EMOJI.clock930} ${nowLabel}`,
    MONO,
    row('Yuvak', data.yuvak_present, data.yuvak_total),
    row('NS', data.ns_present, data.ns_total),
    '─────────────────',
    row(sabha, data.own_present, data.own_total, `  (${pctOf(data.own_present, data.own_total)}%)`),
    MONO,
    `${EMOJI.barChart} Total vs Last Sabha: ${data.today_closed} / ${data.last_closed}  (${delta(data.today_closed, data.last_closed)})`,
    `${EMOJI.house} Other Sabha: ${data.other_present}`,
    `${EMOJI.check} *Total present: ${data.total_present}*`,
    '',
    `${EMOJI.chartUp} *Attendance frequency*`,
    MONO,
    kv('Monthly once', data.freq_monthly_once, 15),
    kv('Monthly twice', data.freq_monthly_twice, 15),
    MONO,
    `${EMOJI.warning} *Absent (in a row)*`,
    MONO,
    kv('1 Sabha', data.absent_1, 8),
    kv('2 Sabha', data.absent_2, 8),
    kv('3 Sabha', data.absent_3, 8),
    kv('4 Sabha', data.absent_4, 8),
    MONO,
    `${EMOJI.target} *Focus 36* · Total: ${data.focus_total ?? 0}`,
    `${EMOJI.check} Present today: ${data.focus_present ?? 0} (${pctOf(data.focus_present, data.focus_total)}%)`,
    `${EMOJI.pray} _Jay Swaminarayan_`,
  ].join('\n');
}

/** The "NS Absent" message — the Sabha's Nimit Sevaks not yet present, one per
 *  line. `data.names` comes from GET /attendance/{id}/ns-absent. */
export function buildNsAbsentMessage(data) {
  const names = Array.isArray(data?.names) ? data.names : [];
  const lines = ["*NS Absent in today's sabha*", ''];
  if (!names.length) lines.push(`All Nimit Sevaks present ${EMOJI.pray}`);
  else lines.push(...names);
  return lines.join('\n');
}

/** The "Focus 36 absent" message — the Sabha's Focus 36 members not present at
 *  this sitting, grouped under their follow-up person (bold), one "* Name" line
 *  each, groups separated by a blank line; members with no follow-up person
 *  come last under "No follow-up". `data` is GET /attendance/{id}/focus-absent. */
export function buildFocusAbsentMessage(data) {
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const lines = ['*Focus 36*', '', '*Kindly give reason for absent focus 36*'];
  if (!groups.length) {
    lines.push('', `All Focus 36 members present ${EMOJI.pray}`);
    return lines.join('\n');
  }
  for (const g of groups) {
    lines.push('', `*${g.followup_name || 'No follow-up'}*`);
    for (const name of g.members || []) lines.push(`* ${name}`);
  }
  return lines.join('\n');
}

/** Open WhatsApp's share picker with a message prefilled (no phone → the sender
 *  picks the assembly group). Thin pass-through so callers import one module. */
export function sendAssemblyBroadcast(message) {
  return openSabhaWhatsApp(null, message);
}
