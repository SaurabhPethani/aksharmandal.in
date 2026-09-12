// Reading the API's `YYYY-MM-DD` dates and `HH:MM` times, and printing them.
//
// ⚠ NEVER `new Date("2026-07-24")`. A bare date string is parsed as UTC and
// rendered in local time, so a date on the 1st shows as the 31st for anyone west
// of Greenwich — and once a weekday is printed beside it, it names the wrong day
// too. Everything here splits the string by hand, and the one place a Date is
// built (to get the weekday) is built AND read in UTC.
//
// Was `sabhaDate.js`, and named for its first caller rather than for what it
// does. The Attendance cards, the Mark Attendance page and the Birthdays page
// all print dates the same way, and every copy of this that got made drifted
// into its own answer for a date near midnight.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * `YYYY-MM-DD` -> everything a screen prints about it, or null.
 *
 *   key    `2026-07-24`, for comparing one date against another
 *   date   `24 Jul 2026`
 *   day    `Friday`
 */
export function readDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const [, y, mo, d] = m;

  const at = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(at.getTime())) return null;

  return {
    key: `${y}-${mo}-${d}`,
    date: `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`,
    day: DAYS[at.getUTCDay()],
  };
}

/**
 * `DD-MM-YYYY` -> `{ key, label }`, or null.
 *
 * ⚠ A SECOND DATE FORMAT, AND THE ONLY ONE. `/report-overview`'s attendance
 * trend writes `week_date` as "20-07-2026" — day first — where every other date
 * in this API is `YYYY-MM-DD`. `readDate` above rejects it (its regex wants four
 * digits first), and `new Date("20-07-2026")` is Invalid Date in every engine
 * that matters, so a chart built on it silently plotted "—" for every tick.
 *
 *   key    `2026-07-20`, so weeks sort as strings and match `readDate`'s key
 *   label  `20 Jul`, the axis tick — no year, because a 12-week window is read
 *          as a sequence and the year would repeat under all twelve
 */
export function readWeekDate(value) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const month = MONTHS[Number(mo) - 1];
  if (!month) return null;
  return { key: `${y}-${mo}-${d}`, label: `${Number(d)} ${month}` };
}

/** "21:00:00" and "8:00" both read as the clock time the backend meant. */
export const readTime = (value) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
  return m ? `${m[1]}:${m[2]}` : null;
};

/**
 * The same clock time as people say it: "21:00" -> "9:00 PM".
 *
 * The API keeps times on the 24-hour clock, which is the right way to STORE one
 * and not how anyone in a Mandal describes when Sabha starts. Used where a time
 * is read as a plain fact rather than scanned in a column — the dashboard's
 * Upcoming Sabha tile — while `readTime` stays for the tables, where 24-hour
 * values sort and align without a two-letter suffix ragging the edge.
 *
 * Midnight and noon are the two the arithmetic gets wrong if written carelessly:
 * hour 0 is 12 AM and hour 12 is 12 PM, neither of which is `h % 12`.
 */
export const readClock = (value) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const hour = Number(m[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const suffix = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m[2]} ${suffix}`;
};

/** Today, as a `key` comparable with the one above. Local, because "today" is. */
export const todayKey = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Days between two keys, positive when `a` is later. */
export const daysBetween = (a, b) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
