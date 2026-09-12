import { CalendarCheck, CalendarClock, CheckCircle2, Hourglass, XCircle } from 'lucide-react';
import { Modal } from '../Overlays';
import { Skeleton } from '../ui';
import OverviewStat from './OverviewStat';
import MySpiritualFriends from './MySpiritualFriends';
import { AttendanceTrendCard, AttendanceYearDonut, Ratio, formatSabhaAge } from './AttendanceCharts';
import { useMemberStats } from '../../hooks/useUserAdmin';
import { readDate } from '../../utils/dates';

// Friendly, status-aware wording — never the raw backend/404 text. The API
// client throws an ApiError carrying the HTTP `status`.
function friendlyError(error) {
  const status = error?.status;
  if (status === 403) return "You don't have access to this member's dashboard — they may be outside your Sabha/Mandal.";
  if (status === 404) return "We couldn't find this member's records. They may have been moved or removed.";
  if (status === 401) return 'Your session has expired. Please sign in again.';
  return 'Something went wrong loading the stats. Please check your connection and try again.';
}

// A member's "My Dashboard" figures, shown to a rank >= 20 leader for anyone in
// their hierarchy — Sabha age, total / last-4w / last-8w / last-52w attendance,
// last Sabha, and their spiritual friend (follow-up person) with Call + a
// "Jai Swaminarayan" WhatsApp button. Backed by
// GET /dashboard-overview/member/{id}, which enforces scope + rank.
//
// A bottom-sheet on phones (see Overlays.Modal) and a centred dialog on desktop,
// scrolling internally — so the rich content reads like the dashboard it mirrors
// without leaving the list the reader opened it from.

export default function MemberStatsDialog({ userId, isOpen, onClose }) {
  // Only fetch while open, and re-fetch per member (the hook keys on userId).
  const query = useMemberStats(userId, isOpen);
  const d = query.data;
  const stats = d?.stats;
  const total = stats?.total_sabha_present;
  const last4 = stats?.present_in_last_4w;
  const lastSabha = stats?.last_sabha;
  // The last Sabha's real day, shown inline with the verdict — year dropped to
  // match the tile on the member's own dashboard. See MyDashboard for the why.
  const lastSabhaDay =
    (lastSabha?.date ? readDate(lastSabha.date)?.date.replace(/\s\d{4}$/, '') : null) || null;
  const age = formatSabhaAge(stats?.sabha_age);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={d?.full_name || 'Member'}
      description={d?.sabha_name || undefined}
      size="lg"
    >
      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : query.error ? (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-primary">Couldn&apos;t load this member&apos;s stats</p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-text-muted">{friendlyError(query.error)}</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-full border border-line-soft px-5 text-sm font-semibold text-primary transition-colors hover:border-accent/40 hover:bg-bg"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Four tiles — the same figures and wording as the member's own
              dashboard, minus the self-only ones (birthdays, upcoming, events). */}
          <div className="grid grid-cols-2 gap-3">
            <OverviewStat
              wrapLabel
              label="Sabha Age"
              icon={Hourglass}
              iconClass="bg-primary-50 text-primary"
              value={age}
              sub={age ? null : 'Joining date not recorded'}
            />
            <OverviewStat
              wrapLabel
              label="Total Sabha Attended"
              icon={CalendarClock}
              iconClass="bg-accent/10 text-accent"
              value={total ? <Ratio part={total.attended} whole={total.total_sabha} /> : null}
              sub={total?.total_sabha ? null : 'No attendance recorded yet'}
            />
            <OverviewStat
              wrapLabel
              label="Last 4 Weeks"
              icon={CalendarCheck}
              iconClass="bg-success-bg text-success-fg"
              value={last4 ? <Ratio part={last4.attended} whole={last4.total} /> : null}
              tone={last4?.not_attended ? 'attention' : 'good'}
            />
            <OverviewStat
              wrapLabel
              label="Last Sabha"
              icon={lastSabha?.attended ? CheckCircle2 : XCircle}
              iconClass={lastSabha?.attended ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'}
              phrase
              value={
                lastSabha ? (
                  <>
                    {lastSabha.attended ? 'Attended' : 'Not Attended'}
                    {lastSabhaDay && (
                      <span className="ml-1 font-normal text-text-faint">· {lastSabhaDay}</span>
                    )}
                  </>
                ) : null
              }
              tone={lastSabha?.attended ? 'good' : 'attention'}
            />
          </div>

          {/* Spiritual friend (follow-up person) with Call + WhatsApp — reuses
              the member's own card, keyed on the fields the endpoint returns. */}
          <MySpiritualFriends
            title="Spiritual Friend"
            loading={false}
            me={{
              followup_by_id_name: d?.spiritual_friend_name || null,
              followup_id_mobile: d?.spiritual_friend_mobile || null,
              followup_id_whatsapp: d?.spiritual_friend_whatsapp || null,
            }}
          />

          <AttendanceTrendCard weeks={stats?.last_8w} title="Last 8 Weeks" />
          <AttendanceYearDonut year={stats?.last_52w} title="Last 52 Weeks" />
        </div>
      )}
    </Modal>
  );
}
