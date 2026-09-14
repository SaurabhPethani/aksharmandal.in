const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

export function readWeekDate(value) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const month = MONTHS[Number(mo) - 1];
  if (!month) return null;
  return { key: `${y}-${mo}-${d}`, label: `${Number(d)} ${month}` };
}

export const readTime = (value) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
  return m ? `${m[1]}:${m[2]}` : null;
};

export const readClock = (value) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const hour = Number(m[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const suffix = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m[2]} ${suffix}`;
};

export const todayKey = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const daysBetween = (a, b) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
