// EVERYTHING IN THIS FILE IS PLACEHOLDER CONTENT for the Yuvak dashboard.
//
// It lives apart from the components that render it for one reason: none of it
// has a backend endpoint yet, and keeping the invented values in a single file
// makes the boundary between "real" and "not yet real" impossible to miss. The
// Yuvak screen's real data — name, QR code, Nimit Sevak, Sabha, Mandal — comes
// from full-context and /users/me and is read in the component itself.
//
// TO GO LIVE: delete the constant, add a hook, pass the query's data into the
// same prop. No layout change is needed for any of them.
//
//   QUOTES               a daily-quote endpoint (or a static file, if it stays a fixture)
//   ATTENDANCE_TREND     a per-member weekly attendance series
//   ACTIVITY_MIX         a per-member sadhana breakdown
//   UPCOMING_SABHA       the next row from the Sabha schedule
//   RECENT_PRASANGAM     the Prasangam module (no route in this app yet)
//   ACHIEVEMENTS, STATS  derived from attendance history

export const QUOTES = [
  { text: 'In selfless service to others lies the soul’s deepest bliss.', source: 'Vachanamrut Gadhada I-3' },
  { text: 'Without unwavering faith in Bhagwan, all spiritual progress is illusion.', source: 'Vachanamrut Loya 6' },
  { text: 'When the mind rests upon Bhagwan, it becomes the soul’s closest friend.', source: 'Vachanamrut Sarangpur 11' },
  { text: 'A true devotee considers every other being greater than themselves.', source: 'Shikshapatri Shlok 32' },
  { text: 'Discipline and devotion, walked together, unlock the door to liberation.', source: 'Vachanamrut Gadhada II-13' },
];

// Today's birthdays are NOT here any more — the Celebrations card reads
// GET /api/v1/users/today-birthdays through useTodayBirthdays(). Anniversaries
// left with them: the API exposes no equivalent endpoint, and invented couples
// sitting beside real birthdays would read as real too.

/** Eight weeks of attendance counts → the area-line chart. */
export const ATTENDANCE_TREND = [
  { week: 'W1', count: 1 },
  { week: 'W2', count: 2 },
  { week: 'W3', count: 1 },
  { week: 'W4', count: 3 },
  { week: 'W5', count: 2 },
  { week: 'W6', count: 4 },
  { week: 'W7', count: 5 },
  { week: 'W8', count: 6 },
];

/** Percentages, summing to at most 100 — the remainder shows as uncovered ring. */
export const ACTIVITY_MIX = [
  { label: 'Sabha', value: 45, color: '#003158' },
  { label: 'Prasangam', value: 30, color: '#FF862A' },
  { label: 'Sadhana', value: 25, color: '#10B981' },
];

export const UPCOMING_SABHA = {
  title: 'Weekly User Sabha',
  date: 'Sunday, 9 Aug 2026',
  time: '7:00 PM IST',
  topic: 'Walking the Path of Akshardham',
  speaker: 'Pujya Bhaktipriya Swami',
  attendees: 47,
  daysUntil: 2,
};

export const RECENT_PRASANGAM = [
  { id: 1, title: 'Glory of Akshardham', speaker: 'Pujya Vivekjivan Swami', duration: '38 min', daysAgo: 2, tag: 'Featured' },
  { id: 2, title: 'Living with Bhagwan', speaker: 'Pujya Bhaktipriya Swami', duration: '52 min', daysAgo: 5, tag: 'New' },
  { id: 3, title: 'The Power of Smaran', speaker: 'Pujya Aksharvatsal Swami', duration: '45 min', daysAgo: 9, tag: null },
];

/** `icon` keys into the ACHIEVEMENT_ICONS map in YuvakDashboard.jsx. */
export const ACHIEVEMENTS = [
  { id: 'first-sabha', label: 'First Sabha', icon: 'star', unlocked: true, gradient: 'linear-gradient(135deg, #FBBF24, #F97316)' },
  { id: 'ten-sabhas', label: '10 Sabhas', icon: 'trophy', unlocked: true, gradient: 'linear-gradient(135deg, #D946EF, #9333EA)' },
  { id: 'thirty-streak', label: '30-Day Streak', icon: 'flame', unlocked: false, gradient: 'linear-gradient(135deg, #FB7185, #EF4444)' },
  { id: 'listener-pro', label: 'Listener Pro', icon: 'mic', unlocked: false, gradient: 'linear-gradient(135deg, #38BDF8, #6366F1)' },
];

export const STATS = { streakDays: 14, sabhasThisMonth: 6, prasangamsHeard: 23, daysAsYuvak: 142 };
